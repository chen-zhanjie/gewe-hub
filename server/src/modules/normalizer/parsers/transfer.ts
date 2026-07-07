import type { MessageParser } from "./types.js";

export const transferParser: MessageParser = {
  types: ["TRANSFER"],
  parse: ({ normalizeTransfer, rawContent }) => normalizeTransfer(rawContent),
};
