import type { MessageParser } from "./types.js";

export const fallbackParser: MessageParser = {
  types: ["APP_MSG"],
  parse: ({ msgType }) => ({
    type: "unsupported",
    text: msgType === "APP_MSG" ? "[暂不支持的 APP 消息]" : `[暂不支持的消息类型: ${msgType}]`,
    rawType: msgType,
  }),
};
