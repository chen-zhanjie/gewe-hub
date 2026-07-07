import type { MessageParser } from "./types.js";

export const textParser: MessageParser = {
  types: ["TEXT"],
  parse: ({ rawContent, stripHtml }) => ({ type: "text", text: stripHtml(rawContent) }),
};
