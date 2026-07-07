import type { MessageParser } from "./types.js";

export const linkParser: MessageParser = {
  types: ["LINK"],
  parse: ({ normalizeLink, rawContent }) => normalizeLink(rawContent),
};
