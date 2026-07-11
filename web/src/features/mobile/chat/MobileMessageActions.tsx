import { useEffect, useState } from "react";
import {
  MobileActionSheet,
  type MobileActionSheetAction,
} from "@/features/mobile/MobileActionSheet";
import { getMessageActionCapabilities } from "@/features/mobile/mobile-action-capabilities";
import type { MessageItem } from "@/lib/workspace-data";

export function MobileMessageActions({
  message,
  onClose,
  onRetryLocalSend,
  onDeleteLocalSend,
  onDispatchHeldMessage,
  onRequestRevoke,
  onShowDetail,
}: {
  message: MessageItem | null;
  onClose: () => void;
  onRetryLocalSend: (message: MessageItem) => void;
  onDeleteLocalSend: (message: MessageItem) => void;
  onDispatchHeldMessage: (message: MessageItem) => void;
  onRequestRevoke: (message: MessageItem) => void;
  onShowDetail?: (message: MessageItem) => void;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const capabilities = message
    ? getMessageActionCapabilities(message, nowMs)
    : null;

  useEffect(() => {
    if (!message || !capabilities?.canRevoke) return;
    const remaining =
      new Date(message.sentAtIso).getTime() + 2 * 60 * 1000 - Date.now();
    if (remaining <= 0) {
      setNowMs(Date.now());
      return;
    }
    const timer = window.setTimeout(
      () => setNowMs(Date.now()),
      remaining + 250,
    );
    return () => window.clearTimeout(timer);
  }, [capabilities?.canRevoke, message]);

  const actions: MobileActionSheetAction[] = [];
  if (message && capabilities) {
    if (capabilities.canDispatchHeld)
      actions.push({
        id: "dispatch",
        label: "发送",
        onSelect: () => onDispatchHeldMessage(message),
      });
    if (capabilities.canRetryLocalSend)
      actions.push({
        id: "retry",
        label: "重试",
        onSelect: () => onRetryLocalSend(message),
      });
    if (capabilities.canDeleteLocalSend)
      actions.push({
        id: "delete",
        label: "删除",
        destructive: true,
        onSelect: () => onDeleteLocalSend(message),
      });
    if (capabilities.canRevoke)
      actions.push({
        id: "revoke",
        label: "撤回",
        destructive: true,
        onSelect: () => onRequestRevoke(message),
      });
    if (onShowDetail && capabilities.canShowDetail)
      actions.push({
        id: "detail",
        label: "详情",
        onSelect: () => onShowDetail(message),
      });
  }
  return (
    <MobileActionSheet
      open={Boolean(message)}
      title="消息操作"
      actions={actions}
      onClose={onClose}
    />
  );
}
