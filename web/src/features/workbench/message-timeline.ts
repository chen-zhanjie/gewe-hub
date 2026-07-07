import type { MessageItem } from "@/lib/workspace-data";

export type MessageTimelineItem =
  | { type: "date"; key: string; label: string }
  | { type: "message"; key: string; message: MessageItem; startsGroup: boolean };

export function buildMessageTimeline(messages: MessageItem[]): MessageTimelineItem[] {
  const timeline: MessageTimelineItem[] = [];
  let previousMessage: MessageItem | null = null;
  let previousDayKey = "";

  for (const message of messages) {
    const dayKey = readMessageDayKey(message);
    if (dayKey && dayKey !== previousDayKey) {
      timeline.push({
        type: "date",
        key: `date:${dayKey}`,
        label: formatMessageDateLabel(dayKey),
      });
      previousDayKey = dayKey;
      previousMessage = null;
    }

    const startsGroup = shouldStartMessageGroup(previousMessage, message);
    timeline.push({
      type: "message",
      key: `message:${message.id}`,
      message,
      startsGroup,
    });
    previousMessage = message;
  }

  return timeline;
}

function shouldStartMessageGroup(previousMessage: MessageItem | null, message: MessageItem): boolean {
  if (!previousMessage) return true;
  if (previousMessage.status !== "normal" || message.status !== "normal") return true;
  if (previousMessage.content.type === "system" || message.content.type === "system") return true;
  if (previousMessage.isSelf !== message.isSelf) return true;
  if (readMessageSenderKey(previousMessage) !== readMessageSenderKey(message)) return true;

  const previousTime = Date.parse(previousMessage.sentAtIso);
  const currentTime = Date.parse(message.sentAtIso);
  if (!Number.isFinite(previousTime) || !Number.isFinite(currentTime)) return true;

  return currentTime - previousTime > 3 * 60 * 1000;
}

function readMessageSenderKey(message: MessageItem): string {
  return message.senderProfile.wxid || message.senderName || (message.isSelf ? "self" : "unknown");
}

function readMessageDayKey(message: MessageItem): string {
  if (message.sentAtIso) return message.sentAtIso.slice(0, 10);
  return "";
}

function formatMessageDateLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  if (!year || !month || !day) return dayKey;
  return `${year}年${month}月${day}日`;
}
