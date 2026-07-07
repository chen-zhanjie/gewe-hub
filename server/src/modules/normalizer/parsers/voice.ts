import type { MessageParser } from "./types.js";

export const voiceParser: MessageParser = {
  types: ["VOICE"],
  parse: ({ mediaNode, rawContent }) => mediaNode("voice", "[语音]", rawContent),
};
