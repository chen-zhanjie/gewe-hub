import { cardParser } from "./card.js";
import { chatRecordParser } from "./chat-record.js";
import { emojiParser } from "./emoji.js";
import { fallbackParser } from "./fallback.js";
import { fileParser } from "./file.js";
import { imageParser } from "./image.js";
import { linkParser } from "./link.js";
import { locationParser } from "./location.js";
import { miniProgramParser } from "./mini-program.js";
import { quoteParser } from "./quote.js";
import { redPacketParser } from "./red-packet.js";
import { systemParser } from "./system.js";
import { textParser } from "./text.js";
import { transferParser } from "./transfer.js";
import type { MessageParser } from "./types.js";
import { videoParser } from "./video.js";
import { voiceParser } from "./voice.js";

const parsers: MessageParser[] = [
  textParser,
  imageParser,
  voiceParser,
  videoParser,
  fileParser,
  emojiParser,
  linkParser,
  miniProgramParser,
  quoteParser,
  chatRecordParser,
  locationParser,
  cardParser,
  transferParser,
  redPacketParser,
  systemParser,
  fallbackParser,
];

const parserByType = new Map<string, MessageParser>(
  parsers.flatMap((parser) => parser.types.map((type) => [type, parser])),
);

export function getMessageParser(msgType: string): MessageParser {
  return parserByType.get(msgType) ?? fallbackParser;
}
