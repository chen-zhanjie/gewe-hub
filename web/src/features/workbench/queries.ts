import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContactProfileResponse } from "@gewehub/contracts";
import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import type {
  BackendAccount,
  BackendConversation,
  BackendMessage,
  BackendSendRequest,
  ConversationSummary,
  LocalSendPayload,
} from "@/lib/workspace-data";

export const WORKBENCH_LIST_STALE_TIME_MS = 30_000;
export const WORKBENCH_ENTITY_STALE_TIME_MS = 5 * 60_000;

export interface HubAppSummary {
  id: string;
  name: string;
  status?: string;
  defaultDebounceMs?: number | null;
  defaultMaxWaitMs?: number | null;
}

export interface WorkbenchWorkspaceData {
  accounts: BackendAccount[];
  conversations: BackendConversation[];
  apps: HubAppSummary[];
}

export interface WorkbenchGroup {
  id: string;
  accountId: string;
  wxid: string;
  name?: string | null;
  platformRemark?: string | null;
  status?: string;
}

export interface WorkbenchGroupMember {
  id: string;
  wxid: string;
  nickname?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  platformRemark?: string | null;
  status?: "active" | "left" | "removed";
}

export interface WorkbenchGroupMembersData {
  group: WorkbenchGroup | null;
  members: WorkbenchGroupMember[];
  total: number;
  take: number;
  skip: number;
  nextSkip: number;
  hasMore: boolean;
  search: string;
}

export interface WorkbenchGroupMembersPage {
  items: WorkbenchGroupMember[];
  total: number;
  take: number;
  skip: number;
  nextSkip: number;
  hasMore: boolean;
}

interface WorkbenchGroupMembersQueryOptions {
  skip?: number;
  q?: string;
}

export type WorkbenchMediaSendType = "image" | "file" | "voice" | "video";

export interface SendMediaRequest {
  conversationId: string;
  type: WorkbenchMediaSendType;
  contentBase64: string;
  mimeType: string;
  fileName: string;
  thumbUrl?: string;
  thumbContentBase64?: string;
  thumbMimeType?: string;
  thumbFileName?: string;
  durationMs?: number;
}

export interface SendLinkRequest {
  conversationId: string;
  type: "link";
  title: string;
  desc: string;
  linkUrl: string;
  thumbUrl?: string;
  thumbContentBase64?: string;
  thumbMimeType?: string;
  thumbFileName?: string;
}

export interface SendHtmlRequest {
  conversationId: string;
  type: "html";
  title: string;
  desc: string;
  linkUrl?: string;
  thumbUrl?: string;
  htmlContent?: string;
  htmlContentBase64?: string;
  htmlFileName?: string;
}

export interface LinkPreviewResponse {
  title?: string;
  desc?: string;
  linkUrl: string;
  thumbUrl?: string;
}

export interface WorkbenchSendResponse {
  id: string;
  status?: string;
  htmlPublicUrl?: string;
  htmlPageId?: string | null;
  htmlHosted?: boolean;
}

export interface WorkbenchOutboxTaskResponse {
  id: string;
  status?: string;
}

export interface BindConversationRequest {
  appId: string;
  deliveryFilter: "all" | "at_only";
  debounceMs: number | null;
  maxWaitMs: number | null;
}

export interface UpdateConversationRequest {
  platformRemark?: string | null;
  pinned?: boolean;
  hidden?: boolean;
}

export interface UpdateGroupMemberRequest {
  platformRemark?: string | null;
}

interface AdminMessageEventPayload {
  conversationId?: string;
  messageId?: string;
  message?: BackendMessage;
  conversation?: BackendConversation;
}

export const adminEventSourceStatusEvent = "gewehub:admin-event-source-status";
export const workbenchRealtimeMessageEvent = "gewehub:workbench-realtime-message";

export interface AdminEventSourceStatusDetail {
  status: "connected" | "disconnected";
}

export interface WorkbenchRealtimeMessageDetail {
  conversationId: string;
  message: BackendMessage;
}

export const workbenchQueryKeys = {
  workspace: ["workbench", "workspace"] as const,
  conversations: ["workbench", "conversations"] as const,
  messages: (conversationId: string) => ["workbench", "messages", conversationId] as const,
  groupMembers: (conversationId: string) => ["workbench", "group-members", conversationId] as const,
  contactProfile: (accountId: string, wxid: string) => ["workbench", "contact-profile", accountId, wxid] as const,
};

export async function fetchWorkbenchWorkspace(): Promise<WorkbenchWorkspaceData> {
  const [accounts, conversations, apps] = await Promise.all([
    apiFetch<BackendAccount[]>("/api/accounts"),
    apiFetch<BackendConversation[]>("/api/conversations"),
    apiFetch<HubAppSummary[]>("/api/apps"),
  ]);
  return { accounts, conversations, apps };
}

export async function fetchWorkbenchMessages(conversationId: string, options?: { before?: string }): Promise<BackendMessage[]> {
  const params = new URLSearchParams({ take: "50" });
  if (options?.before) params.set("before", options.before);
  return apiFetch<BackendMessage[]>(`/api/conversations/${conversationId}/messages?${params.toString()}`);
}

export async function fetchWorkbenchConversations(): Promise<BackendConversation[]> {
  return apiFetch<BackendConversation[]>("/api/conversations");
}

export async function fetchWorkbenchSendRequest(sendRequestId: string): Promise<BackendSendRequest> {
  return apiFetch<BackendSendRequest>(`/api/send-requests/${sendRequestId}`);
}

export async function revokeWorkbenchSendRequest(sendRequestId: string): Promise<unknown> {
  return apiFetch(`/api/send/${sendRequestId}/revoke`, {
    method: "POST",
  });
}

export async function fetchWorkbenchGroupMembers(
  conversation: ConversationSummary,
  options: WorkbenchGroupMembersQueryOptions = {},
): Promise<WorkbenchGroupMembersData> {
  const accountId = conversation.raw.accountId;
  if (conversation.type !== "group" || !accountId) {
    return emptyGroupMembersData(options.q ?? "");
  }

  const params = new URLSearchParams({ accountId, q: conversation.raw.peerWxid });
  const groups = await apiFetch<WorkbenchGroup[]>(`/api/groups?${params.toString()}`);
  const group = groups.find((item) => item.wxid === conversation.raw.peerWxid) ?? null;
  if (!group) {
    return emptyGroupMembersData(options.q ?? "");
  }

  const page = await fetchWorkbenchGroupMemberPage(group.id, options);
  return groupMembersDataFromPage(group, page, options.q ?? "");
}

export async function fetchWorkbenchGroupMemberPage(
  groupId: string,
  options: WorkbenchGroupMembersQueryOptions = {},
): Promise<WorkbenchGroupMembersPage> {
  const params = new URLSearchParams({
    take: "50",
    skip: String(options.skip ?? 0),
  });
  const query = options.q?.trim();
  if (query) params.set("q", query);
  return apiFetch<WorkbenchGroupMembersPage>(`/api/groups/${groupId}/members?${params.toString()}`);
}

export async function fetchWorkbenchContactProfile(accountId: string, wxid: string): Promise<ContactProfileResponse> {
  const params = new URLSearchParams({ accountId });
  return apiFetch<ContactProfileResponse>(`/api/contacts/${encodeURIComponent(wxid)}/profile?${params.toString()}`);
}

export async function sendWorkbenchText(conversationId: string, text: string): Promise<WorkbenchSendResponse> {
  return apiFetch<WorkbenchSendResponse>("/api/send", {
    method: "POST",
    body: JSON.stringify({ conversationId, type: "text", text }),
  });
}

export async function sendWorkbenchMedia(payload: SendMediaRequest): Promise<WorkbenchSendResponse> {
  return apiFetch<WorkbenchSendResponse>("/api/send", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function sendWorkbenchLink(payload: SendLinkRequest): Promise<WorkbenchSendResponse> {
  return apiFetch<WorkbenchSendResponse>("/api/send", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function sendWorkbenchHtml(payload: SendHtmlRequest): Promise<WorkbenchSendResponse> {
  return apiFetch<WorkbenchSendResponse>("/api/send", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function parseWorkbenchLinkPreview(linkUrl: string): Promise<LinkPreviewResponse> {
  const params = new URLSearchParams({ url: linkUrl });
  return apiFetch<LinkPreviewResponse>(`/api/link-preview?${params.toString()}`);
}

export async function sendWorkbenchPayload(
  conversationId: string,
  payload: LocalSendPayload,
): Promise<WorkbenchSendResponse> {
  if (payload.type === "link") {
    return sendWorkbenchLink({
      conversationId,
      type: "link",
      title: payload.title ?? "",
      desc: payload.desc ?? "",
      linkUrl: payload.linkUrl ?? "",
      ...(payload.thumbUrl ? { thumbUrl: payload.thumbUrl } : {}),
      ...(payload.thumbContentBase64 ? { thumbContentBase64: payload.thumbContentBase64 } : {}),
      ...(payload.thumbMimeType ? { thumbMimeType: payload.thumbMimeType } : {}),
      ...(payload.thumbFileName ? { thumbFileName: payload.thumbFileName } : {}),
    });
  }

  if (payload.type === "html") {
    return sendWorkbenchHtml({
      conversationId,
      type: "html",
      title: payload.title ?? "",
      desc: payload.desc ?? "",
      ...(payload.linkUrl ? { linkUrl: payload.linkUrl } : {}),
      ...(payload.thumbUrl ? { thumbUrl: payload.thumbUrl } : {}),
      ...(payload.htmlContent ? { htmlContent: payload.htmlContent } : {}),
      ...(payload.htmlContentBase64 ? { htmlContentBase64: payload.htmlContentBase64 } : {}),
      ...(payload.htmlFileName ? { htmlFileName: payload.htmlFileName } : {}),
    });
  }

  return sendWorkbenchMedia({
    conversationId,
    type: payload.type,
    contentBase64: payload.contentBase64 ?? "",
    mimeType: payload.mimeType ?? "application/octet-stream",
    fileName: payload.fileName ?? "",
    ...(payload.thumbUrl ? { thumbUrl: payload.thumbUrl } : {}),
    ...(payload.thumbContentBase64 ? { thumbContentBase64: payload.thumbContentBase64 } : {}),
    ...(payload.thumbMimeType ? { thumbMimeType: payload.thumbMimeType } : {}),
    ...(payload.thumbFileName ? { thumbFileName: payload.thumbFileName } : {}),
    ...(payload.durationMs ? { durationMs: payload.durationMs } : {}),
  });
}

export async function bindWorkbenchConversation(conversationId: string, payload: BindConversationRequest): Promise<unknown> {
  return apiFetch(`/api/conversations/${conversationId}/bind`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateWorkbenchConversation(conversationId: string, payload: UpdateConversationRequest): Promise<unknown> {
  return apiFetch(`/api/conversations/${conversationId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function markWorkbenchConversationRead(conversationId: string): Promise<unknown> {
  return apiFetch(`/api/conversations/${conversationId}/read`, {
    method: "POST",
  });
}

export async function updateWorkbenchGroupMember(groupId: string, memberId: string, payload: UpdateGroupMemberRequest): Promise<unknown> {
  return apiFetch(`/api/groups/${groupId}/members/${memberId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function syncWorkbenchGroupMembers(groupId: string): Promise<WorkbenchOutboxTaskResponse> {
  return apiFetch<WorkbenchOutboxTaskResponse>(`/api/groups/${groupId}/sync-members`, {
    method: "POST",
  });
}

export async function unbindWorkbenchConversation(conversationId: string): Promise<unknown> {
  return apiFetch(`/api/conversations/${conversationId}/unbind`, {
    method: "POST",
  });
}

export function useWorkbenchWorkspaceQuery() {
  return useQuery({
    queryKey: workbenchQueryKeys.workspace,
    queryFn: fetchWorkbenchWorkspace,
    staleTime: WORKBENCH_LIST_STALE_TIME_MS,
  });
}

export function useWorkbenchMessagesQuery(conversationId: string | null) {
  return useQuery({
    queryKey: conversationId ? workbenchQueryKeys.messages(conversationId) : ["workbench", "messages", "none"],
    queryFn: () => {
      if (!conversationId) return Promise.resolve([]);
      return fetchWorkbenchMessages(conversationId);
    },
    enabled: Boolean(conversationId),
    staleTime: WORKBENCH_LIST_STALE_TIME_MS,
  });
}

export function useWorkbenchGroupMembersQuery(conversation: ConversationSummary | undefined, enabled: boolean) {
  return useQuery({
    queryKey: conversation ? workbenchQueryKeys.groupMembers(conversation.id) : ["workbench", "group-members", "none"],
    queryFn: () => {
      if (!conversation) return Promise.resolve(emptyGroupMembersData(""));
      return fetchWorkbenchGroupMembers(conversation);
    },
    enabled: Boolean(conversation) && enabled,
    staleTime: WORKBENCH_ENTITY_STALE_TIME_MS,
  });
}

export function useWorkbenchContactProfileQuery(accountId: string | null | undefined, wxid: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: accountId && wxid ? workbenchQueryKeys.contactProfile(accountId, wxid) : ["workbench", "contact-profile", "none"],
    queryFn: () => {
      if (!accountId || !wxid) throw new Error("联系人详情缺少账号或 wxid");
      return fetchWorkbenchContactProfile(accountId, wxid);
    },
    enabled: Boolean(accountId && wxid && enabled),
    staleTime: WORKBENCH_ENTITY_STALE_TIME_MS,
  });
}

export function useRefreshWorkbenchQueries() {
  const queryClient = useQueryClient();

  return {
    refreshWorkspace: async () => {
      const data = await fetchWorkbenchWorkspace();
      queryClient.setQueryData(workbenchQueryKeys.workspace, data);
      return data;
    },
    refreshMessages: async (conversationId: string) => {
      const data = await fetchWorkbenchMessages(conversationId);
      queryClient.setQueryData(workbenchQueryKeys.messages(conversationId), data);
      return data;
    },
    loadOlderMessages: async (conversationId: string, beforeMessageId: string) => {
      return fetchWorkbenchMessages(conversationId, { before: beforeMessageId });
    },
    refreshGroupMembers: async (conversation: ConversationSummary, search = "") => {
      const data = await fetchWorkbenchGroupMembers(conversation, { q: search });
      queryClient.setQueryData(workbenchQueryKeys.groupMembers(conversation.id), data);
      return data;
    },
    searchGroupMembers: async (conversation: ConversationSummary, search: string) => {
      const data = await fetchWorkbenchGroupMembers(conversation, { q: search });
      queryClient.setQueryData(workbenchQueryKeys.groupMembers(conversation.id), data);
      return data;
    },
    loadMoreGroupMembers: async (conversation: ConversationSummary) => {
      const current = queryClient.getQueryData<WorkbenchGroupMembersData>(workbenchQueryKeys.groupMembers(conversation.id));
      if (!current?.group || !current.hasMore) return current;
      const page = await fetchWorkbenchGroupMemberPage(current.group.id, {
        skip: current.nextSkip,
        q: current.search,
      });
      const data: WorkbenchGroupMembersData = {
        ...current,
        members: mergeGroupMembersById([...current.members, ...page.items]),
        total: page.total,
        take: page.take,
        skip: page.skip,
        nextSkip: page.nextSkip,
        hasMore: page.hasMore,
      };
      queryClient.setQueryData(workbenchQueryKeys.groupMembers(conversation.id), data);
      return data;
    },
  };
}

function emptyGroupMembersData(search: string): WorkbenchGroupMembersData {
  return {
    group: null,
    members: [],
    total: 0,
    take: 50,
    skip: 0,
    nextSkip: 0,
    hasMore: false,
    search,
  };
}

function groupMembersDataFromPage(group: WorkbenchGroup, page: WorkbenchGroupMembersPage, search: string): WorkbenchGroupMembersData {
  return {
    group,
    members: page.items,
    total: page.total,
    take: page.take,
    skip: page.skip,
    nextSkip: page.nextSkip,
    hasMore: page.hasMore,
    search,
  };
}

function mergeGroupMembersById(members: WorkbenchGroupMember[]): WorkbenchGroupMember[] {
  const seen = new Set<string>();
  return members.filter((member) => {
    if (seen.has(member.id)) return false;
    seen.add(member.id);
    return true;
  });
}

export function useWorkbenchAdminEvents(currentConversationId: string | null) {
  const queryClient = useQueryClient();
  const currentConversationIdRef = useRef(currentConversationId);

  useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const events = new EventSource("/api/admin/events");

    function handleOpen() {
      publishAdminEventSourceStatus("connected");
    }

    function handleError() {
      publishAdminEventSourceStatus("disconnected");
    }

    function handleMessageChanged(event: MessageEvent<string>) {
      const payload = readAdminMessageEventPayload(event.data);
      void refreshWorkbenchAfterAdminEvent(queryClient, payload, currentConversationIdRef.current);
    }

    events.addEventListener("open", handleOpen);
    events.addEventListener("error", handleError);
    events.addEventListener("message.created", handleMessageChanged);
    events.addEventListener("message.updated", handleMessageChanged);
    events.addEventListener("message.revoked", handleMessageChanged);
    return () => {
      events.close();
      publishAdminEventSourceStatus("connected");
    };
  }, [queryClient]);
}

function publishAdminEventSourceStatus(status: AdminEventSourceStatusDetail["status"]) {
  window.dispatchEvent(
    new CustomEvent<AdminEventSourceStatusDetail>(adminEventSourceStatusEvent, {
      detail: { status },
    }),
  );
}

async function refreshWorkbenchAfterAdminEvent(
  queryClient: ReturnType<typeof useQueryClient>,
  payload: AdminMessageEventPayload,
  currentConversationId: string | null,
) {
  if (payload.message || payload.conversation) {
    applyAdminEventPatch(queryClient, payload, currentConversationId);
    return;
  }

  const workspace = await fetchWorkbenchWorkspace();
  queryClient.setQueryData(workbenchQueryKeys.workspace, workspace);
  if (payload.conversationId && payload.conversationId === currentConversationId) {
    const messages = await fetchWorkbenchMessages(payload.conversationId);
    queryClient.setQueryData(workbenchQueryKeys.messages(payload.conversationId), messages);
  }
}

function readAdminMessageEventPayload(data: string): AdminMessageEventPayload {
  try {
    const parsed = JSON.parse(data) as unknown;
    if (!isRecord(parsed)) return {};
    return {
      conversationId: typeof parsed.conversationId === "string" ? parsed.conversationId : undefined,
      messageId: typeof parsed.messageId === "string" ? parsed.messageId : undefined,
      message: isBackendMessage(parsed.message) ? parsed.message : undefined,
      conversation: isBackendConversation(parsed.conversation) ? parsed.conversation : undefined,
    };
  } catch {
    return {};
  }
}

function applyAdminEventPatch(
  queryClient: ReturnType<typeof useQueryClient>,
  payload: AdminMessageEventPayload,
  currentConversationId: string | null,
) {
  if (payload.conversation) {
    queryClient.setQueryData<WorkbenchWorkspaceData | undefined>(workbenchQueryKeys.workspace, (current) => {
      if (!current) return current;
      return {
        ...current,
        conversations: upsertConversation(current.conversations, payload.conversation!),
      };
    });
  }

  if (payload.message && payload.conversationId) {
    queryClient.setQueryData<BackendMessage[] | undefined>(
      workbenchQueryKeys.messages(payload.conversationId),
      (current) => upsertMessage(current ?? [], payload.message!),
    );
    window.dispatchEvent(
      new CustomEvent<WorkbenchRealtimeMessageDetail>(workbenchRealtimeMessageEvent, {
        detail: {
          conversationId: payload.conversationId,
          message: payload.message,
        },
      }),
    );
  }
}

function upsertConversation(conversations: BackendConversation[], next: BackendConversation): BackendConversation[] {
  const index = conversations.findIndex((item) => item.id === next.id);
  if (index < 0) return [next, ...conversations];
  return conversations.map((item) => (item.id === next.id ? { ...item, ...next } : item));
}

function upsertMessage(messages: BackendMessage[], next: BackendMessage): BackendMessage[] {
  if (messages.some((item) => item.id === next.id || item.messageId === next.messageId)) {
    return messages.map((item) => (item.id === next.id || item.messageId === next.messageId ? { ...item, ...next } : item));
  }
  return [...messages, next].sort((left, right) => new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime());
}

function isBackendMessage(value: unknown): value is BackendMessage {
  const record = asRecord(value);
  return (
    typeof record?.id === "string" &&
    typeof record.messageId === "string" &&
    typeof record.senderWxid === "string" &&
    typeof record.isSelf === "boolean" &&
    typeof record.status === "string" &&
    Boolean(record.sentAt) &&
    Boolean(record.payload)
  );
}

function isBackendConversation(value: unknown): value is BackendConversation {
  const record = asRecord(value);
  return (
    typeof record?.id === "string" &&
    typeof record.peerWxid === "string" &&
    (record.type === "private" || record.type === "group")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}
