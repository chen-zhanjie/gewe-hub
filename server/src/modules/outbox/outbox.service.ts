import { Injectable, Logger, OnModuleInit, Optional } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { MessageEnvelope } from "@gewehub/contracts";
import type { MessageNode } from "@gewehub/contracts";
import { AdminEventsService } from "../admin-events/admin-events.service.js";
import { firstText, loadConversationIdentityProfile } from "../conversations/conversation-identity.js";
import { extractRevokedMessageRef, normalizeGewePayload } from "../normalizer/normalizer.js";
import { normalizeWebhookPayload } from "../gewe/webhook-utils.js";
import { ContactsSyncService } from "../contacts/contacts-sync.service.js";
import { DeliveryService } from "../delivery/delivery.service.js";
import { buildDeliveryEventId } from "../delivery/delivery-utils.js";
import { GeweClientService, GeweRequestTimeoutError } from "../gewe/gewe-client.service.js";
import { MediaService } from "../media/media.service.js";
import { createMessageId } from "../messages/message-id.js";
import { renderMessageMarkdown, renderMessageSummary } from "../messages/message-rendering.js";
import { hydrateMessageReferencesFromLocalMessages } from "../messages/message-reference.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { buildLocalHubSendMessage } from "../send/send-utils.js";
import { transitionAfterFailure } from "./outbox-state.js";

@Injectable()
export class OutboxService implements OnModuleInit {
  private readonly logger = new Logger(OutboxService.name);
  private timer: NodeJS.Timeout | undefined;
  private drainPromise: Promise<void> | null = null;
  private wakeRequested = false;
  private readonly sendWaiters = new Map<string, Set<{
    resolve: (result: { url?: string }) => void;
    reject: (error: Error) => void;
  }>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: DeliveryService,
    private readonly contactsSync: ContactsSyncService,
    @Optional() private readonly media?: MediaService,
    @Optional() private readonly gewe?: GeweClientService,
    @Optional() private readonly adminEvents?: AdminEventsService
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      this.wake().catch((error: unknown) => this.logger.error(error));
    }, 2000);
    this.timer.unref();
  }

  async tick() {
    return this.wake();
  }

  wake(): Promise<void> {
    if (this.drainPromise) {
      this.wakeRequested = true;
      return this.drainPromise;
    }
    this.wakeRequested = false;
    this.drainPromise = this.drain().finally(() => {
      this.drainPromise = null;
      if (this.wakeRequested) void this.wake();
    });
    return this.drainPromise;
  }

  async waitForSend(sendRequestId: string, timeoutMs: number): Promise<{ url?: string }> {
    const initial = await this.readSendResult(sendRequestId);
    if (initial) return initial;

    return new Promise((resolve, reject) => {
      const waiters = this.sendWaiters.get(sendRequestId) ?? new Set();
      let timer: NodeJS.Timeout;
      const remove = () => {
        waiters.delete(waiter);
        if (waiters.size === 0) this.sendWaiters.delete(sendRequestId);
      };
      const waiter = {
        resolve: (result: { url?: string }) => { clearTimeout(timer); remove(); resolve(result); },
        reject: (error: Error) => { clearTimeout(timer); remove(); reject(error); }
      };
      waiters.add(waiter);
      this.sendWaiters.set(sendRequestId, waiters);
      timer = setTimeout(() => {
        remove();
        reject(new SendResultUnknownError("发送结果暂时无法确认，请勿自动重试"));
      }, timeoutMs);
      timer.unref();

      void this.readSendResult(sendRequestId).then((result) => {
        if (result) waiter.resolve(result);
        else void this.wake();
      }, waiter.reject);
    });
  }

  private async readSendResult(sendRequestId: string): Promise<{ url?: string } | null> {
    const current = await this.prisma.sendRequest.findUnique({
      where: { id: sendRequestId },
      include: { message: { select: { payload: true } } }
    });
    if (current?.status === "sent") return { url: extractMessageUrl(current.message?.payload) };
    if (current?.status === "failed") throw new SendFailedError(current.errorMessage ?? "发送失败");
    if (current?.status === "unknown") throw new SendResultUnknownError(current.errorMessage ?? "发送结果暂时无法确认，请勿自动重试");
    return null;
  }

  private async drain() {
    const processedTaskIds = new Set<string>();
    while (true) {
      const task = await this.claimNextTask();
      if (!task || processedTaskIds.has(task.id)) return;
      processedTaskIds.add(task.id);
      try {
        await this.handleTask(task.taskType, task.refId, task.payload);
        await this.prisma.outboxTask.update({
          where: { id: task.id },
          data: { status: "done", leaseUntil: null, lastError: null }
        });
      } catch (error) {
        if (task.taskType === "send") {
          await this.prisma.outboxTask.update({
            where: { id: task.id },
            data: {
              status: "dead",
              retryCount: task.retryCount + 1,
              nextRetryAt: null,
              leaseUntil: null,
              lastError: error instanceof Error ? error.message : String(error)
            }
          });
          continue;
        }
        const next = transitionAfterFailure({ retryCount: task.retryCount, maxRetry: task.maxRetry }, error);
        await this.prisma.outboxTask.update({
          where: { id: task.id },
          data: {
            status: next.status,
            retryCount: next.retryCount,
            nextRetryAt: next.nextRetryAt,
            leaseUntil: null,
            lastError: next.lastError
          }
        });
        if (task.taskType === "download_media" && next.status === "dead") {
          await this.media?.markMediaAssetFailedAndDeliver(task.refId, next.lastError);
        }
      }
    }
  }

  private async claimNextTask() {
    const now = new Date();
    const task = await this.prisma.outboxTask.findFirst({
      where: {
        status: "pending",
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }]
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
    });
    if (!task) return null;

    const claim = await this.prisma.outboxTask.updateMany({
      where: {
        id: task.id,
        status: "pending",
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }]
      },
      data: {
        status: "running",
        workerId: process.pid.toString(),
        leaseUntil: new Date(Date.now() + 30_000)
      }
    });

    return claim.count === 1 ? task : null;
  }

  async retry(id: string) {
    return this.prisma.outboxTask.update({
      where: { id },
      data: {
        status: "pending",
        nextRetryAt: null,
        leaseUntil: null,
        lastError: null
      }
    });
  }

  private async handleTask(taskType: string, refId: string, payload: unknown) {
    if (taskType === "process_webhook") {
      await this.processWebhook(refId);
      return;
    }
    if (taskType === "sync_contacts") {
      await this.contactsSync.syncContacts(parseSyncContactsPayload(payload, refId));
      return;
    }
    if (taskType === "sync_group_members") {
      await this.contactsSync.syncGroupMembers(parseSyncGroupMembersPayload(payload, refId));
      return;
    }
    if (taskType === "download_media") {
      if (!this.media) throw new Error("媒体服务未初始化");
      await this.media.downloadMediaAsset(refId);
      return;
    }
    if (taskType === "send") {
      if (!this.gewe) throw new Error("GeWe 服务未初始化");
      await this.processSend(refId);
      return;
    }
    throw new Error(`未注册的 outbox task_type: ${taskType}`);
  }

  private async processSend(sendRequestId: string) {
    const sendRequest = await this.prisma.sendRequest.findUniqueOrThrow({
      where: { id: sendRequestId },
      include: {
        conversation: {
          include: { account: true }
        },
        message: true
      }
    });
    const mapped = parseMappedGeweRequest(sendRequest.geweRequest);

    try {
      const prepared = await this.prepareSendRequestForGewe(sendRequest, mapped);
      await this.prisma.sendRequest.update({
        where: { id: sendRequest.id },
        data: {
          geweRequest: prepared.mapped as unknown as Prisma.InputJsonValue
        }
      });
      const geweResponse = await this.gewe!.sendByMappedRequest(prepared.mapped);
      const result = extractSendResult(geweResponse, sendRequest.id);
      const text = prepared.localContent?.text ?? extractRenderedText(sendRequest.requestPayload, sendRequest.type);
      const quote = extractQuoteMessageNode(sendRequest.requestPayload);
      const existingMessage = sendRequest.message ?? await this.prisma.message.findUnique({
        where: { sendRequestId: sendRequest.id }
      });
      const stableMessageId = existingMessage?.messageId ?? createMessageId();
      const localMessage = buildLocalHubSendMessage({
        accountWxid: sendRequest.conversation.account.wxid,
        conversationId: sendRequest.conversation.id,
        conversationWxid: sendRequest.conversation.peerWxid,
        senderWxid: sendRequest.conversation.account.wxid,
        text,
        messageId: stableMessageId,
        createTime: result.createTime,
        platformMsgId: result.msgId,
        platformNewMsgId: result.newMsgId,
        platformCreateTime: result.createTime,
        content: prepared.localContent,
        quote,
        outboundMetadata: { sent: true, deliveryMode: sendRequest.deliveryMode }
      });

      await this.prisma.message.upsert({
        where: { sendRequestId: sendRequest.id },
        create: {
          accountId: sendRequest.accountId,
          conversationId: sendRequest.conversationId,
          sendRequestId: sendRequest.id,
          ...localMessage,
          payload: localMessage.payload as unknown as Prisma.InputJsonValue
        },
        update: {
          platformMsgId: result.msgId,
          platformNewMsgId: result.newMsgId,
          platformCreateTime: result.createTime,
          type: localMessage.type,
          isSent: true,
          payload: localMessage.payload as unknown as Prisma.InputJsonValue,
          renderedText: localMessage.renderedText,
          sentAt: localMessage.sentAt
        }
      });
      await this.updateConversationAfterMessage({
        conversationId: sendRequest.conversationId,
        sentAt: localMessage.sentAt,
        renderedText: localMessage.renderedText,
        isSelf: true,
        created: !existingMessage,
        refreshSentAt: existingMessage?.isSent === false
      });
      this.adminEvents?.publishMessageChanged({
        eventType: existingMessage ? "message.updated" : "message.created",
        conversationId: sendRequest.conversationId,
        messageId: localMessage.messageId,
      });
      await this.prisma.sendRequest.update({
        where: { id: sendRequest.id },
        data: {
          status: "sent",
          errorMessage: null,
          geweResponse: geweResponse as Prisma.InputJsonValue
        }
      });
      this.completeSend(sendRequest.id, { url: extractMessageUrl(localMessage.payload) });
    } catch (error) {
      if (error instanceof GeweRequestTimeoutError) {
        const message = "GeWe 请求超时，发送结果未知，已停止自动重试以避免重复发送";
        await this.prisma.sendRequest.update({
          where: { id: sendRequest.id },
          data: {
            status: "unknown",
            errorMessage: message
          }
        });
        const unknown = new SendResultUnknownError(message);
        this.failSend(sendRequest.id, unknown);
        throw unknown;
      }
      const failed = error instanceof Error ? error : new Error(String(error));
      await this.prisma.sendRequest.update({
        where: { id: sendRequest.id },
        data: { status: "failed", errorMessage: failed.message }
      });
      this.failSend(sendRequest.id, new SendFailedError(failed.message));
      throw failed;
    }
  }

  private completeSend(sendRequestId: string, result: { url?: string }) {
    const waiters = this.sendWaiters.get(sendRequestId);
    if (!waiters) return;
    this.sendWaiters.delete(sendRequestId);
    for (const waiter of waiters) waiter.resolve(result);
  }

  private failSend(sendRequestId: string, error: Error) {
    const waiters = this.sendWaiters.get(sendRequestId);
    if (!waiters) return;
    this.sendWaiters.delete(sendRequestId);
    for (const waiter of waiters) waiter.reject(error);
  }

  private async prepareSendRequestForGewe(
    sendRequest: {
      id: string;
      accountId: string;
      conversationId: string;
      type: string;
      requestPayload: Prisma.JsonValue;
    },
    mapped: { path: string; body: unknown }
  ): Promise<{ mapped: { path: string; body: unknown }; localContent?: MessageNode }> {
    if (sendRequest.type === "voice" && mapped.path === "/gewe/v2/api/message/postVoice") {
      return this.prepareOutboundVoiceSend(sendRequest, mapped);
    }
    if (sendRequest.type === "image" && mapped.path === "/gewe/v2/api/message/postImage") {
      return this.prepareOutboundFileSend(sendRequest, mapped, "image");
    }
    if (sendRequest.type === "file" && mapped.path === "/gewe/v2/api/message/postFile") {
      return this.prepareOutboundFileSend(sendRequest, mapped, "file");
    }
    if (sendRequest.type === "video" && mapped.path === "/gewe/v2/api/message/postVideo") {
      return this.prepareOutboundFileSend(sendRequest, mapped, "video");
    }
    if (sendRequest.type === "link" && mapped.path === "/gewe/v2/api/message/postLink") {
      return this.prepareOutboundLinkSend(sendRequest, mapped);
    }
    if (sendRequest.type === "html" && mapped.path === "/gewe/v2/api/message/postLink") {
      return this.prepareOutboundHtmlSend(sendRequest, mapped);
    }
    return { mapped };
  }

  private async prepareOutboundVoiceSend(
    sendRequest: {
      accountId: string;
      conversationId: string;
    },
    mapped: { path: string; body: unknown }
  ): Promise<{ mapped: { path: string; body: unknown }; localContent?: MessageNode }> {
    if (!this.media) throw new Error("媒体服务未初始化");
    const body = asRecord(mapped.body);
    const source = asRecord(body?.source);
    const preparedVoice = await this.media.prepareOutboundVoice({
      accountId: sendRequest.accountId,
      conversationId: sendRequest.conversationId,
      contentBase64: asString(source?.contentBase64),
      mediaUrl: asString(source?.mediaUrl),
      fileUrl: asString(source?.fileUrl),
      mimeType: asString(source?.mimeType),
      fileName: asString(source?.fileName),
      durationMs: asNumber(body?.voiceDuration),
    });
    const durationMs = preparedVoice.silk.durationMs ?? asNumber(body?.voiceDuration) ?? 1;
    return {
      mapped: {
        path: mapped.path,
        body: {
          appId: asString(body?.appId),
          toWxid: asString(body?.toWxid),
          voiceUrl: preparedVoice.silk.url,
          voiceDuration: durationMs,
        }
      },
      localContent: {
        type: "voice",
        text: "[语音]",
        media: {
          status: "ready",
          url: preparedVoice.original.url,
          mimeType: preparedVoice.original.mimeType,
          fileName: preparedVoice.original.fileName,
          size: preparedVoice.original.size,
          durationMs,
        }
      }
    };
  }

  private async prepareOutboundFileSend(
    sendRequest: {
      accountId: string;
      conversationId: string;
    },
    mapped: { path: string; body: unknown },
    kind: "image" | "file" | "video"
  ): Promise<{ mapped: { path: string; body: unknown }; localContent?: MessageNode }> {
    const body = asRecord(mapped.body);
    const source = asRecord(body?.source);
    const prepared = source
      ? await this.prepareOutboundFileSource(sendRequest, source, kind)
      : readDirectOutboundFile(body, kind);
    const preparedThumbUrl =
      kind === "video"
        ? await this.prepareOutboundVideoThumbnailUrl(sendRequest, body, prepared, asString(body?.thumbUrl))
        : undefined;

    const text = kind === "image" ? "[图片]" : kind === "video" ? "[视频]" : prepared.fileName ? `[文件] ${prepared.fileName}` : "[文件]";
    return {
      mapped: {
        path: mapped.path,
        body: kind === "image"
          ? {
              appId: asString(body?.appId),
              toWxid: asString(body?.toWxid),
              imgUrl: prepared.url,
            }
          : kind === "video"
          ? {
              appId: asString(body?.appId),
              toWxid: asString(body?.toWxid),
              videoUrl: prepared.url,
              thumbUrl: preparedThumbUrl,
              videoDuration: asNumber(body?.videoDuration) ?? 1,
            }
          : {
              appId: asString(body?.appId),
              toWxid: asString(body?.toWxid),
              fileUrl: prepared.url,
              fileName: prepared.fileName,
            }
      },
      localContent: {
        type: kind,
        text,
        media: {
          status: "ready",
          url: prepared.url,
          thumbnailUrl: kind === "video" ? preparedThumbUrl : undefined,
          mimeType: prepared.mimeType,
          fileName: prepared.fileName,
          size: prepared.size,
          durationMs: kind === "video" ? (asNumber(body?.videoDuration) ?? 1) * 1000 : undefined,
        }
      }
    };
  }

  private async prepareOutboundLinkSend(
    sendRequest: {
      accountId: string;
      conversationId: string;
    },
    mapped: { path: string; body: unknown }
  ): Promise<{ mapped: { path: string; body: unknown }; localContent: MessageNode }> {
    const body = asRecord(mapped.body);
    const linkUrl = asString(body?.linkUrl) ?? "";
    const title = asString(body?.title) || defaultLinkTitle(linkUrl);
    const desc = asString(body?.desc) || linkUrl || "链接分享";
    const thumbUrl = await this.prepareOutboundThumbnailUrl(
      sendRequest,
      body,
      asString(body?.thumbUrl),
      defaultLinkThumbnailSource(),
    );
    return {
      mapped: {
        path: mapped.path,
        body: {
          appId: asString(body?.appId),
          toWxid: asString(body?.toWxid),
          title,
          desc,
          linkUrl,
          thumbUrl,
        }
      },
      localContent: {
        type: "link",
        text: `[链接] ${title}`,
        link: {
          title,
          desc,
          url: linkUrl,
          thumbnailUrl: thumbUrl,
        }
      }
    };
  }

  private async prepareOutboundHtmlSend(
    sendRequest: {
      accountId: string;
      conversationId: string;
      requestPayload: Prisma.JsonValue;
    },
    mapped: { path: string; body: unknown }
  ): Promise<{ mapped: { path: string; body: unknown }; localContent: MessageNode }> {
    const body = asRecord(mapped.body);
    const payload = asRecord(sendRequest.requestPayload);
    const linkUrl = asString(payload?.htmlPublicUrl);
    if (!linkUrl) throw new Error("HTML 发送缺少公网访问链接");
    const title = asString(body?.title) || asString(payload?.title) || "HTML 页面";
    const desc = asString(body?.desc) || asString(payload?.desc) || linkUrl;
    const thumbUrl = await this.prepareOutboundThumbnailUrl(
      sendRequest,
      body,
      asString(body?.thumbUrl),
      defaultLinkThumbnailSource(),
    );
    const geweBody = {
      appId: asString(body?.appId),
      toWxid: asString(body?.toWxid),
      title,
      desc,
      linkUrl,
      ...(thumbUrl ? { thumbUrl } : {}),
    };
    return {
      mapped: {
        path: mapped.path,
        body: geweBody
      },
      localContent: {
        type: "html",
        text: `[HTML] ${title}`,
        link: {
          title,
          desc,
          url: linkUrl,
          thumbnailUrl: thumbUrl,
        }
      }
    };
  }

  private async prepareOutboundThumbnailUrl(
    sendRequest: {
      accountId: string;
      conversationId: string;
    },
    body: Record<string, unknown> | undefined,
    fallbackThumbUrl?: string,
    fallbackSource?: Record<string, unknown>,
  ): Promise<string | undefined> {
    const source = asRecord(body?.thumbSource);
    if (source) {
      const prepared = await this.prepareOutboundFileSource(sendRequest, source, "image", "thumbnail");
      return prepared.url;
    }
    if (fallbackThumbUrl) return fallbackThumbUrl;
    if (!fallbackSource) return undefined;
    const prepared = await this.prepareOutboundFileSource(sendRequest, fallbackSource, "image", "thumbnail");
    return prepared.url;
  }

  private async prepareOutboundVideoThumbnailUrl(
    sendRequest: {
      accountId: string;
      conversationId: string;
    },
    body: Record<string, unknown> | undefined,
    preparedVideo: { path?: string; fileName?: string; url: string },
    fallbackThumbUrl?: string,
  ): Promise<string | undefined> {
    const explicit = await this.prepareOutboundThumbnailUrl(sendRequest, body, fallbackThumbUrl);
    if (explicit) return explicit;
    if (!preparedVideo.path) return undefined;
    if (!this.media) throw new Error("媒体服务未初始化");
    const prepared = await this.media.prepareOutboundVideoThumbnail({
      accountId: sendRequest.accountId,
      videoPath: preparedVideo.path,
      fileName: preparedVideo.fileName,
    });
    return prepared.url;
  }

  private async prepareOutboundFileSource(
    sendRequest: {
      accountId: string;
      conversationId: string;
    },
    source: Record<string, unknown>,
    kind: "image" | "file" | "video",
    purpose?: "thumbnail"
  ) {
    if (!this.media) throw new Error("媒体服务未初始化");
    return this.media.prepareOutboundFile({
      accountId: sendRequest.accountId,
      conversationId: sendRequest.conversationId,
      kind,
      contentBase64: asString(source.contentBase64),
      mediaUrl: asString(source.mediaUrl),
      fileUrl: asString(source.fileUrl),
      mimeType: asString(source.mimeType),
      fileName: asString(source.fileName),
      ...(purpose ? { purpose } : {}),
    });
  }

  private async processWebhook(webhookEventId: string) {
    const event = await this.prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: { processStatus: "processing" }
    });
    const rawPayload = event.rawPayload as Record<string, unknown>;
    const normalizedPayload = normalizeWebhookPayload(rawPayload);
    if (event.eventKind === "contact") {
      await this.processContactWebhook(webhookEventId, normalizedPayload);
      return;
    }
    const revokedMessageRef = extractRevokedMessageRef(rawPayload);
    if (revokedMessageRef) {
      await this.markMessageRevoked(
        webhookEventId,
        revokedMessageRef,
        asString(normalizedPayload.wxid ?? normalizedPayload.toUser)
      );
      return;
    }

    const existingByDedupe = event.dedupeKey
      ? await this.prisma.message.findUnique({ where: { dedupeKey: event.dedupeKey } })
      : null;
    const envelope = normalizeGewePayload(rawPayload, existingByDedupe?.messageId ?? createMessageId());
    if (!envelope) {
      await this.prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: { processStatus: "skipped" }
      });
      return;
    }

    const account = await this.prisma.wechatAccount.upsert({
      where: { wxid: envelope.account.wxid },
      create: {
        appId: String(normalizedPayload.appid ?? normalizedPayload.appId ?? "unknown"),
        wxid: envelope.account.wxid,
        nickname: envelope.account.name,
        source: "auto"
      },
      update: {
        appId: String(normalizedPayload.appid ?? normalizedPayload.appId ?? "unknown"),
        nickname: envelope.account.name
      }
    });
    const conversationIdentity = await loadConversationIdentityProfile(this.prisma, {
      accountId: account.id,
      peerWxid: envelope.conversation.wxid,
      type: envelope.conversation.type,
    });
    const conversationName = firstText(conversationIdentity?.name, envelope.conversation.name);
    const conversationAvatarUrl = firstText(conversationIdentity?.avatarUrl);

    const conversation = await this.prisma.conversation.upsert({
      where: {
        accountId_peerWxid: {
          accountId: account.id,
          peerWxid: envelope.conversation.wxid
        }
      },
      create: {
        accountId: account.id,
        peerWxid: envelope.conversation.wxid,
        type: envelope.conversation.type,
        name: conversationName,
        avatarUrl: conversationAvatarUrl,
        isHidden: false
      },
      update: {
        type: envelope.conversation.type,
        name: conversationName,
        avatarUrl: conversationAvatarUrl
      },
      include: {
        app: true
      }
    });

    const envelopeWithStableReferences = await resolveStableReferenceIds(
      this.prisma,
      envelope,
      account.id,
      conversation.id
    );
    const hydratedEnvelope = await hydrateMessageReferencesFromLocalMessages(
      this.prisma,
      envelopeWithStableReferences,
      account.id,
      conversation.id
    );
    if (hydratedEnvelope.renderedText !== envelope.renderedText) {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageText: hydratedEnvelope.renderedText.slice(0, 500)
        }
      });
    }

    const messageDedupeKey = event.dedupeKey ?? envelope.messageId;
    const existingMessage = existingByDedupe ?? await this.prisma.message.findUnique({
      where: { dedupeKey: messageDedupeKey }
    });
    const message = await this.prisma.message.upsert({
      where: { dedupeKey: messageDedupeKey },
      create: {
        accountId: account.id,
        conversationId: conversation.id,
        webhookEventId,
        source: "callback",
        messageId: hydratedEnvelope.messageId,
        platformMsgId: asString(normalizedPayload.msgId) ?? null,
        platformNewMsgId: asString(normalizedPayload.newMsgId) ?? null,
        platformCreateTime: asString(normalizedPayload.createTime) ?? null,
        dedupeKey: messageDedupeKey,
        type: hydratedEnvelope.content.type,
        status: hydratedEnvelope.status,
        senderWxid: hydratedEnvelope.sender.wxid,
        isSelf: hydratedEnvelope.isSelf,
        isAtMe: hydratedEnvelope.isAtMe,
        sentAt: new Date(hydratedEnvelope.sentAt),
        payload: hydratedEnvelope as unknown as Prisma.InputJsonValue,
        renderedText: hydratedEnvelope.renderedText.slice(0, 500),
        payloadVersion: hydratedEnvelope.schemaVersion
      },
      update: {
        webhookEventId,
        messageId: hydratedEnvelope.messageId,
        platformMsgId: asString(normalizedPayload.msgId) ?? null,
        platformNewMsgId: asString(normalizedPayload.newMsgId) ?? null,
        platformCreateTime: asString(normalizedPayload.createTime) ?? null,
        type: hydratedEnvelope.content.type,
        payload: hydratedEnvelope as unknown as Prisma.InputJsonValue,
        renderedText: hydratedEnvelope.renderedText.slice(0, 500),
        status: hydratedEnvelope.status,
        senderWxid: hydratedEnvelope.sender.wxid,
        isSelf: hydratedEnvelope.isSelf,
        isAtMe: hydratedEnvelope.isAtMe,
        sentAt: new Date(hydratedEnvelope.sentAt),
        payloadVersion: hydratedEnvelope.schemaVersion
      },
      include: {
        conversation: {
          include: { app: true }
        }
      }
    });
    await this.updateConversationAfterMessage({
      conversationId: conversation.id,
      sentAt: new Date(hydratedEnvelope.sentAt),
      renderedText: hydratedEnvelope.renderedText,
      isSelf: hydratedEnvelope.isSelf,
      created: !existingMessage
    });

    const mediaCount = await this.media?.enqueueMessageMedia({
      appId: asString(normalizedPayload.appid ?? normalizedPayload.appId) ?? "unknown",
      message: {
        id: message.id,
        accountId: account.id,
        payload: hydratedEnvelope
      },
      rawContent: asString(normalizedPayload.content) ?? "",
      rawMsgId: asString(normalizedPayload.msgId ?? normalizedPayload.newMsgId) ?? message.platformMsgId ?? message.platformNewMsgId ?? hydratedEnvelope.messageId
    }) ?? 0;
    if (mediaCount === 0) {
      await this.delivery.createForMessage(message);
    }
    this.adminEvents?.publishMessageChanged({
      eventType: "message.created",
      conversationId: message.conversationId,
      messageId: message.messageId,
    });
    await this.prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: { processStatus: "processed" }
    });
  }

  private async updateConversationAfterMessage(input: {
    conversationId: string;
    sentAt: Date;
    renderedText: string;
    isSelf: boolean;
    created: boolean;
    refreshSentAt?: boolean;
  }) {
    const data: Prisma.ConversationUpdateInput = input.created
      ? {
          lastMessageAt: input.sentAt,
          lastMessageText: input.renderedText.slice(0, 500),
          messageCount: { increment: 1 },
          ...(input.isSelf ? {} : { unreadCount: { increment: 1 } }),
          isHidden: false
        }
      : {
          ...(input.refreshSentAt ? { lastMessageAt: input.sentAt, isHidden: false } : {}),
          lastMessageText: input.renderedText.slice(0, 500)
        };
    await this.prisma.conversation.update({
      where: { id: input.conversationId },
      data
    });
  }

  private async processContactWebhook(webhookEventId: string, payload: Record<string, unknown>) {
    const accountWxid = asString(payload.wxid);
    const appId = asString(payload.appid ?? payload.appId);
    const changedWxid = extractChangedContactWxid(payload);
    if (!accountWxid || !appId || !changedWxid) {
      await this.prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: { processStatus: "skipped" }
      });
      return;
    }

    const account = await this.prisma.wechatAccount.upsert({
      where: { wxid: accountWxid },
      create: {
        appId,
        wxid: accountWxid,
        source: "auto"
      },
      update: {
        appId
      }
    });
    await this.contactsSync.syncContact({
      accountId: account.id,
      appId,
      wxid: changedWxid,
      deleted: asString(payload.msgType) === "DEL_CONTACTS"
    });
    await this.prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: { processStatus: "processed" }
    });
  }

  private async markMessageRevoked(
    webhookEventId: string,
    ref: { platformNewMsgId: string | null; platformMsgId: string | null },
    accountWxid: string | undefined
  ) {
    const revokedAt = new Date();
    const target = ref.platformNewMsgId
      ? await this.prisma.message.findFirst({
          where: {
            platformNewMsgId: ref.platformNewMsgId,
            ...(accountWxid ? { account: { wxid: accountWxid } } : {})
          },
          include: { conversation: { include: { app: true } } }
        })
      : ref.platformMsgId
        ? await this.prisma.message.findFirst({
            where: {
              platformMsgId: ref.platformMsgId,
              ...(accountWxid ? { account: { wxid: accountWxid } } : {})
            },
            include: { conversation: { include: { app: true } } }
          })
        : null;

    if (!target) {
      await this.prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: { processStatus: "skipped" }
      });
      return;
    }

    const payload = target.payload as unknown as MessageEnvelope;
    const revokedPayload: MessageEnvelope = {
      ...payload,
      eventType: "message.revoked",
      status: "revoked",
      revokedAt: revokedAt.toISOString()
    };

    const message = await this.prisma.message.update({
      where: { id: target.id },
      data: {
        status: "revoked",
        revokedAt,
        payload: revokedPayload as unknown as Prisma.InputJsonValue
      },
      include: {
        conversation: {
          include: { app: true }
        }
      }
    });

    await this.createRevokedDeliveriesForReceivedApps(message.id, message.messageId, revokedPayload);
    this.adminEvents?.publishMessageChanged({
      eventType: "message.revoked",
      conversationId: message.conversationId,
      messageId: message.messageId,
    });
    await this.prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: { processStatus: "processed" }
    });
  }

  private async createRevokedDeliveriesForReceivedApps(
    dbMessageId: string,
    publicMessageId: string,
    payload: MessageEnvelope,
  ): Promise<void> {
    const createdDeliveries = await this.prisma.delivery.findMany({
      where: {
        messageId: dbMessageId,
        eventType: "message_created",
      },
      select: {
        appId: true,
        status: true,
        payload: true,
      },
    });
    const receivedAppIds = new Set(
      createdDeliveries
        .filter((delivery) => delivery.status === "delivered" || delivery.status === "acked")
        .map((delivery) => delivery.appId),
    );
    if (receivedAppIds.size > 0) {
      for (const appId of receivedAppIds) {
        const eventId = buildDeliveryEventId(publicMessageId, appId, "message.revoked");
        await this.prisma.delivery.upsert({
          where: { eventId },
          create: {
            appId,
            messageId: dbMessageId,
            eventId,
            eventType: "message_revoked",
            payload: payload as unknown as Prisma.InputJsonValue,
            status: "queued",
          },
          update: {
            payload: payload as unknown as Prisma.InputJsonValue,
          },
        });
      }
      return;
    }
    await this.prisma.delivery.updateMany({
      where: {
        messageId: dbMessageId,
        eventType: "message_created",
        status: { in: ["queued", "delivering"] },
      },
      data: {
        status: "acked",
        ackedAt: new Date(),
      },
    });
  }
}

function parseSyncContactsPayload(payload: unknown, refId: string) {
  const record = asRecord(payload);
  return {
    accountId: asString(record?.accountId) ?? refId,
    mode: asString(record?.mode) === "cache" ? "cache" as const : "full" as const
  };
}

export class SendFailedError extends Error {
  readonly code = "SEND_FAILED";
  constructor(message: string) {
    super(message);
    this.name = "SendFailedError";
  }
}

export class SendResultUnknownError extends Error {
  readonly code = "SEND_RESULT_UNKNOWN";
  constructor(message: string) {
    super(message);
    this.name = "SendResultUnknownError";
  }
}

function parseSyncGroupMembersPayload(payload: unknown, refId: string) {
  const record = asRecord(payload);
  return {
    groupId: asString(record?.groupId) ?? refId
  };
}

function parseMappedGeweRequest(value: Prisma.JsonValue | null): { path: string; body: unknown } {
  const record = asRecord(value);
  const path = asString(record?.path);
  if (!path) throw new Error("发送请求缺少 GeWe path");
  if (!path.startsWith("/gewe/v2/api/message/")) {
    throw new Error(`不允许的 GeWe 发送路径: ${path}`);
  }
  return {
    path,
    body: normalizeMappedGeweBody(path, record?.body ?? {})
  };
}

function normalizeMappedGeweBody(path: string, body: unknown): unknown {
  if (path !== "/gewe/v2/api/message/postText") return body;
  const record = asRecord(body);
  if (!record) return body;
  const ats = normalizeTextAts(record.ats);
  const { ats: _oldAts, ...rest } = record;
  return ats ? { ...rest, ats } : rest;
}

function normalizeTextAts(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const ats = value.map((entry) => asString(entry)?.trim()).filter(Boolean).join(",");
    return ats || undefined;
  }
  return asString(value)?.trim() || undefined;
}

function readDirectOutboundFile(body: Record<string, unknown> | undefined, kind: "image" | "file" | "video") {
  const url = kind === "image"
    ? asString(body?.imgUrl ?? body?.imageUrl ?? body?.mediaUrl)
    : kind === "video"
    ? asString(body?.videoUrl ?? body?.mediaUrl ?? body?.fileUrl)
    : asString(body?.fileUrl ?? body?.mediaUrl);
  if (!url) throw new Error("发送请求缺少媒体 URL");
  const fileName = asString(body?.fileName) ?? (kind === "image" ? "image" : kind === "video" ? "video.mp4" : "file");
  return {
    url,
    mimeType: asString(body?.mimeType) ?? (kind === "image" ? "image/jpeg" : kind === "video" ? "video/mp4" : "application/octet-stream"),
    fileName,
    size: asNumber(body?.size) ?? 0,
  };
}

function defaultLinkTitle(linkUrl: string): string {
  try {
    return new URL(linkUrl).hostname || linkUrl || "链接";
  } catch {
    return linkUrl || "链接";
  }
}

function defaultLinkThumbnailSource(): Record<string, unknown> {
  return {
    contentBase64: DEFAULT_LINK_THUMBNAIL_JPEG_BASE64,
    mimeType: "image/jpeg",
    fileName: "link-thumbnail.jpg",
  };
}

const DEFAULT_LINK_THUMBNAIL_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYyLjI4LjEwMQD/2wBDAAgKCgsKCw0NDQ0NDRAPEBAQEBAQEBAQEBASEhIVFRUSEhIQEBISFBQVFRcXFxUVFRUXFxkZGR4eHBwjIyQrKzP/xABMAAEBAAAAAAAAAAAAAAAAAAAABwEBAQAAAAAAAAAAAAAAAAAAAAIQAQAAAAAAAAAAAAAAAAAAAAARAQAAAAAAAAAAAAAAAAAAAAD/wAARCAFAAUADASIAAhEAAxEA/9oADAMBAAIRAxEAPwC7gKSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//Z";

const DEFAULT_LINK_THUMBNAIL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAZAAAAGQCAIAAAAP3aGbAAAACXBIWXMAAAABAAAAAQBPJcTWAAAFN0lEQVR4nO3UMQ0AIQDAwCf5nRER+PeHBTbS5E5Bp4659gdQ8L8OALhlWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZhgVkGBaQYVhAhmEBGYYFZBgWkGFYQIZhARmGBWQYFpBhWECGYQEZB31HBo9AxX7DAAAAAElFTkSuQmCC";

async function resolveStableReferenceIds(
  prisma: PrismaService,
  envelope: MessageEnvelope,
  accountId: string,
  conversationId: string
): Promise<MessageEnvelope> {
  const cache = new Map<string, string | null>();
  const resolveId = async (platformId: string | undefined): Promise<string | undefined> => {
    if (!platformId) return undefined;
    if (/^msg_[A-Za-z0-9_-]{22}$/.test(platformId)) return platformId;
    if (!cache.has(platformId)) {
      const message = await prisma.message.findFirst({
        where: { accountId, conversationId, platformNewMsgId: platformId },
        orderBy: { sentAt: "desc" },
        select: { messageId: true }
      });
      cache.set(platformId, message?.messageId ?? null);
    }
    return cache.get(platformId) ?? undefined;
  };
  const resolveNode = async (node: MessageNode): Promise<MessageNode> => ({
    ...node,
    sourceMessageId: await resolveId(node.sourceMessageId),
    items: node.items ? await Promise.all(node.items.map(resolveNode)) : node.items,
    quote: node.quote ? await resolveNode(node.quote) : node.quote
  });
  const content = await resolveNode(envelope.content);
  const quote = envelope.quote ? await resolveNode(envelope.quote) : envelope.quote;
  const resolved = { ...envelope, content, quote };
  return {
    ...resolved,
    renderedText: renderMessageSummary(content, quote),
    renderedMd: renderMessageMarkdown(resolved)
  };
}

function extractMessageUrl(payload: unknown): string | undefined {
  const record = asRecord(payload);
  const content = asRecord(record?.content);
  const media = asRecord(content?.media);
  const link = asRecord(content?.link);
  return asString(media?.url ?? link?.url);
}

function extractSendResult(response: unknown, fallbackId: string): { newMsgId: string; msgId: string; createTime: string } {
  const record = asRecord(response);
  const data = asRecord(record?.data) ?? record;
  const newMsgId = asString(data?.newMsgId ?? data?.NewMsgId) ?? `local_${fallbackId}`;
  const msgId = asString(data?.msgId ?? data?.MsgId) ?? newMsgId;
  const createTime = asString(data?.createTime ?? data?.CreateTime) ?? String(Date.now());
  return {
    newMsgId,
    msgId,
    createTime
  };
}

function extractRenderedText(requestPayload: Prisma.JsonValue, type: string): string {
  const record = asRecord(requestPayload);
  if (type === "text") return asString(record?.text) ?? "";
  if (type === "image") return "[图片]";
  if (type === "voice") return "[语音]";
  if (type === "video") return "[视频]";
  if (type === "link") {
    const title = asString(record?.title);
    return title ? `[链接] ${title}` : "[链接]";
  }
  if (type === "file") {
    const fileName = asString(record?.fileName);
    return fileName ? `[文件] ${fileName}` : "[文件]";
  }
  return `[${type}]`;
}

function extractQuoteMessageNode(requestPayload: Prisma.JsonValue): MessageNode | null {
  const record = asRecord(requestPayload);
  const quote = asRecord(record?.quote);
  const content = asMessageNode(quote?.content);
  if (!quote || !content) return null;
  return {
    ...content,
    senderName: asString(quote.senderName) ?? content.senderName,
    sourceMessageId: asString(quote.messageId) ?? content.sourceMessageId,
    sentAt: asString(quote.sentAt) ?? content.sentAt
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return String(value);
}

function asMessageNode(value: unknown): MessageNode | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  if (!asString(record.type) || typeof record.text !== "string") return undefined;
  return record as unknown as MessageNode;
}

function asNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function extractChangedContactWxid(payload: Record<string, unknown>): string | undefined {
  const fromUser = asString(payload.fromUser);
  if (fromUser) return fromUser;
  const content = asString(payload.content);
  const parts = content?.split(/[，,]/).map((part) => part.trim()).filter(Boolean);
  return parts?.at(-1);
}
