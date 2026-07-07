import type { ClipboardEvent, DragEvent } from "react";
import { useRef, useState } from "react";
import type { PendingAttachment } from "@/features/workbench/MessageComposer";
import {
  arrayBufferToBase64,
  guessMimeType,
  inferMediaTypeFromFile,
  readFileAsArrayBuffer,
  readMediaDurationMs,
  readTransferFiles,
} from "@/features/workbench/message-media-utils";
import type { WorkbenchMediaSendType } from "@/features/workbench/queries";
import { useVoiceRecorder } from "@/features/workbench/useVoiceRecorder";
import type { ConversationSummary, LocalSendPayload } from "@/lib/workspace-data";

type MediaSendType = WorkbenchMediaSendType;

interface LinkDraft {
  title: string;
  desc: string;
  linkUrl: string;
  thumbUrl: string;
}

interface WorkbenchComposerControllerOptions {
  selectedConversation?: ConversationSummary;
  onSendText: (text: string) => Promise<boolean>;
  onSendPayload: (payload: LocalSendPayload) => boolean;
  createLocalSendPlaceholder: (
    payload: Pick<LocalSendPayload, "type" | "fileName" | "mimeType" | "thumbUrl" | "durationMs">,
  ) => string | null;
  submitLocalSendPayload: (localSendId: string, payload: LocalSendPayload) => void;
  failLocalSend: (localSendId: string, errorMessage: string) => void;
}

export function useWorkbenchComposerController({
  selectedConversation,
  onSendText,
  onSendPayload,
  createLocalSendPlaceholder,
  submitLocalSendPayload,
  failLocalSend,
}: WorkbenchComposerControllerOptions) {
  const [messageText, setMessageText] = useState("");
  const [videoThumbUrl, setVideoThumbUrl] = useState("");
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkDraft, setLinkDraft] = useState<LinkDraft>({
    title: "",
    desc: "",
    linkUrl: "",
    thumbUrl: "",
  });
  const [sending, setSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [attachmentDragActive, setAttachmentDragActive] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const voiceInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const { recording: voiceRecording, toggleRecording: toggleVoiceRecording } = useVoiceRecorder({
    enabled: Boolean(selectedConversation) && !sending,
    onError: setSendError,
    onReady: (file, options) => handleSendMedia(file, "voice", options),
  });

  async function handleSendText() {
    const text = messageText.trim();
    if (!selectedConversation || !text) return;

    setSendError(null);
    setMessageText("");
    await onSendText(text);
  }

  async function handleSendMedia(file: File | undefined, type: MediaSendType, options?: { durationMs?: number }) {
    if (!selectedConversation || !file || sending) return;
    if (!validateMediaBeforeSend(type)) return;

    const localSendId = createLocalSendPlaceholder({
      type,
      fileName: file.name,
      mimeType: file.type || guessMimeType(file.name, type),
      ...(type === "video" && videoThumbUrl.trim() ? { thumbUrl: videoThumbUrl.trim() } : {}),
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

  function validateMediaBeforeSend(type: MediaSendType) {
    if (type !== "video" || videoThumbUrl.trim()) return true;
    setSendError("发送视频前请填写缩略图 URL");
    if (videoInputRef.current) videoInputRef.current.value = "";
    return false;
  }

  async function submitMediaFile(localSendId: string, file: File, type: MediaSendType, options?: { durationMs?: number }) {
    if (!selectedConversation) return;
    const thumbUrl = videoThumbUrl.trim();
    const [contentBase64, durationMs] = await Promise.all([
      readFileAsArrayBuffer(file).then(arrayBufferToBase64),
      options?.durationMs !== undefined
        ? Promise.resolve(options.durationMs)
        : type === "voice"
          ? readMediaDurationMs(file, "audio")
          : type === "video"
            ? readMediaDurationMs(file, "video")
            : Promise.resolve(undefined),
    ]);
    submitLocalSendPayload(localSendId, {
      type,
      contentBase64,
      mimeType: file.type || guessMimeType(file.name, type),
      fileName: file.name,
      ...(type === "video" ? { thumbUrl } : {}),
      ...(durationMs ? { durationMs } : {}),
    });
    if (type === "video") setVideoThumbUrl("");
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
    if (pendingAttachments.some((attachment) => !validateMediaBeforeSend(attachment.type))) return;

    setSending(true);
    setSendError(null);
    try {
      const attachmentsToSend = pendingAttachments;
      for (const attachment of attachmentsToSend) {
        const localSendId = createLocalSendPlaceholder({
          type: attachment.type,
          fileName: attachment.file.name,
          mimeType: attachment.file.type || guessMimeType(attachment.file.name, attachment.type),
          ...(attachment.type === "video" && videoThumbUrl.trim() ? { thumbUrl: videoThumbUrl.trim() } : {}),
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
    const payload = {
      title: linkDraft.title.trim(),
      desc: linkDraft.desc.trim(),
      linkUrl: linkDraft.linkUrl.trim(),
      thumbUrl: linkDraft.thumbUrl.trim(),
    };
    if (!payload.title || !payload.desc || !payload.linkUrl || !payload.thumbUrl) {
      setSendError("请完整填写链接标题、描述、地址和缩略图 URL");
      return;
    }

    setSending(true);
    setSendError(null);
    try {
      onSendPayload({
        type: "link",
        ...payload,
      });
      setLinkDraft({ title: "", desc: "", linkUrl: "", thumbUrl: "" });
    } catch (sendError) {
      setSendError(sendError instanceof Error ? sendError.message : "发送失败");
    } finally {
      setSending(false);
    }
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

  return {
    messageText,
    setMessageText,
    videoThumbUrl,
    setVideoThumbUrl,
    showLinkForm,
    setShowLinkForm,
    linkDraft,
    setLinkDraft,
    sending,
    pendingAttachments,
    attachmentDragActive,
    sendError,
    voiceRecording,
    voiceInputRef,
    imageInputRef,
    videoInputRef,
    fileInputRef,
    handleSendMedia,
    handleVoiceRecord,
    handleSendLink,
    removePendingAttachment,
    handleSendPendingAttachments,
    handleAttachmentPaste,
    handleAttachmentDragEnter,
    handleAttachmentDragOver,
    handleAttachmentDragLeave,
    handleAttachmentDrop,
    handleSendText,
  };
}
