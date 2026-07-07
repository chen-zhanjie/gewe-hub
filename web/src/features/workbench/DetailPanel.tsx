import { Check, ChevronDown, ChevronRight, Pencil, Search, X } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/AlertDialog";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";
import { DebugPanel } from "@/features/workbench/MessageDebugDialog";
import type {
  HubAppSummary,
  WorkbenchGroupMembersData,
  WorkbenchGroupMember,
} from "@/features/workbench/queries";
import type { ConversationSummary, MessageItem } from "@/lib/workspace-data";

export interface BindingDraft {
  appId: string;
  deliveryFilter: "all" | "at_only";
  debounceMs: string;
  maxWaitMs: string;
}

export type DetailSectionId = "info" | "binding" | "members" | "debug";

export type DetailSectionState = Record<DetailSectionId, boolean>;

export function DetailPanel({
  detailSections,
  selectedConversation,
  selectedMessage,
  apps,
  bindingDraft,
  bindingSaving,
  bindingError,
  conversationRemarkDraft,
  remarkSaving,
  remarkError,
  confirmingUnbind,
  groupMembersData,
  groupMembersLoading,
  groupMembersError,
  savingMemberId,
  loadingMoreMembers,
  searchingMembers,
  onToggleSection,
  onBindingDraftChange,
  onRemarkChange,
  onSaveRemark,
  onSaveBinding,
  onUnbind,
  onConfirmUnbind,
  onCancelUnbind,
  onSaveMemberRemark,
  onLoadMoreMembers,
  onSearchMembers,
}: {
  detailSections: DetailSectionState;
  selectedConversation?: ConversationSummary;
  selectedMessage: MessageItem | null;
  apps: HubAppSummary[];
  bindingDraft: BindingDraft;
  bindingSaving: boolean;
  bindingError: string | null;
  conversationRemarkDraft: string;
  remarkSaving: boolean;
  remarkError: string | null;
  confirmingUnbind: boolean;
  groupMembersData?: WorkbenchGroupMembersData;
  groupMembersLoading: boolean;
  groupMembersError: string | null;
  savingMemberId: string | null;
  loadingMoreMembers: boolean;
  searchingMembers: boolean;
  onToggleSection: (sectionId: DetailSectionId) => void;
  onBindingDraftChange: (draft: BindingDraft) => void;
  onRemarkChange: (remark: string) => void;
  onSaveRemark: () => void | Promise<void>;
  onSaveBinding: () => void;
  onUnbind: () => void;
  onConfirmUnbind: () => void;
  onCancelUnbind: () => void;
  onSaveMemberRemark: (memberId: string, remark: string) => void;
  onLoadMoreMembers: () => void;
  onSearchMembers: (search: string) => void;
}) {
  return (
    <aside aria-label="会话详情" className="flex w-80 shrink-0 flex-col border-l bg-background">
      <div className="flex h-12 items-center border-b px-4">
        <h2 className="text-sm font-medium">会话详情</h2>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <DetailSection
          sectionId="info"
          title="会话信息"
          open={detailSections.info}
          onToggle={() => onToggleSection("info")}
        >
          <ConversationInfoPanel conversation={selectedConversation} draft={bindingDraft} />
        </DetailSection>
        <DetailSection
          sectionId="binding"
          title="绑定与投递"
          open={detailSections.binding}
          onToggle={() => onToggleSection("binding")}
        >
          <ConversationBindingPanel
            conversation={selectedConversation}
            apps={apps}
            draft={bindingDraft}
            saving={bindingSaving}
            error={bindingError}
            remarkDraft={conversationRemarkDraft}
            remarkSaving={remarkSaving}
            remarkError={remarkError}
            confirmingUnbind={confirmingUnbind}
            onDraftChange={onBindingDraftChange}
            onRemarkChange={onRemarkChange}
            onSaveRemark={onSaveRemark}
            onSave={onSaveBinding}
            onUnbind={onUnbind}
            onConfirmUnbind={onConfirmUnbind}
            onCancelUnbind={onCancelUnbind}
          />
        </DetailSection>
        <DetailSection
          sectionId="members"
          title="成员群"
          open={detailSections.members}
          onToggle={() => onToggleSection("members")}
        >
          <MemberList
            conversation={selectedConversation}
            data={groupMembersData}
            loading={groupMembersLoading}
            error={groupMembersError}
            savingMemberId={savingMemberId}
            loadingMore={loadingMoreMembers}
            searching={searchingMembers}
            onSaveRemark={onSaveMemberRemark}
            onLoadMore={onLoadMoreMembers}
            onSearch={onSearchMembers}
          />
        </DetailSection>
        <DetailSection
          sectionId="debug"
          title="快捷调试入口"
          open={detailSections.debug}
          onToggle={() => onToggleSection("debug")}
        >
          <DebugPanel message={selectedMessage} />
        </DetailSection>
      </div>
    </aside>
  );
}

function DetailSection({
  sectionId,
  title,
  open,
  onToggle,
  children,
}: {
  sectionId: DetailSectionId;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <section className="rounded-md border bg-background">
      <button
        type="button"
        aria-label={`${open ? "折叠" : "展开"}${title}`}
        aria-expanded={open}
        aria-controls={`workbench-detail-section-${sectionId}`}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-medium"
      >
        <span>{title}</span>
        <Icon className="size-4 text-muted-foreground" />
      </button>
      {open ? (
        <div id={`workbench-detail-section-${sectionId}`} className="border-t p-3">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function ConversationInfoPanel({ conversation, draft }: { conversation?: ConversationSummary; draft: BindingDraft }) {
  return (
    <dl className="space-y-3 text-sm">
      <InfoRow label="类型" value={conversation?.type === "group" ? "群聊" : "私聊"} />
      <InfoRow label="绑定应用" value={conversation?.appName ?? "未绑定"} />
      <InfoRow label="过滤器" value={draft.deliveryFilter === "at_only" ? "只投递 @ 我" : "全部消息"} />
      <InfoRow label="状态" value={conversation?.status ?? "unknown"} />
    </dl>
  );
}

function ConversationRemarkEditor({
  conversation,
  remarkDraft,
  remarkSaving,
  remarkError,
  onRemarkChange,
  onSaveRemark,
}: {
  conversation?: ConversationSummary;
  remarkDraft: string;
  remarkSaving: boolean;
  remarkError: string | null;
  onRemarkChange: (remark: string) => void;
  onSaveRemark: () => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const currentRemark = conversation?.raw.platformRemark?.trim() ?? "";
  const displayRemark = currentRemark || "未设置";
  const placeholder = conversation?.raw.name || conversation?.originalName || conversation?.raw.peerWxid || "未命名会话";

  useEffect(() => {
    setEditing(false);
  }, [conversation?.id]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function startEditing() {
    if (!conversation || remarkSaving) return;
    onRemarkChange(currentRemark);
    setEditing(true);
  }

  function cancelEditing() {
    onRemarkChange(currentRemark);
    setEditing(false);
  }

  async function saveRemark() {
    if (!conversation || remarkSaving) return;
    await onSaveRemark();
    setEditing(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveRemark();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditing();
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">会话备注</h3>
        {!editing ? (
          <button
            type="button"
            aria-label="编辑会话备注"
            title="编辑会话备注"
            disabled={!conversation || remarkSaving}
            onClick={startEditing}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Pencil className="size-4" />
          </button>
        ) : null}
      </div>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            aria-label="会话备注"
            value={remarkDraft}
            onChange={(event) => onRemarkChange(event.target.value)}
            onKeyDown={handleKeyDown}
            className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none"
            placeholder={placeholder}
          />
          <button
            type="button"
            aria-label="保存会话备注"
            title="保存会话备注"
            disabled={!conversation || remarkSaving}
            onClick={() => {
              void saveRemark();
            }}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="size-4" />
          </button>
          <button
            type="button"
            aria-label="取消编辑会话备注"
            title="取消编辑会话备注"
            disabled={remarkSaving}
            onClick={cancelEditing}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className={cn("rounded-md bg-muted/50 px-3 py-2 text-sm", !currentRemark && "text-muted-foreground")}>
          {displayRemark}
        </div>
      )}
      {remarkError ? <p className="text-sm text-destructive">{remarkError}</p> : null}
    </div>
  );
}

function ConversationBindingPanel({
  conversation,
  apps,
  draft,
  saving,
  error,
  remarkDraft,
  remarkSaving,
  remarkError,
  confirmingUnbind,
  onDraftChange,
  onRemarkChange,
  onSaveRemark,
  onSave,
  onUnbind,
  onConfirmUnbind,
  onCancelUnbind,
}: {
  conversation?: ConversationSummary;
  apps: HubAppSummary[];
  draft: BindingDraft;
  saving: boolean;
  error: string | null;
  remarkDraft: string;
  remarkSaving: boolean;
  remarkError: string | null;
  confirmingUnbind: boolean;
  onDraftChange: (draft: BindingDraft) => void;
  onRemarkChange: (remark: string) => void;
  onSaveRemark: () => void | Promise<void>;
  onSave: () => void;
  onUnbind: () => void;
  onConfirmUnbind: () => void;
  onCancelUnbind: () => void;
}) {
  const isBound = Boolean(conversation?.raw.app?.id);
  return (
    <div className="space-y-4">
      <section className="space-y-3">
        <ConversationRemarkEditor
          conversation={conversation}
          remarkDraft={remarkDraft}
          remarkSaving={remarkSaving}
          remarkError={remarkError}
          onRemarkChange={onRemarkChange}
          onSaveRemark={onSaveRemark}
        />
      </section>
      <section className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-medium">投递设置</h3>
        <div className="space-y-3">
          <label className="block text-xs text-muted-foreground">
            绑定应用
            <select
              aria-label="绑定应用"
              value={draft.appId}
              onChange={(event) => onDraftChange({ ...draft, appId: event.target.value })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none"
            >
              <option value="">未绑定</option>
              {apps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted-foreground">
            投递过滤
            <select
              aria-label="投递过滤"
              value={draft.deliveryFilter}
              onChange={(event) => onDraftChange({ ...draft, deliveryFilter: event.target.value === "at_only" ? "at_only" : "all" })}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none"
            >
              <option value="all">全部消息</option>
              <option value="at_only">只投递 @ 我</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-muted-foreground">
              防抖毫秒
              <input
                aria-label="防抖毫秒"
                inputMode="numeric"
                value={draft.debounceMs}
                onChange={(event) => onDraftChange({ ...draft, debounceMs: event.target.value })}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none"
                placeholder="默认"
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              最大等待毫秒
              <input
                aria-label="最大等待毫秒"
                inputMode="numeric"
                value={draft.maxWaitMs}
                onChange={(event) => onDraftChange({ ...draft, maxWaitMs: event.target.value })}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none"
                placeholder="默认"
              />
            </label>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <button
            type="button"
            disabled={!conversation || !draft.appId || saving}
            onClick={onSave}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "保存中" : "保存绑定"}
          </button>
          {isBound ? (
            <button
              type="button"
              disabled={!conversation || saving}
              onClick={onUnbind}
              className="w-full rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive disabled:cursor-not-allowed disabled:opacity-50"
            >
              解绑应用
            </button>
          ) : null}
          <AlertDialog open={confirmingUnbind} onOpenChange={(open) => !open && onCancelUnbind()}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>解绑应用</AlertDialogTitle>
                <AlertDialogDescription>解绑后该会话消息将停止投递</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={saving}>取消</AlertDialogCancel>
                <AlertDialogAction
                  disabled={!conversation || saving}
                  onClick={(event) => {
                    event.preventDefault();
                    onConfirmUnbind();
                  }}
                  className="bg-destructive text-primary-foreground hover:bg-destructive/90"
                >
                  确认解绑
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </section>
    </div>
  );
}

function MemberList({
  conversation,
  data,
  loading,
  error,
  savingMemberId,
  loadingMore,
  searching,
  onSaveRemark,
  onLoadMore,
  onSearch,
}: {
  conversation?: ConversationSummary;
  data?: WorkbenchGroupMembersData;
  loading: boolean;
  error: string | null;
  savingMemberId: string | null;
  loadingMore: boolean;
  searching: boolean;
  onSaveRemark: (memberId: string, remark: string) => void;
  onLoadMore: () => void;
  onSearch: (search: string) => void;
}) {
  if (!conversation) {
    return <div className="text-sm text-muted-foreground">请选择会话查看成员</div>;
  }
  if (conversation.type !== "group") {
    return <div className="text-sm text-muted-foreground">仅群聊会话有成员列表</div>;
  }
  if (loading) {
    return <div className="text-sm text-muted-foreground">正在加载成员</div>;
  }
  if (error) {
    return <div className="rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive">{error}</div>;
  }
  if (!data?.group) {
    return <div className="text-sm text-muted-foreground">未找到本地群资料，请先同步群成员</div>;
  }
  if (data.members.length === 0 && !data.search) {
    return <div className="text-sm text-muted-foreground">暂无群成员</div>;
  }
  return (
    <FilterableMemberList
      data={data}
      savingMemberId={savingMemberId}
      loadingMore={loadingMore}
      searching={searching}
      onSaveRemark={onSaveRemark}
      onLoadMore={onLoadMore}
      onSearch={onSearch}
    />
  );
}

function FilterableMemberList({
  data,
  savingMemberId,
  loadingMore,
  searching,
  onSaveRemark,
  onLoadMore,
  onSearch,
}: {
  data: WorkbenchGroupMembersData;
  savingMemberId: string | null;
  loadingMore: boolean;
  searching: boolean;
  onSaveRemark: (memberId: string, remark: string) => void;
  onLoadMore: () => void;
  onSearch: (search: string) => void;
}) {
  const [search, setSearch] = useState(data.search);
  const filteredMembers = useMemo(() => filterGroupMembers(data.members, search), [data.members, search]);

  useEffect(() => {
    setSearch(data.search);
  }, [data.search]);

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
        <Search className="size-4" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSearch(search);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-foreground outline-none"
          placeholder="搜索群成员"
        />
      </label>
      {searching ? <div className="text-sm text-muted-foreground">正在搜索群成员</div> : null}
      {filteredMembers.length === 0 ? <div className="text-sm text-muted-foreground">无匹配成员</div> : null}
      {filteredMembers.map((member) => (
        <MemberRow
          key={member.id}
          member={member}
          saving={savingMemberId === member.id}
          onSaveRemark={(remark) => onSaveRemark(member.id, remark)}
        />
      ))}
      <div className="pt-1">
        {data.hasMore ? (
          <button
            type="button"
            disabled={loadingMore}
            onClick={onLoadMore}
            className="w-full rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingMore ? "加载中" : "加载更多群成员"}
          </button>
        ) : (
          <div className="text-center text-xs text-muted-foreground">没有更多群成员了</div>
        )}
      </div>
    </div>
  );
}

function filterGroupMembers(members: WorkbenchGroupMember[], search: string): WorkbenchGroupMember[] {
  const keyword = search.trim().toLowerCase();
  if (!keyword) return members;
  return members.filter((member) =>
    [member.platformRemark, member.displayName, member.nickname, member.wxid]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword)),
  );
}

function MemberRow({
  member,
  saving,
  onSaveRemark,
}: {
  member: WorkbenchGroupMember;
  saving: boolean;
  onSaveRemark: (remark: string) => void;
}) {
  const [remark, setRemark] = useState(member.platformRemark ?? "");
  const memberName = readGroupMemberDisplayName(member);

  useEffect(() => {
    setRemark(member.platformRemark ?? "");
  }, [member.id, member.platformRemark]);

  return (
    <div className={cn("space-y-2 rounded-md border p-3", member.status !== "active" && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={memberName} src={member.avatarUrl} size={32} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{memberName}</div>
            <div className="truncate font-mono text-xs text-muted-foreground">{member.wxid}</div>
          </div>
        </div>
        <StatusBadge status={member.status ?? "unknown"} />
      </div>
      <div className="flex gap-2">
        <input
          aria-label={`成员 ${member.wxid} 备注`}
          value={remark}
          onChange={(event) => setRemark(event.target.value)}
          className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none"
          placeholder="平台备注"
        />
        <button
          type="button"
          disabled={saving}
          onClick={() => onSaveRemark(remark)}
          className="shrink-0 rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "保存中" : `保存 ${member.wxid} 备注`}
        </button>
      </div>
    </div>
  );
}

function readGroupMemberDisplayName(member: WorkbenchGroupMember): string {
  const baseName = member.displayName || member.nickname || member.wxid;
  if (member.platformRemark && member.displayName) return `${member.platformRemark}(${member.displayName})`;
  return member.platformRemark || baseName;
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
