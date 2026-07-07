import type { MessageParser } from "./types.js";

export const locationParser: MessageParser = {
  types: ["LOCATION"],
  parse: ({ normalizeLocation, rawContent }) => normalizeLocation(rawContent),
};
