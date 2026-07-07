import type { MessageParser } from "./types.js";

export const emojiParser: MessageParser = {
  types: ["EMOJI"],
  parse: ({ mediaNode, rawContent }) => mediaNode("emoji", "[动画表情]", rawContent),
};
