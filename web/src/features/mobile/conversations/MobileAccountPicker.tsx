import { Check, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import type { AccountSummary } from "@/lib/workspace-data";
import { cn } from "@/lib/utils";

export function MobileAccountPicker({ open, accounts, selectedAccountId, onSelect, onClose }: { open: boolean; accounts: AccountSummary[]; selectedAccountId: string | null; onSelect: (accountId: string) => void; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return accounts;
    return accounts.filter((account) => [account.name, account.wxid, account.nickname ?? "", account.platformRemark ?? ""].some((value) => value.toLowerCase().includes(keyword)));
  }, [accounts, search]);
  if (!open) return null;

  return (
    <div className="mobile-action-overlay" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label="选择微信账号" className="mobile-action-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="mobile-action-handle" />
        <div className="flex min-h-11 items-center justify-between">
          <h2 className="text-base font-semibold">选择微信账号</h2>
          <button type="button" aria-label="关闭账号选择" className="mobile-icon-button" onClick={onClose}><X className="size-5" /></button>
        </div>
        {accounts.length > 5 ? (
          <label className="mx-1 mb-2 flex min-h-11 items-center gap-2 rounded-md bg-muted px-3 text-muted-foreground">
            <Search className="size-4" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索账号" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
        ) : null}
        <div className="max-h-[55dvh] overflow-y-auto">
          {filtered.map((account) => (
            <button key={account.id} type="button" aria-label={`${account.name} ${account.wxid}`} className="flex min-h-14 w-full items-center gap-3 border-t px-2 text-left" onClick={() => { onSelect(account.id); onClose(); }}>
              <Avatar name={account.name} src={account.avatarUrl} size={40} />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{account.name}</span><span className="block truncate font-mono text-xs text-muted-foreground">{account.wxid}</span></span>
              <span className={cn("text-xs", account.status === "online" ? "text-green-700" : account.status === "offline" ? "text-red-700" : "text-muted-foreground")}>{account.status === "online" ? "在线" : account.status === "offline" ? "离线" : "未知"}</span>
              {account.id === selectedAccountId ? <Check className="size-5 text-primary" /> : null}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
