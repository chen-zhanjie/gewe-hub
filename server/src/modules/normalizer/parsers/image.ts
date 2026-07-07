import type { MessageParser } from "./types.js";

export const imageParser: MessageParser = {
  types: ["IMAGE"],
  parse: ({ mediaNode, rawContent }) => mediaNode("image", "[图片]", rawContent),
};
