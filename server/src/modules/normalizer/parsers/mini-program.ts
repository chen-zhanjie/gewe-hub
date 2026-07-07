import type { MessageParser } from "./types.js";

export const miniProgramParser: MessageParser = {
  types: ["MINI_PROGRAM"],
  parse: ({ normalizeMiniProgram, rawContent }) => normalizeMiniProgram(rawContent),
};
