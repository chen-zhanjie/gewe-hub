import type { MessageNode } from "@gewehub/contracts";
import type { ClipboardEvent, DragEvent } from "react";
import { useRef, useState } from "react";
import type { PendingAttachment } from "@/features/workbench/MessageComposer";
import {
  applyMentionTextChange,
  createMentionDraft,
  getActiveMentionQuery,
  getEffectiveMentionWxids,
  insertMention,
  type MentionCandidate,
} from "@/features/workbench/mention-draft";
import {
  arrayBufferToBase64,
  guessMimeType,
  inferMediaTypeFromFile,
  readFileAsArrayBuffer,
  readMediaDurationMs,
  readThumbnailFilePayload,
  readTransferFiles,
  readVideoFrameThumbnailPayload,
  type ThumbnailPayload,
} from "@/features/workbench/message-media-utils";
import type { WorkbenchGroupMember, WorkbenchMediaSendType } from "@/features/workbench/queries";
import { useVoiceRecorder } from "@/features/workbench/useVoiceRecorder";
import type { ConversationSummary, LocalSendPayload, MessageItem } from "@/lib/workspace-data";

type MediaSendType = WorkbenchMediaSendType;

interface LinkDraft {
  title: string;
  desc: string;
  linkUrl: string;
  thumbUrl: string;
  thumbFile: File | null;
}

interface HtmlDraft {
  source: "content" | "file" | "url";
  title: string;
  desc: string;
  linkUrl: string;
  thumbUrl: string;
  htmlContent: string;
  file: File | null;
}

interface VideoDraft {
  file: File | null;
  thumbFile: File | null;
}

interface WorkbenchComposerControllerOptions {
  selectedConversation?: ConversationSummary;
  quotedMessage: MessageItem | null;
  groupMembers: WorkbenchGroupMember[];
  onClearQuotedMessage: () => void;
  onSendText: (
    text: string,
    options?: {
      mentions?: string[];
      replyToMessageId?: string;
      quotePreview?: MessageNode;
    },
  ) => Promise<boolean>;
  onSendPayload: (payload: LocalSendPayload) => boolean;
  parseLinkPreview: (linkUrl: string) => Promise<{ title?: string; desc?: string; linkUrl: string; thumbUrl?: string }>;
  createLocalSendPlaceholder: (
    payload: Pick<LocalSendPayload, "type" | "fileName" | "mimeType" | "thumbUrl" | "durationMs">,
  ) => string | null;
  submitLocalSendPayload: (localSendId: string, payload: LocalSendPayload) => void;
  failLocalSend: (localSendId: string, errorMessage: string) => void;
}

export function useWorkbenchComposerController({
  selectedConversation,
  quotedMessage,
  groupMembers,
  onClearQuotedMessage,
  onSendText,
  onSendPayload,
  parseLinkPreview,
  createLocalSendPlaceholder,
  submitLocalSendPayload,
  failLocalSend,
}: WorkbenchComposerControllerOptions) {
  const [mentionDraft, setMentionDraft] = useState(() => createMentionDraft());
  const [showVideoForm, setShowVideoForm] = useState(false);
  const [videoDraft, setVideoDraft] = useState<VideoDraft>({
    file: null,
    thumbFile: null,
  });
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkDraft, setLinkDraft] = useState<LinkDraft>({
    title: "",
    desc: "",
    linkUrl: "",
    thumbUrl: "",
    thumbFile: null,
  });
  const [showHtmlForm, setShowHtmlForm] = useState(false);
  const [htmlDraft, setHtmlDraft] = useState<HtmlDraft>({
    source: "content",
    title: "",
    desc: "",
    linkUrl: "",
    thumbUrl: "",
    htmlContent: "",
    file: null,
  });
  const [sending, setSending] = useState(false);
  const [parsingLink, setParsingLink] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [attachmentDragActive, setAttachmentDragActive] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const voiceInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const videoThumbInputRef = useRef<HTMLInputElement | null>(null);
  const linkThumbInputRef = useRef<HTMLInputElement | null>(null);
  const htmlFileInputRef = useRef<HTMLInputElement | null>(null);
  const { recording: voiceRecording, toggleRecording: toggleVoiceRecording } = useVoiceRecorder({
    enabled: Boolean(selectedConversation) && !sending,
    onError: setSendError,
    onReady: (file, options) => handleSendMedia(file, "voice", options),
  });

  async function handleSendText() {
    const text = mentionDraft.text.trim();
    if (!selectedConversation || !text) return;

    const mentions = getEffectiveMentionWxids(mentionDraft);
    setSendError(null);
    const sent = await onSendText(text, {
      mentions,
      replyToMessageId: quotedMessage?.messageId,
      quotePreview: quotedMessage ? buildQuotePreview(quotedMessage) : undefined,
    });
    if (!sent) return;
    setMentionDraft(createMentionDraft());
    onClearQuotedMessage();
  }

  function handleMessageTextChange(text: string, selectionStart: number) {
    setMentionDraft((current) => applyMentionTextChange(current, text, selectionStart));
  }

  function handleInsertMention(member: MentionCandidate, selectionStart?: number) {
    setMentionDraft((current) => insertMention(current, member, selectionStart));
  }

  const mentionCandidates = selectedConversation?.type === "group"
    ? groupMembers
        .filter((member) => member.status === "active")
        .filter((member) => matchesMentionQuery(member, getActiveMentionQuery(mentionDraft)?.query ?? ""))
        .map((member) => ({ wxid: member.wxid, label: readMentionMemberLabel(member) }))
    : [];

  async function handleSendMedia(file: File | undefined, type: MediaSendType, options?: { durationMs?: number }) {
    if (!selectedConversation || !file || sending) return;

    const localSendId = createLocalSendPlaceholder({
      type,
      fileName: file.name,
      mimeType: file.type || guessMimeType(file.name, type),
      ...(options?.durationMs ? { durationMs: options.durationMs } : {}),
    });
    if (!localSendId) return;
    setSending(true);
    setSendError(null);
    try {
      await submitMediaFile(localSendId, file, type, options);
    } catch (sendError) {
      const errorMessage = sendError instanceof Error ? sendError.message : "发送失败";
      setSendError(errorMessage);
      failLocalSend(localSendId, errorMessage);
    } finally {
      setSending(false);
      resetInputValue(type);
    }
  }

  async function submitMediaFile(
    localSendId: string,
    file: File,
    type: MediaSendType,
    options?: { durationMs?: number; thumbnail?: ThumbnailPayload },
  ) {
    if (!selectedConversation) return;
    const [contentBase64, durationMs, thumbnail] = await Promise.all([
      readFileAsArrayBuffer(file).then(arrayBufferToBase64),
      options?.durationMs !== undefined
        ? Promise.resolve(options.durationMs)
        : type === "voice"
          ? readMediaDurationMs(file, "audio")
          : type === "video"
            ? readMediaDurationMs(file, "video")
            : Promise.resolve(undefined),
      type === "video" ? Promise.resolve(options?.thumbnail).then((value) => value ?? readVideoFrameThumbnailPayload(file)) : Promise.resolve(undefined),
    ]);
    submitLocalSendPayload(localSendId, {
      type,
      contentBase64,
      mimeType: file.type || guessMimeType(file.name, type),
      fileName: file.name,
      ...(thumbnail ?? {}),
      ...(durationMs ? { durationMs } : {}),
    });
  }

  function addPendingAttachments(files: File[]) {
    if (!selectedConversation || files.length === 0) return;
    setSendError(null);
    setPendingAttachments((currentAttachments) => [
      ...currentAttachments,
      ...files.map((file) => ({
        id: `${Date.now()}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
        file,
        type: inferMediaTypeFromFile(file),
      })),
    ]);
  }

  function removePendingAttachment(attachmentId: string) {
    setPendingAttachments((currentAttachments) => currentAttachments.filter((attachment) => attachment.id !== attachmentId));
  }

  async function handleSendPendingAttachments() {
    if (!selectedConversation || pendingAttachments.length === 0 || sending) return;

    setSending(true);
    setSendError(null);
    try {
      const attachmentsToSend = pendingAttachments;
      for (const attachment of attachmentsToSend) {
        const localSendId = createLocalSendPlaceholder({
          type: attachment.type,
          fileName: attachment.file.name,
          mimeType: attachment.file.type || guessMimeType(attachment.file.name, attachment.type),
        });
        if (!localSendId) continue;
        try {
          await submitMediaFile(localSendId, attachment.file, attachment.type);
        } catch (sendError) {
          const errorMessage = sendError instanceof Error ? sendError.message : "发送失败";
          failLocalSend(localSendId, errorMessage);
          throw sendError;
        }
      }
      setPendingAttachments((currentAttachments) =>
        currentAttachments.filter((attachment) => !attachmentsToSend.some((sentAttachment) => sentAttachment.id === attachment.id)),
      );
    } catch (sendError) {
      setSendError(sendError instanceof Error ? sendError.message : "发送失败");
    } finally {
      setSending(false);
    }
  }

  function handleAttachmentPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = readTransferFiles(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    addPendingAttachments(files);
  }

  function handleAttachmentDragEnter(event: DragEvent<HTMLElement>) {
    const files = readTransferFiles(event.dataTransfer);
    if (!selectedConversation || files.length === 0) return;
    event.preventDefault();
    setAttachmentDragActive(true);
  }

  function handleAttachmentDragOver(event: DragEvent<HTMLElement>) {
    const files = readTransferFiles(event.dataTransfer);
    if (!selectedConversation || files.length === 0) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setAttachmentDragActive(true);
  }

  function handleAttachmentDragLeave(event: DragEvent<HTMLElement>) {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return;
    setAttachmentDragActive(false);
  }

  function handleAttachmentDrop(event: DragEvent<HTMLElement>) {
    const files = readTransferFiles(event.dataTransfer);
    if (!selectedConversation || files.length === 0) return;
    event.preventDefault();
    setAttachmentDragActive(false);
    addPendingAttachments(files);
  }

  async function handleSendLink() {
    if (!selectedConversation || sending) return;
    const linkUrl = linkDraft.linkUrl.trim();
    if (!linkUrl) {
      setSendError("请填写链接地址");
      return;
    }
    const payload = {
      title: linkDraft.title.trim() || defaultLinkTitle(linkUrl),
      desc: linkDraft.desc.trim() || linkUrl,
      linkUrl,
    };

    setSending(true);
    setSendError(null);
    try {
      const thumbnail = linkDraft.thumbFile
        ? await readThumbnailFilePayload(linkDraft.thumbFile)
        : linkDraft.thumbUrl.trim()
          ? { thumbUrl: linkDraft.thumbUrl.trim() }
          : {};
      onSendPayload({
        type: "link",
        ...payload,
        ...thumbnail,
      });
      closeLinkForm();
    } catch (sendError) {
      setSendError(sendError instanceof Error ? sendError.message : "发送失败");
    } finally {
      setSending(false);
    }
  }

  async function handleSendHtml() {
    if (!selectedConversation || sending) return;
    const title = htmlDraft.title.trim() || defaultHtmlTitle(htmlDraft);
    const desc = htmlDraft.desc.trim() || title;
    const thumbnail = htmlDraft.thumbUrl.trim() ? { thumbUrl: htmlDraft.thumbUrl.trim() } : {};

    setSending(true);
    setSendError(null);
    try {
      if (htmlDraft.source === "url") {
        const linkUrl = htmlDraft.linkUrl.trim();
        if (!linkUrl) throw new Error("请填写 HTML 地址");
        onSendPayload({
          type: "html",
          title,
          desc,
          linkUrl,
          ...thumbnail,
        });
        closeHtmlForm();
        return;
      }

      if (htmlDraft.source === "file") {
        const file = htmlDraft.file;
        if (!file) throw new Error("请上传 HTML 文件");
        const htmlContentBase64 = await readFileAsArrayBuffer(file).then(arrayBufferToBase64);
        onSendPayload({
          type: "html",
          title,
          desc,
          htmlContentBase64,
          htmlFileName: file.name,
          ...thumbnail,
        });
        closeHtmlForm();
        return;
      }

      const htmlContent = htmlDraft.htmlContent;
      if (!htmlContent.trim()) throw new Error("请填写 HTML 内容");
      onSendPayload({
        type: "html",
        title,
        desc,
        htmlContent,
        ...thumbnail,
      });
      closeHtmlForm();
    } catch (sendError) {
      setSendError(sendError instanceof Error ? sendError.message : "发送失败");
    } finally {
      setSending(false);
    }
  }

  async function handleParseLink() {
    const linkUrl = linkDraft.linkUrl.trim();
    if (!linkUrl || parsingLink) return;
    setParsingLink(true);
    setSendError(null);
    try {
      const preview = await parseLinkPreview(linkUrl);
      setLinkDraft((current) => ({
        ...current,
        title: preview.title || current.title,
        desc: preview.desc || current.desc,
        linkUrl: preview.linkUrl || current.linkUrl,
        thumbUrl: preview.thumbUrl || current.thumbUrl,
      }));
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "链接解析失败");
    } finally {
      setParsingLink(false);
    }
  }

  async function handleSendVideo() {
    if (!selectedConversation || sending) return;
    if (!videoDraft.file) {
      setSendError("请上传视频文件");
      return;
    }

    const file = videoDraft.file;
    const localSendId = createLocalSendPlaceholder({
      type: "video",
      fileName: file.name,
      mimeType: file.type || guessMimeType(file.name, "video"),
    });
    if (!localSendId) return;

    setSending(true);
    setSendError(null);
    try {
      const thumbnail = videoDraft.thumbFile ? await readThumbnailFilePayload(videoDraft.thumbFile) : undefined;
      await submitMediaFile(localSendId, file, "video", { thumbnail });
      closeVideoForm();
    } catch (sendError) {
      const errorMessage = sendError instanceof Error ? sendError.message : "发送失败";
      setSendError(errorMessage);
      failLocalSend(localSendId, errorMessage);
    } finally {
      setSending(false);
      resetInputValue("video");
      if (videoThumbInputRef.current) videoThumbInputRef.current.value = "";
    }
  }

  function closeVideoForm() {
    setShowVideoForm(false);
    setVideoDraft({ file: null, thumbFile: null });
    if (videoInputRef.current) videoInputRef.current.value = "";
    if (videoThumbInputRef.current) videoThumbInputRef.current.value = "";
  }

  function closeLinkForm() {
    setShowLinkForm(false);
    setLinkDraft({ title: "", desc: "", linkUrl: "", thumbUrl: "", thumbFile: null });
    if (linkThumbInputRef.current) linkThumbInputRef.current.value = "";
  }

  function closeHtmlForm() {
    setShowHtmlForm(false);
    setHtmlDraft({ source: "content", title: "", desc: "", linkUrl: "", thumbUrl: "", htmlContent: "", file: null });
    if (htmlFileInputRef.current) htmlFileInputRef.current.value = "";
  }

  function handleVoiceRecord() {
    setSendError(null);
    void toggleVoiceRecording();
  }

function resetInputValue(type: MediaSendType) {
    if (type === "image" && imageInputRef.current) imageInputRef.current.value = "";
    if (type === "file" && fileInputRef.current) fileInputRef.current.value = "";
    if (type === "voice" && voiceInputRef.current) voiceInputRef.current.value = "";
    if (type === "video" && videoInputRef.current) videoInputRef.current.value = "";
  }

function defaultLinkTitle(linkUrl: string): string {
  try {
    return new URL(linkUrl).hostname || linkUrl;
  } catch {
    return linkUrl;
  }
}

function defaultHtmlTitle(draft: HtmlDraft): string {
  if (draft.source === "url" && draft.linkUrl.trim()) return defaultLinkTitle(draft.linkUrl.trim());
  if (draft.source === "file" && draft.file?.name) return draft.file.name;
  return "HTML 页面";
}

  return {
    messageText: mentionDraft.text,
    mentionCandidates,
    activeMentionQuery: selectedConversation?.type === "group" ? getActiveMentionQuery(mentionDraft) : null,
    setMessageText: handleMessageTextChange,
    insertMention: handleInsertMention,
    showVideoForm,
    setShowVideoForm,
    videoDraft,
    setVideoDraft,
    showLinkForm,
    setShowLinkForm,
    closeVideoForm,
    closeLinkForm,
    linkDraft,
    setLinkDraft,
    showHtmlForm,
    setShowHtmlForm,
    closeHtmlForm,
    htmlDraft,
    setHtmlDraft,
    sending,
    parsingLink,
    pendingAttachments,
    quotedMessageLabel: quotedMessage ? formatQuotedMessageLabel(quotedMessage) : null,
    attachmentDragActive,
    sendError,
    voiceRecording,
    voiceInputRef,
    imageInputRef,
    videoInputRef,
    videoThumbInputRef,
    linkThumbInputRef,
    htmlFileInputRef,
    fileInputRef,
    handleSendMedia,
    handleVoiceRecord,
    handleSendLink,
    handleSendHtml,
    handleParseLink,
    handleSendVideo,
    removePendingAttachment,
    clearQuotedMessage: onClearQuotedMessage,
    handleSendPendingAttachments,
    handleAttachmentPaste,
    handleAttachmentDragEnter,
    handleAttachmentDragOver,
    handleAttachmentDragLeave,
    handleAttachmentDrop,
    handleSendText,
  };
}

function buildQuotePreview(message: MessageItem): MessageNode {
  return {
    ...message.content,
    quote: undefined,
    senderName: message.senderName,
    sourceMessageId: message.messageId,
    sentAt: message.sentAtIso,
  };
}

function formatQuotedMessageLabel(message: MessageItem): string {
  return `${message.content.text || message.messageId}`;
}

function matchesMentionQuery(member: WorkbenchGroupMember, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;
  return [member.platformRemark, member.displayName, member.nickname, member.wxid]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
}

function readMentionMemberLabel(member: WorkbenchGroupMember): string {
  const baseName = member.displayName || member.nickname || member.wxid;
  return member.platformRemark || baseName;
}
