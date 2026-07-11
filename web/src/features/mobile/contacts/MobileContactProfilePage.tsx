import type { ContactProfileResponse } from "@gewehub/contracts";
import { MessageCircle } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { DescriptionList } from "@/components/ui/DescriptionList";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MobilePage } from "@/features/mobile/MobilePage";
import { useWorkbenchContactProfileQuery } from "@/features/workbench/queries";

export function MobileContactProfilePage({
  accountId,
  wxid,
  onBack,
  onOpenConversation,
}: {
  accountId?: string | null;
  wxid?: string | null;
  onBack: () => void;
  onOpenConversation: (conversationId: string) => void;
}) {
  const profileQuery = useWorkbenchContactProfileQuery(accountId, wxid, true);
  const profile = profileQuery.data;
  const displayName = profile ? readContactDisplayName(profile) : wxid || "联系人";

  return (
    <MobilePage title="联系人详情" subtitle={wxid ?? "未选择联系人"} onBack={onBack}>
      <div className="grid gap-4 p-4">
        {profileQuery.isLoading ? <SkeletonBlock rows={5} /> : null}
        {profileQuery.error ? (
          <div className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">
            {profileQuery.error instanceof Error ? profileQuery.error.message : "加载联系人失败"}
          </div>
        ) : null}
        {profile ? (
          <>
            <section className="rounded-2xl border bg-background p-4">
              <div className="flex items-center gap-3">
                <Avatar
                  name={displayName}
                  src={profile.contact?.avatarUrl ?? profile.groupMemberships[0]?.avatarUrl}
                  size={40}
                  className="size-14 text-lg"
                />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-semibold">{displayName}</h2>
                  <p className="truncate font-mono text-xs text-muted-foreground">{profile.wxid}</p>
                  <div className="mt-2">
                    <StatusBadge status={profile.contact?.status ?? profile.groupMemberships[0]?.status ?? "unknown"} />
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border bg-background p-4">
              <h2 className="mb-3 text-sm font-medium">资料</h2>
              <DescriptionList
                className="gap-3"
                items={[
                  { label: "wxid", value: <span className="break-all font-mono text-xs">{profile.wxid}</span> },
                  { label: "所属微信账号", value: profile.accountId },
                  { label: "来源", value: readContactSource(profile) },
                  { label: "联系人备注", value: profile.contact?.platformRemark },
                  { label: "群内显示名", value: profile.groupMemberships[0]?.displayName },
                  { label: "群内成员备注", value: profile.groupMemberships[0]?.platformRemark },
                ]}
              />
            </section>

            {profile.commonGroups.length > 0 ? (
              <section className="rounded-2xl border bg-background p-4">
                <h2 className="mb-3 text-sm font-medium">共同群聊</h2>
                <div className="grid gap-2">
                  {profile.commonGroups.slice(0, 5).map((group) => (
                    <div key={group.id} className="truncate rounded-xl bg-muted/60 px-3 py-2 text-sm">
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
                onClick={() => onOpenConversation(profile.privateConversation!.id)}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                <MessageCircle className="size-4" />
                打开私聊会话
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </MobilePage>
  );
}

function readContactDisplayName(profile: ContactProfileResponse): string {
  const contact = profile.contact;
  const membership = profile.groupMemberships[0];
  return contact?.platformRemark || membership?.platformRemark || membership?.displayName || contact?.nickname || membership?.nickname || profile.wxid;
}

function readContactSource(profile: ContactProfileResponse): string {
  if (profile.contact && profile.groupMemberships.length > 0) return "联系人 / 群成员";
  if (profile.contact) return "联系人";
  if (profile.groupMemberships.length > 0) return "群成员";
  return "未同步";
}
