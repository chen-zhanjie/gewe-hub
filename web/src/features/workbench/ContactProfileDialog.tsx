import type { ContactProfileResponse } from "@gewehub/contracts";
import { Avatar } from "@/components/ui/Avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useWorkbenchContactProfileQuery } from "@/features/workbench/queries";

interface ContactProfileDialogProps {
  accountId?: string | null;
  wxid?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenConversation?: (conversationId: string) => void;
}

export function ContactProfileDialog({
  accountId,
  wxid,
  open,
  onOpenChange,
  onOpenConversation,
}: ContactProfileDialogProps) {
  const profileQuery = useWorkbenchContactProfileQuery(accountId, wxid, open);
  const profile = profileQuery.data;
  const displayName = profile ? readContactDisplayName(profile) : wxid || "联系人";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>联系人详情</DialogTitle>
          <DialogDescription>{wxid ?? "未选择联系人"}</DialogDescription>
        </DialogHeader>
        {profileQuery.isLoading ? <div className="text-sm text-muted-foreground">正在加载联系人详情</div> : null}
        {profileQuery.error ? (
          <div className="rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive">
            {profileQuery.error instanceof Error ? profileQuery.error.message : "加载联系人失败"}
          </div>
        ) : null}
        {profile ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar
                name={displayName}
                src={profile.contact?.avatarUrl ?? profile.groupMemberships[0]?.avatarUrl}
                size={40}
                className="size-16 text-lg"
              />
              <div className="min-w-0">
                <div className="truncate text-base font-medium">{displayName}</div>
                <div className="truncate font-mono text-xs text-muted-foreground">{profile.wxid}</div>
                <div className="mt-2">
                  <StatusBadge status={profile.contact?.status ?? profile.groupMemberships[0]?.status ?? "unknown"} />
                </div>
              </div>
            </div>
            <DescriptionList
              items={[
                { label: "wxid", value: <span className="font-mono text-xs">{profile.wxid}</span> },
                { label: "所属微信账号", value: profile.accountId },
                { label: "来源", value: readContactSource(profile) },
                { label: "联系人备注", value: profile.contact?.platformRemark },
                { label: "群内显示名", value: profile.groupMemberships[0]?.displayName },
                { label: "群内成员备注", value: profile.groupMemberships[0]?.platformRemark },
              ]}
            />
            {profile.commonGroups.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">共同群聊</h3>
                <div className="space-y-1">
                  {profile.commonGroups.slice(0, 5).map((group) => (
                    <div key={group.id} className="truncate rounded-md bg-muted/50 px-3 py-2 text-sm">
                      {group.platformRemark || group.name || group.wxid}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            {profile.privateConversation ? (
              <button
                type="button"
                aria-label={`打开私聊会话 ${displayName}`}
                onClick={() => {
                  onOpenConversation?.(profile.privateConversation!.id);
                  onOpenChange(false);
                }}
                className="w-full rounded-md border px-3 py-2 text-sm hover:bg-muted"
              >
                打开私聊会话 {displayName}
              </button>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function readContactDisplayName(profile: ContactProfileResponse): string {
  const contact = profile.contact;
  const membership = profile.groupMemberships[0];
  return (
    contact?.platformRemark ||
    membership?.platformRemark ||
    membership?.displayName ||
    contact?.nickname ||
    membership?.nickname ||
    profile.wxid
  );
}

function readContactSource(profile: ContactProfileResponse): string {
  if (profile.contact && profile.groupMemberships.length > 0) return "联系人 / 群成员";
  if (profile.contact) return "联系人";
  if (profile.groupMemberships.length > 0) return "群成员";
  return "未同步";
}
