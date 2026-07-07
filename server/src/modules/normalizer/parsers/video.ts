import type { MessageParser } from "./types.js";

export const videoParser: MessageParser = {
  types: ["VIDEO"],
  parse: ({ mediaNode, rawContent }) => mediaNode("video", "[视频]", rawContent),
};
