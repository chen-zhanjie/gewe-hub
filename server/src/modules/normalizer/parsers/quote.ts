import type { MessageParser } from "./types.js";

export const quoteParser: MessageParser = {
  types: ["QUOTE"],
  parse: ({ firstString, parseAppMsg, rawContent, stripHtml }) => {
    const appmsg = parseAppMsg(rawContent);
    const title = firstString(appmsg?.title) ?? stripHtml(rawContent);
    return { type: "text", text: title || "[引用消息]" };
  },
};
