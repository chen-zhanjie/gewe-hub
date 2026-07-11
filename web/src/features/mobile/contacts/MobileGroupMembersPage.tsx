import { MoreHorizontal, RefreshCcw, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MobileActionSheet } from "@/features/mobile/MobileActionSheet";
import { MobilePage } from "@/features/mobile/MobilePage";
import { useRefreshWorkbenchQueries, type WorkbenchGroupMember } from "@/features/workbench/queries";
import { useWorkbenchConversationSurfaceController } from "@/features/workbench/useWorkbenchConversationSurfaceController";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/lib/workspace-data";

const longPressDelayMs = 500;

export function MobileGroupMembersPage({
  conversation,
  onBack,
  onOpenContact,
}: {
  conversation?: ConversationSummary;
  onBack: () => void;
  onOpenContact: (wxid: string) => void;
}) {
  const { refreshWorkspace, refreshGroupMembers, searchGroupMembers, loadMoreGroupMembers } = useRefreshWorkbenchQueries();
  const surface = useWorkbenchConversationSurfaceController({
    selectedConversation: conversation,
    apps: [],
    refreshWorkspace,
    refreshGroupMembers,
    searchGroupMembers,
    loadMoreGroupMembers,
  });
  const data = surface.groupMembersQuery.data;
  const [search, setSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<WorkbenchGroupMember | null>(null);
  const [editingMember, setEditingMember] = useState<WorkbenchGroupMember | null>(null);

  useEffect(() => setSearch(data?.search ?? ""), [data?.search]);

  return (
    <MobilePage
      title="群成员"
      subtitle={conversation?.name ?? "未选择群聊"}
      onBack={onBack}
      actions={(
        <button
          type="button"
          aria-label="同步群成员"
          disabled={!data?.group || surface.syncingGroupMembers}
          onClick={() => void surface.handleSyncGroupMembers()}
          className="mobile-icon-button disabled:opacity-50"
        >
          <RefreshCcw className={cn("size-5", surface.syncingGroupMembers && "animate-spin")} />
        </button>
      )}
    >
      <div className="grid gap-3 p-4">
        <p className="text-sm text-muted-foreground">共 {data?.total ?? 0} 位成员</p>
        <form
          role="search"
          aria-label="搜索群成员"
          className="flex min-h-11 items-center gap-2 rounded-xl border bg-background px-3"
          onSubmit={(event) => {
            event.preventDefault();
            void surface.handleSearchGroupMembers(search);
          }}
        >
          <Search className="size-4 text-muted-foreground" />
          <input
            type="search"
            role="searchbox"
            aria-label="搜索群成员"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            placeholder="搜索群成员"
          />
        </form>

        {surface.groupMembersQuery.isLoading || surface.searchingMembers ? <SkeletonBlock rows={5} /> : null}
        {surface.groupMembersError ? <div className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{surface.groupMembersError}</div> : null}
        {!surface.groupMembersQuery.isLoading && !surface.groupMembersError && !data?.group ? (
          <div className="rounded-xl border p-4 text-sm text-muted-foreground">未找到本地群资料，请先同步群成员</div>
        ) : null}
        {data?.group && data.members.length === 0 && !surface.searchingMembers ? (
          <div className="rounded-xl border p-4 text-sm text-muted-foreground">{data.search ? "无匹配成员" : "暂无群成员"}</div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border bg-background">
          {data?.members.map((member) => (
            <MobileGroupMemberRow key={member.id} member={member} onOpenActions={() => setSelectedMember(member)} />
          ))}
        </div>

        {data?.hasMore ? (
          <button
            type="button"
            disabled={surface.loadingMoreMembers}
            onClick={() => void surface.handleLoadMoreGroupMembers()}
            className="min-h-11 rounded-xl border bg-background px-4 text-sm disabled:opacity-50"
          >
            {surface.loadingMoreMembers ? "加载中" : "加载更多群成员"}
          </button>
        ) : data?.group ? <div className="text-center text-xs text-muted-foreground">没有更多群成员了</div> : null}
      </div>

      <MobileActionSheet
        open={Boolean(selectedMember)}
        title={selectedMember ? readGroupMemberDisplayName(selectedMember) : "群成员操作"}
        onClose={() => setSelectedMember(null)}
        actions={selectedMember ? [
          { id: "remark", label: "编辑成员备注", onSelect: () => setEditingMember(selectedMember) },
          { id: "detail", label: "查看联系人详情", onSelect: () => onOpenContact(selectedMember.wxid) },
        ] : []}
      />
      <MemberRemarkDialog
        member={editingMember}
        saving={Boolean(editingMember && surface.savingMemberId === editingMember.id)}
        onClose={() => setEditingMember(null)}
        onSave={(remark) => {
          if (!editingMember) return;
          void surface.handleSaveGroupMemberRemark(editingMember.id, remark);
          setEditingMember(null);
        }}
      />
    </MobilePage>
  );
}

function MobileGroupMemberRow({ member, onOpenActions }: { member: WorkbenchGroupMember; onOpenActions: () => void }) {
  const timerRef = useRef<number | null>(null);
  const memberName = readGroupMemberDisplayName(member);
  function clearLongPress() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
  function startLongPress() {
    clearLongPress();
    timerRef.current = window.setTimeout(onOpenActions, longPressDelayMs);
  }
  return (
    <button
      type="button"
      aria-label={`群成员 ${memberName}`}
      onClick={onOpenActions}
      onPointerDown={startLongPress}
      onPointerUp={clearLongPress}
      onPointerMove={clearLongPress}
      onPointerCancel={clearLongPress}
      onContextMenu={(event) => { event.preventDefault(); onOpenActions(); }}
      className={cn("flex min-h-[64px] w-full items-center gap-3 border-b px-3 text-left last:border-b-0", member.status && member.status !== "active" && "opacity-60")}
    >
      <Avatar name={memberName} src={member.avatarUrl} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{memberName}</span>
        <span className="block truncate font-mono text-xs text-muted-foreground">{member.platformRemark ? member.wxid : member.wxid}</span>
      </span>
      {member.status && member.status !== "active" ? <StatusBadge status={member.status} /> : null}
      <MoreHorizontal className="size-4 text-muted-foreground" />
    </button>
  );
}

function MemberRemarkDialog({ member, saving, onClose, onSave }: { member: WorkbenchGroupMember | null; saving: boolean; onClose: () => void; onSave: (remark: string) => void }) {
  const [remark, setRemark] = useState("");
  useEffect(() => setRemark(member?.platformRemark ?? ""), [member]);
  return (
    <Dialog open={Boolean(member)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>编辑成员备注</DialogTitle></DialogHeader>
        <input aria-label="成员备注" value={remark} onChange={(event) => setRemark(event.target.value)} className="min-h-11 rounded-xl border bg-background px-3 text-sm outline-none" />
        <DialogFooter>
          <button type="button" disabled={saving} onClick={onClose} className="min-h-11 rounded-xl border px-4 text-sm">取消</button>
          <button type="button" aria-label="保存成员备注" disabled={!member || saving} onClick={() => onSave(remark)} className="min-h-11 rounded-xl bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">{saving ? "保存中" : "保存"}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function readGroupMemberDisplayName(member: WorkbenchGroupMember): string {
  const baseName = member.displayName || member.nickname || member.wxid;
  if (member.platformRemark && member.displayName) return `${member.platformRemark}(${member.displayName})`;
  return member.platformRemark || baseName;
}
