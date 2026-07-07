import type { PrismaService } from "../prisma/prisma.service.js";

export type ConversationIdentityType = "private" | "group";

export interface ConversationIdentityInput {
  accountId: string;
  peerWxid: string;
  type: ConversationIdentityType;
}

export interface ConversationIdentityProfile {
  accountId: string;
  wxid: string;
  name?: string | null;
  avatarUrl?: string | null;
}

type IdentityPrisma = Pick<PrismaService, "contact" | "group">;

export async function loadConversationIdentityProfile(
  prisma: IdentityPrisma,
  input: ConversationIdentityInput,
): Promise<ConversationIdentityProfile | undefined> {
  if (input.type === "private") {
    const contact = await prisma.contact.findUnique({
      where: {
        accountId_wxid: {
          accountId: input.accountId,
          wxid: input.peerWxid,
        },
      },
    });
    if (!contact) return undefined;
    return {
      accountId: contact.accountId,
      wxid: contact.wxid,
      name: firstText(contact.platformRemark, contact.nickname, contact.wxid),
      avatarUrl: firstText(contact.avatarUrl),
    };
  }

  const group = await prisma.group.findUnique({
    where: {
      accountId_wxid: {
        accountId: input.accountId,
        wxid: input.peerWxid,
      },
    },
  });
  if (!group) return undefined;
  return {
    accountId: group.accountId,
    wxid: group.wxid,
    name: firstText(group.platformRemark, group.name, group.wxid),
    avatarUrl: firstText(group.avatarUrl),
  };
}

export async function loadConversationIdentityProfiles(
  prisma: IdentityPrisma,
  inputs: ConversationIdentityInput[],
): Promise<Map<string, ConversationIdentityProfile>> {
  const privateInputs = uniqueIdentityInputs(inputs.filter((input) => input.type === "private"));
  const groupInputs = uniqueIdentityInputs(inputs.filter((input) => input.type === "group"));
  const [contacts, groups] = await Promise.all([
    privateInputs.length > 0
      ? prisma.contact.findMany({
          where: {
            OR: privateInputs.map((input) => ({
              accountId: input.accountId,
              wxid: input.peerWxid,
            })),
          },
        })
      : [],
    groupInputs.length > 0
      ? prisma.group.findMany({
          where: {
            OR: groupInputs.map((input) => ({
              accountId: input.accountId,
              wxid: input.peerWxid,
            })),
          },
        })
      : [],
  ]);

  const profiles = new Map<string, ConversationIdentityProfile>();
  for (const contact of contacts) {
    profiles.set(conversationIdentityKey(contact.accountId, contact.wxid), {
      accountId: contact.accountId,
      wxid: contact.wxid,
      name: firstText(contact.platformRemark, contact.nickname, contact.wxid),
      avatarUrl: firstText(contact.avatarUrl),
    });
  }
  for (const group of groups) {
    profiles.set(conversationIdentityKey(group.accountId, group.wxid), {
      accountId: group.accountId,
      wxid: group.wxid,
      name: firstText(group.platformRemark, group.name, group.wxid),
      avatarUrl: firstText(group.avatarUrl),
    });
  }
  return profiles;
}

export function mergeConversationIdentity<T extends { accountId: string; peerWxid: string; name?: string | null; avatarUrl?: string | null }>(
  conversation: T,
  profiles: Map<string, ConversationIdentityProfile>,
): T {
  const profile = profiles.get(conversationIdentityKey(conversation.accountId, conversation.peerWxid));
  return {
    ...conversation,
    name: firstText(displayNameOrUndefined(conversation.name, conversation.peerWxid), profile?.name) ?? conversation.name,
    avatarUrl: firstText(conversation.avatarUrl, profile?.avatarUrl) ?? conversation.avatarUrl,
  };
}

export function conversationIdentityKey(accountId: string, wxid: string): string {
  return `${accountId}:${wxid}`;
}

export function firstText(...values: Array<string | null | undefined>): string | undefined {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) return normalized;
  }
  return undefined;
}

function uniqueIdentityInputs(inputs: ConversationIdentityInput[]): ConversationIdentityInput[] {
  const seen = new Set<string>();
  return inputs.filter((input) => {
    const key = conversationIdentityKey(input.accountId, input.peerWxid);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function displayNameOrUndefined(name: string | null | undefined, peerWxid: string): string | undefined {
  const normalizedName = name?.trim();
  if (!normalizedName || normalizedName === peerWxid) return undefined;
  return normalizedName;
}
