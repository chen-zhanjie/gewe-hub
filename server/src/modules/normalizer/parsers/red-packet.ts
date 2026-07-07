import type { MessageParser } from "./types.js";

export const redPacketParser: MessageParser = {
  types: ["RED_PACKET"],
  parse: ({ normalizeRedPacket, rawContent }) => normalizeRedPacket(rawContent),
};
