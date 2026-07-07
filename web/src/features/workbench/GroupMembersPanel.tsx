import { MoreHorizontal, Pencil, RefreshCcw, Search, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/ContextMenu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";
import type { WorkbenchGroupMembersData, WorkbenchGroupMember } from "@/features/workbench/queries";
import type { ConversationSummary } from "@/lib/workspace-data";

interface GroupMembersPanelProps {
  conversation?: ConversationSummary;
  data?: WorkbenchGroupMembersData;
  loading: boolean;
  error: string | null;
  savingMemberId: string | null;
  syncing: boolean;
  loadingMore: boolean;
  searching: boolean;
  onOpenContact: (wxid: string) => void;
  onSaveRemark: (memberId: string, remark: string) => void;
  onSync: () => void;
  onLoadMore: () => void;
  onSearch: (search: string) => void;
}

export function GroupMembersPanel({
  conversation,
  data,
  loading,
  error,
  savingMemberId,
  syncing,
  loadingMore,
  searching,
  onOpenContact,
  onSaveRemark,
  onSync,
  onLoadMore,
  onSearch,
}: GroupMembersPanelProps) {
  if (!conversation || conversation.type !== "group") return null;

  return (
    <aside aria-label="群成员面板" className="flex w-72 shrink-0 flex-col border-l bg-background">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-medium">成员 {data?.total ?? 0}</h2>
        <button
          type="button"
          aria-label="同步群成员"
          title="同步群成员"
          disabled={!data?.group || syncing}
          onClick={onSync}
          className="rounded-md border p-2 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCcw className={cn("size-4", syncing && "animate-spin")} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <GroupMembersContent
          data={data}
          loading={loading}
          error={error}
          savingMemberId={savingMemberId}
          loadingMore={loadingMore}
          searching={searching}
          onOpenContact={onOpenContact}
          onSaveRemark={onSaveRemark}
          onLoadMore={onLoadMore}
          onSearch={onSearch}
        />
      </div>
    </aside>
  );
}

function GroupMembersContent({
  data,
  loading,
  error,
  savingMemberId,
  loadingMore,
  searching,
  onOpenContact,
  onSaveRemark,
  onLoadMore,
  onSearch,
}: Omit<GroupMembersPanelProps, "conversation" | "syncing" | "onSync">) {
  const [search, setSearch] = useState(data?.search ?? "");
  const [editingMember, setEditingMember] = useState<WorkbenchGroupMember | null>(null);
  const filteredMembers = useMemo(() => filterGroupMembers(data?.members ?? [], search), [data?.members, search]);

  useEffect(() => {
    setSearch(data?.search ?? "");
  }, [data?.search]);

  if (loading) return <SkeletonBlock rows={6} />;
  if (error) return <div className="rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive">{error}</div>;
  if (!data?.group) return <div className="text-sm text-muted-foreground">未找到本地群资料，请先同步群成员</div>;

  return (
    <div className="space-y-3">
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
      {searching ? <SkeletonBlock rows={2} /> : null}
      {filteredMembers.length === 0 ? <div className="text-sm text-muted-foreground">无匹配成员</div> : null}
      <div className="space-y-1">
        {filteredMembers.map((member) => (
          <GroupMemberRow
            key={member.id}
            member={member}
            onOpenContact={onOpenContact}
            onEditRemark={() => setEditingMember(member)}
          />
        ))}
      </div>
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
      <MemberRemarkDialog
        member={editingMember}
        saving={Boolean(editingMember && savingMemberId === editingMember.id)}
        onOpenChange={(open) => {
          if (!open) setEditingMember(null);
        }}
        onSave={(remark) => {
          if (!editingMember) return;
          onSaveRemark(editingMember.id, remark);
          setEditingMember(null);
        }}
      />
    </div>
  );
}

function GroupMemberRow({
  member,
  onOpenContact,
  onEditRemark,
}: {
  member: WorkbenchGroupMember;
  onOpenContact: (wxid: string) => void;
  onEditRemark: () => void;
}) {
  const memberName = readGroupMemberDisplayName(member);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          aria-label={`查看群成员 ${memberName}`}
          onClick={() => onOpenContact(member.wxid)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted",
            member.status && member.status !== "active" && "opacity-60",
          )}
        >
          <Avatar name={memberName} src={member.avatarUrl} size={32} className="size-7" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{memberName}</span>
            {member.platformRemark ? (
              <span className="block truncate text-xs text-muted-foreground">{member.platformRemark}</span>
            ) : (
              <span className="block truncate font-mono text-xs text-muted-foreground">{member.wxid}</span>
            )}
          </span>
          {member.status && member.status !== "active" ? <StatusBadge status={member.status} /> : null}
          <MoreHorizontal className="size-4 text-muted-foreground" />
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent aria-label="群成员操作">
        <ContextMenuItem onSelect={onEditRemark}>
          <Pencil className="size-4" />
          编辑成员备注
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onOpenContact(member.wxid)}>
          <UserRound className="size-4" />
          查看详情
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function MemberRemarkDialog({
  member,
  saving,
  onOpenChange,
  onSave,
}: {
  member: WorkbenchGroupMember | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (remark: string) => void;
}) {
  const [remark, setRemark] = useState("");

  useEffect(() => {
    setRemark(member?.platformRemark ?? "");
  }, [member]);

  return (
    <Dialog open={Boolean(member)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>编辑成员备注</DialogTitle>
        </DialogHeader>
        <input
          aria-label="成员备注"
          value={remark}
          onChange={(event) => setRemark(event.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm outline-none"
          placeholder={member ? readGroupMemberDisplayName(member) : "平台备注"}
        />
        <DialogFooter>
          <button
            type="button"
            disabled={saving}
            onClick={() => onOpenChange(false)}
            className="rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!member || saving}
            onClick={() => onSave(remark)}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "保存中" : "保存"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function filterGroupMembers(members: WorkbenchGroupMember[], search: string): WorkbenchGroupMember[] {
  const keyword = search.trim().toLowerCase();
  const sortedMembers = [...members].sort((a, b) => {
    const aInactive = a.status && a.status !== "active" ? 1 : 0;
    const bInactive = b.status && b.status !== "active" ? 1 : 0;
    return aInactive - bInactive;
  });
  if (!keyword) return sortedMembers;
  return sortedMembers.filter((member) =>
    [member.platformRemark, member.displayName, member.nickname, member.wxid]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword)),
  );
}

function readGroupMemberDisplayName(member: WorkbenchGroupMember): string {
  const baseName = member.displayName || member.nickname || member.wxid;
  if (member.platformRemark && member.displayName) return `${member.platformRemark}(${member.displayName})`;
  return member.platformRemark || baseName;
}
