import type { MessageNode } from "@gewehub/contracts";

export interface MessageParserContext {
  firstString: (value: unknown) => string | undefined;
  mediaNode: (type: MessageNode["type"], text: string, rawContent: string) => MessageNode;
  msgType: string;
  normalizeCard: (rawContent: string) => MessageNode;
  normalizeChatRecord: (rawContent: string) => MessageNode;
  normalizeFile: (rawContent: string) => MessageNode;
  normalizeLink: (rawContent: string) => MessageNode;
  normalizeLocation: (rawContent: string) => MessageNode;
  normalizeMiniProgram: (rawContent: string) => MessageNode;
  normalizeRedPacket: (rawContent: string) => MessageNode;
  normalizeTransfer: (rawContent: string) => MessageNode;
  parseAppMsg: (rawContent: string | undefined) => Record<string, unknown> | undefined;
  rawContent: string;
  stripHtml: (value: string) => string;
}

export interface MessageParser {
  parse: (context: MessageParserContext) => MessageNode;
  types: readonly string[];
}
