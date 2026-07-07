import type { MessageEnvelope, MessageNode } from "@gewehub/contracts";
import type { Prisma } from "@prisma/client";

type MessageReader = {
  message: {
    findFirst(args: {
      where: Prisma.MessageWhereInput;
      orderBy: { sentAt: "desc" };
      select: { payload: true };
    }): Promise<{ payload: Prisma.JsonValue } | null>;
  };
};

export function buildQuoteReferenceWhere(
  envelope: MessageEnvelope,
  accountId: string,
  conversationId: string | null
): Prisma.MessageWhereInput | null {
  const sourceMessageId = envelope.quote?.sourceMessageId;
  if (!sourceMessageId) return null;
  return buildMessageReferenceWhere(sourceMessageId, accountId, conversationId);
}

function buildMessageReferenceWhere(
  sourceMessageId: string,
  accountId: string,
  conversationId: string | null
): Prisma.MessageWhereInput {
  const rawMessageId = sourceMessageId.startsWith("msg_") ? sourceMessageId.slice(4) : sourceMessageId;
  const or: Prisma.MessageWhereInput[] = [
    { messageId: sourceMessageId },
    { rawMessageId }
  ];
  const prefix = largeIntegerPrefix(rawMessageId);
  if (prefix) {
    or.push({ messageId: { startsWith: `msg_${prefix}` } });
    or.push({ rawMessageId: { startsWith: prefix } });
  }

  return {
    accountId,
    ...(conversationId ? { conversationId } : {}),
    OR: or
  };
}

export async function hydrateQuoteFromLocalMessage(
  prisma: MessageReader,
  envelope: MessageEnvelope,
  accountId: string,
  conversationId: string
): Promise<MessageEnvelope> {
  const where = buildQuoteReferenceWhere(envelope, accountId, conversationId);
  if (!where) return envelope;

  const referencedInConversation = await prisma.message.findFirst({
    where,
    orderBy: { sentAt: "desc" },
    select: { payload: true }
  });
  if (referencedInConversation) {
    return mergeQuoteFromReferencedPayload(
      envelope,
      referencedInConversation.payload as unknown as MessageEnvelope
    );
  }

  const fallbackWhere = buildQuoteReferenceWhere(envelope, accountId, null);
  if (!fallbackWhere) return envelope;
  const referencedInAccount = await prisma.message.findFirst({
    where: fallbackWhere,
    orderBy: { sentAt: "desc" },
    select: { payload: true }
  });
  if (!referencedInAccount) return envelope;

  return mergeQuoteFromReferencedPayload(
    envelope,
    referencedInAccount.payload as unknown as MessageEnvelope,
    {
      crossConversationLookup: true
    }
  );
}

export async function hydrateMessageReferencesFromLocalMessages(
  prisma: MessageReader,
  envelope: MessageEnvelope,
  accountId: string,
  conversationId: string
): Promise<MessageEnvelope> {
  const envelopeWithQuote = await hydrateQuoteFromLocalMessage(
    prisma,
    envelope,
    accountId,
    conversationId
  );
  const cache = new Map<string, MessageEnvelope | null>();
  const content = await hydrateNodeReferences(
    prisma,
    envelopeWithQuote.content,
    accountId,
    conversationId,
    cache
  );
  const quote = envelopeWithQuote.quote
    ? await hydrateNodeReferences(
        prisma,
        envelopeWithQuote.quote,
        accountId,
        conversationId,
        cache
      )
    : envelopeWithQuote.quote;

  return {
    ...envelopeWithQuote,
    content,
    quote
  };
}

async function hydrateNodeReferences(
  prisma: MessageReader,
  node: MessageNode,
  accountId: string,
  conversationId: string,
  cache: Map<string, MessageEnvelope | null>
): Promise<MessageNode> {
  let next = node;
  if (node.sourceMessageId) {
    const referencedPayload = await findReferencedPayload(
      prisma,
      node.sourceMessageId,
      accountId,
      conversationId,
      cache
    );
    if (
      referencedPayload &&
      shouldUseReferencedContent(node, referencedPayload.content)
    ) {
      next = mergeNodeFromReferencedPayload(node, referencedPayload.content);
    }
  }

  const items = next.items
    ? await Promise.all(
        next.items.map((item) =>
          hydrateNodeReferences(
            prisma,
            item,
            accountId,
            conversationId,
            cache
          )
        )
      )
    : next.items;
  const quote = next.quote
    ? await hydrateNodeReferences(
        prisma,
        next.quote,
        accountId,
        conversationId,
        cache
      )
    : next.quote;

  if (items !== next.items || quote !== next.quote) {
    next = {
      ...next,
      items,
      quote
    };
  }
  return next;
}

async function findReferencedPayload(
  prisma: MessageReader,
  sourceMessageId: string,
  accountId: string,
  conversationId: string,
  cache: Map<string, MessageEnvelope | null>
): Promise<MessageEnvelope | null> {
  const cacheKey = `${accountId}:${conversationId}:${sourceMessageId}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  const referencedInConversation = await prisma.message.findFirst({
    where: buildMessageReferenceWhere(sourceMessageId, accountId, conversationId),
    orderBy: { sentAt: "desc" },
    select: { payload: true }
  });
  if (referencedInConversation) {
    const payload = referencedInConversation.payload as unknown as MessageEnvelope;
    cache.set(cacheKey, payload);
    return payload;
  }

  const referencedInAccount = await prisma.message.findFirst({
    where: buildMessageReferenceWhere(sourceMessageId, accountId, null),
    orderBy: { sentAt: "desc" },
    select: { payload: true }
  });
  const payload = referencedInAccount
    ? (referencedInAccount.payload as unknown as MessageEnvelope)
    : null;
  cache.set(cacheKey, payload);
  return payload;
}

function mergeNodeFromReferencedPayload(
  currentNode: MessageNode,
  referencedContent: MessageNode
): MessageNode {
  return {
    ...referencedContent,
    senderName: currentNode.senderName ?? referencedContent.senderName,
    sourceMessageId:
      currentNode.sourceMessageId ?? referencedContent.sourceMessageId,
    sentAt: currentNode.sentAt ?? referencedContent.sentAt,
    quote: referencedContent.quote ?? currentNode.quote
  };
}

export function mergeQuoteFromReferencedPayload(
  envelope: MessageEnvelope,
  referencedPayload: MessageEnvelope,
  options: { crossConversationLookup?: boolean } = {}
): MessageEnvelope {
  if (!envelope.quote || !shouldUseReferencedContent(envelope.quote, referencedPayload.content)) return envelope;

  const mergedQuote: MessageNode = {
    ...referencedPayload.content,
    senderName: envelope.quote.senderName ?? referencedPayload.content.senderName,
    sourceMessageId: envelope.quote.sourceMessageId ?? referencedPayload.messageId,
    sentAt: envelope.quote.sentAt ?? referencedPayload.sentAt
  };

  return {
    ...envelope,
    quote: mergedQuote,
    renderedText: renderEnvelopeText(envelope.content, mergedQuote),
    metadata: options.crossConversationLookup
      ? {
          ...envelope.metadata,
          reference: {
            ...asRecord(envelope.metadata?.reference),
            crossConversationLookup: true
          }
        }
      : envelope.metadata
  };
}

function shouldUseReferencedContent(currentQuote: MessageNode, referencedContent: MessageNode): boolean {
  if (currentQuote.type === "unsupported") return true;
  if (currentQuote.type === "chat_record" && (currentQuote.items?.length ?? 0) === 0 && (referencedContent.items?.length ?? 0) > 0) {
    return true;
  }
  if (
    currentQuote.type === referencedContent.type &&
    currentQuote.media &&
    referencedContent.media?.status === "ready" &&
    currentQuote.media.status !== "ready"
  ) {
    return true;
  }
  return false;
}

function largeIntegerPrefix(rawMessageId: string): string | null {
  if (!/^\d{16,}$/.test(rawMessageId)) return null;
  return rawMessageId.slice(0, 16);
}

function renderEnvelopeText(content: MessageNode, quote: MessageNode): string {
  const quoteText = renderNodeText(quote);
  return quoteText ? `${content.text}: ${quoteText}` : content.text;
}

function renderNodeText(node: MessageNode): string {
  if (node.type === "chat_record") return `[聊天记录] ${node.text}`;
  return node.text;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
