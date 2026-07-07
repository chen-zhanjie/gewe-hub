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
import { hydrateMessageReferencesFromLocalMessages } from "../messages/message-reference.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { buildLocalHubSendMessage } from "../send/send-utils.js";
import { transitionAfterFailure } from "./outbox-state.js";

@Injectable()
export class OutboxService implements OnModuleInit {
  private readonly logger = new Logger(OutboxService.name);
  private timer: NodeJS.Timeout | undefined;

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
      this.tick().catch((error: unknown) => this.logger.error(error));
    }, 2000);
    this.timer.unref();
  }

  async tick() {
    const task = await this.claimNextTask();
    if (!task) return;

    try {
      await this.handleTask(task.taskType, task.refId, task.payload);
      await this.prisma.outboxTask.update({
        where: { id: task.id },
        data: {
          status: "done",
          leaseUntil: null,
          lastError: null
        }
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
        return;
      }
      const next = transitionAfterFailure(
        {
          retryCount: task.retryCount,
          maxRetry: task.maxRetry
        },
        error
      );
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
        }
      }
    });
    const mapped = parseMappedGeweRequest(sendRequest.geweRequest);

    try {
      const prepared = await this.prepareSendRequestForGewe(sendRequest, mapped);
      const geweResponse = await this.gewe!.sendByMappedRequest(prepared.mapped);
      const result = extractSendResult(geweResponse, sendRequest.id);
      const text = prepared.localContent?.text ?? extractRenderedText(sendRequest.requestPayload, sendRequest.type);
      const localMessage = buildLocalHubSendMessage({
        accountWxid: sendRequest.conversation.account.wxid,
        conversationId: sendRequest.conversation.id,
        conversationWxid: sendRequest.conversation.peerWxid,
        senderWxid: sendRequest.conversation.account.wxid,
        text,
        newMsgId: result.newMsgId,
        createTime: result.createTime,
        content: prepared.localContent
      });
      const existingMessage = await this.prisma.message.findUnique({
        where: { sendRequestId: sendRequest.id }
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
          rawMessageId: localMessage.rawMessageId,
          dedupeKey: localMessage.dedupeKey,
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
        created: !existingMessage
      });
      this.adminEvents?.publishMessageChanged({
        eventType: "message.created",
        conversationId: sendRequest.conversationId,
        messageId: localMessage.messageId,
      });
      await this.prisma.sendRequest.update({
        where: { id: sendRequest.id },
        data: {
          status: "sent",
          errorMessage: null,
          geweResponse: geweResponse as Prisma.InputJsonValue,
          resultNewMsgId: result.newMsgId,
          resultMsgId: result.msgId,
          resultCreateTime: result.createTime
        }
      });
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
        throw new SendResultUnknownError(message);
      }
      await this.prisma.sendRequest.update({
        where: { id: sendRequest.id },
        data: {
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error)
        }
      });
      throw error;
    }
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
      return this.prepareOutboundLinkSend(mapped);
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
              thumbUrl: asString(body?.thumbUrl),
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
          thumbnailUrl: kind === "video" ? asString(body?.thumbUrl) : undefined,
          mimeType: prepared.mimeType,
          fileName: prepared.fileName,
          size: prepared.size,
          durationMs: kind === "video" ? (asNumber(body?.videoDuration) ?? 1) * 1000 : undefined,
        }
      }
    };
  }

  private prepareOutboundLinkSend(mapped: { path: string; body: unknown }): { mapped: { path: string; body: unknown }; localContent: MessageNode } {
    const body = asRecord(mapped.body);
    const title = asString(body?.title) ?? "链接";
    const desc = asString(body?.desc);
    const linkUrl = asString(body?.linkUrl);
    const thumbUrl = asString(body?.thumbUrl);
    return {
      mapped,
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

  private async prepareOutboundFileSource(
    sendRequest: {
      accountId: string;
      conversationId: string;
    },
    source: Record<string, unknown>,
    kind: "image" | "file" | "video"
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
      await this.markMessageRevoked(webhookEventId, revokedMessageRef);
      return;
    }

    const envelope = normalizeGewePayload(rawPayload);
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

    const hydratedEnvelope = await hydrateMessageReferencesFromLocalMessages(this.prisma, envelope, account.id, conversation.id);
    if (hydratedEnvelope.renderedText !== envelope.renderedText) {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageText: hydratedEnvelope.renderedText.slice(0, 500)
        }
      });
    }

    const messageDedupeKey = event.dedupeKey ?? envelope.messageId;
    const existingMessage = await this.prisma.message.findUnique({
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
        rawMessageId: String(normalizedPayload.newMsgId ?? normalizedPayload.msgId ?? hydratedEnvelope.messageId),
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
        payload: hydratedEnvelope as unknown as Prisma.InputJsonValue,
        renderedText: hydratedEnvelope.renderedText.slice(0, 500),
        status: hydratedEnvelope.status
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
      rawMsgId: asString(normalizedPayload.msgId ?? normalizedPayload.newMsgId) ?? message.rawMessageId ?? hydratedEnvelope.messageId
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

  private async markMessageRevoked(webhookEventId: string, ref: { messageId: string | null; rawMsgId: string | null }) {
    const revokedAt = new Date();
    const existing = ref.messageId
      ? await this.prisma.message.findUnique({
          where: { messageId: ref.messageId },
          include: {
            conversation: {
              include: { app: true }
            }
          }
        })
      : null;
    const fallback = existing || !ref.rawMsgId
      ? null
      : await this.prisma.message.findFirst({
          where: {
            webhookEvent: {
              is: {
                rawPayload: {
                  path: "$.Data.MsgId",
                  equals: Number(ref.rawMsgId)
                }
              }
            }
          },
          include: {
            conversation: {
              include: { app: true }
            }
          }
        });
    const target = existing ?? fallback;

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

class SendResultUnknownError extends Error {
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
    body: record?.body ?? {}
  };
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return String(value);
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
