import type { MessageParser } from "./types.js";

export const fileParser: MessageParser = {
  types: ["FILE"],
  parse: ({ normalizeFile, rawContent }) => normalizeFile(rawContent),
};
