import type { MessageParser } from "./types.js";

export const cardParser: MessageParser = {
  types: ["CARD"],
  parse: ({ normalizeCard, rawContent }) => normalizeCard(rawContent),
};
