import type { MessageParser } from "./types.js";

export const systemParser: MessageParser = {
  types: ["SYSTEM", "PAT_MSG"],
  parse: ({ msgType }) => ({ type: "system", text: "[系统消息]", rawType: msgType }),
};
