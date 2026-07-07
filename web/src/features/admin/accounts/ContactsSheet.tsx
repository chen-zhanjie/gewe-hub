import type { ColumnDef } from "@tanstack/react-table";
import { RefreshCcw } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/Sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { cn } from "@/lib/utils";

export type ContactStatusFilter = "" | "active" | "deleted" | "blocked";

export interface ContactRow {
  id: string;
  wxid: string;
  name: string;
  entity: {
    platformRemark?: string | null;
    displayName?: string | null;
    wxid: string;
    avatarUrl?: string | null;
  };
  status: "active" | "deleted" | "blocked";
  platformRemark?: string | null;
  lastSyncedAt?: string | Date | null;
}

export interface GroupRow {
  id: string;
  wxid: string;
  name: string;
  entity: {
    platformRemark?: string | null;
    displayName?: string | null;
    wxid: string;
    avatarUrl?: string | null;
  };
  memberCount: number;
  status: "active" | "disbanded" | "quit";
  lastSyncedAt?: string | Date | null;
}

export function ContactsSheet({
  open,
  accountName,
  contacts,
  groups,
  loading,
  error,
  search,
  status,
  syncing,
  contactColumns,
  groupColumns,
  onSearchChange,
  onStatusChange,
  onSync,
  onOpenChange,
}: {
  open: boolean;
  accountName?: string;
  contacts: ContactRow[];
  groups: GroupRow[];
  loading: boolean;
  error: string | null;
  search: string;
  status: ContactStatusFilter;
  syncing: boolean;
  contactColumns: ColumnDef<ContactRow>[];
  groupColumns: ColumnDef<GroupRow>[];
  onSearchChange: (search: string) => void;
  onStatusChange: (status: string) => void;
  onSync: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[640px]">
        <SheetHeader className="pr-14">
          <SheetTitle>联系人</SheetTitle>
          <SheetDescription>{accountName ?? "查看账号联系人与群列表"}</SheetDescription>
        </SheetHeader>
        <SheetBody>
          {error ? <div className="mb-3 rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">{error}</div> : null}
          <Tabs defaultValue="contacts">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="contacts">联系人</TabsTrigger>
                <TabsTrigger value="groups">群列表</TabsTrigger>
              </TabsList>
              <button
                type="button"
                aria-label="同步通讯录"
                disabled={!open || syncing}
                onClick={onSync}
                className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCcw className={cn("size-4", syncing && "animate-spin")} />
                {syncing ? "同步中" : "同步通讯录"}
              </button>
            </div>
            <TabsContent value="contacts">
              <DataTable
                ariaLabel="联系人列表"
                columns={contactColumns}
                data={contacts}
                getRowId={(row) => row.id}
                loading={loading}
                emptyText="暂无联系人"
                toolbar={{
                  searchPlaceholder: "搜索联系人",
                  searchValue: search,
                  onSearchChange,
                  searchDebounceMs: 0,
                  facets: [
                    {
                      label: "联系人状态",
                      value: status,
                      options: [
                        { label: "全部", value: "" },
                        { label: "active", value: "active" },
                        { label: "deleted", value: "deleted" },
                        { label: "blocked", value: "blocked" },
                      ],
                      onValueChange: onStatusChange,
                    },
                  ],
                }}
              />
            </TabsContent>
            <TabsContent value="groups">
              <DataTable
                ariaLabel="群列表"
                columns={groupColumns}
                data={groups}
                getRowId={(row) => row.id}
                loading={loading}
                emptyText="暂无群聊"
              />
            </TabsContent>
          </Tabs>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
