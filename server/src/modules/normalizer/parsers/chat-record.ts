import type { MessageParser } from "./types.js";

export const chatRecordParser: MessageParser = {
  types: ["CHAT_RECORD"],
  parse: ({ normalizeChatRecord, rawContent }) => normalizeChatRecord(rawContent),
};
