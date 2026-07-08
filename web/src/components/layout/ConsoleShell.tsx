import type { ComponentType, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Activity,
  AppWindow,
  Bell,
  BookOpenText,
  Code2,
  LogOut,
  MessageSquareText,
  Plus,
  Radio,
  RefreshCw,
  Send,
  Settings,
  Users
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  adminEventSourceStatusEvent,
  type AdminEventSourceStatusDetail,
  useWorkbenchWorkspaceQuery,
} from "@/features/workbench/queries";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { mapConversationSummary, type ConversationSummary } from "@/lib/workspace-data";

export type PageKey = "workbench" | "apps" | "accounts" | "deliveries" | "sendRequests" | "htmlPages" | "observability" | "settings";

interface NavItem {
  key: PageKey;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

interface ObservabilitySummary {
  failedTasks?: number;
}

const navItems: NavItem[] = [
  { key: "workbench", label: "聊天工作台", icon: MessageSquareText },
  { key: "apps", label: "应用管理", icon: AppWindow },
  { key: "accounts", label: "账号与联系人", icon: Users },
  { key: "deliveries", label: "推送日志", icon: Bell },
  { key: "sendRequests", label: "发送记录", icon: Send },
  { key: "htmlPages", label: "HTML 页面", icon: Code2 },
  { key: "observability", label: "运行观测", icon: Activity },
  { key: "settings", label: "接入设置", icon: Settings }
];

export const pageRoutes: Record<PageKey, `/${string}`> = {
  workbench: "/workbench",
  apps: "/apps",
  accounts: "/accounts",
  deliveries: "/deliveries",
  sendRequests: "/send-requests",
  htmlPages: "/html-pages",
  observability: "/observability",
  settings: "/settings",
};

interface ConsoleShellProps {
  activePage: PageKey;
  username: string;
  onLogout: () => void;
  children: ReactNode;
}

export function ConsoleShell({ activePage, username, onLogout, children }: ConsoleShellProps) {
  const navigate = useNavigate();
  const workspaceQuery = useWorkbenchWorkspaceQuery();
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [adminEventsDisconnected, setAdminEventsDisconnected] = useState(false);
  const [hasFailedTasks, setHasFailedTasks] = useState(false);
  const current = navItems.find((item) => item.key === activePage) ?? navItems[0];
  const conversations = useMemo(
    () => (workspaceQuery.data?.conversations ?? []).map(mapConversationSummary),
    [workspaceQuery.data?.conversations],
  );

  useEffect(() => {
    function handleCommandShortcut(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      setCommandOpen((open) => !open);
    }

    window.addEventListener("keydown", handleCommandShortcut);
    return () => window.removeEventListener("keydown", handleCommandShortcut);
  }, []);

  useEffect(() => {
    function handleShortcutHelp(event: KeyboardEvent) {
      if (event.key !== "?" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableElement(document.activeElement)) return;
      event.preventDefault();
      setShortcutHelpOpen(true);
    }

    window.addEventListener("keydown", handleShortcutHelp);
    return () => window.removeEventListener("keydown", handleShortcutHelp);
  }, []);

  useEffect(() => {
    function handleAdminEventSourceStatus(event: Event) {
      const detail = (event as CustomEvent<AdminEventSourceStatusDetail>).detail;
      setAdminEventsDisconnected(detail.status === "disconnected");
    }

    window.addEventListener(adminEventSourceStatusEvent, handleAdminEventSourceStatus);
    return () => window.removeEventListener(adminEventSourceStatusEvent, handleAdminEventSourceStatus);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refreshObservabilityBadge() {
      try {
        const summary = await apiFetch<ObservabilitySummary>("/api/observability/summary");
        if (!cancelled) setHasFailedTasks((summary.failedTasks ?? 0) > 0);
      } catch {
        if (!cancelled) setHasFailedTasks(false);
      }
    }

    void refreshObservabilityBadge();
    const timer = window.setInterval(() => {
      void refreshObservabilityBadge();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-muted/40">
        <div className="flex h-12 items-center gap-2 border-b px-4">
          <Radio className="size-4 text-primary" />
          <span className="text-sm font-semibold">GeWeHub</span>
        </div>
        <nav aria-label="主导航" className="space-y-1 p-2">
          {navItems.map((item) => (
            <NavButton
              key={item.key}
              item={item}
              active={item.key === activePage}
              hasAlert={item.key === "observability" && hasFailedTasks}
              onClick={() => {
                void navigate({ to: pageRoutes[item.key] });
              }}
            />
          ))}
        </nav>
        <div className="mt-auto border-t p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <BookOpenText className="size-4" />
            <span>v1 工作台壳</span>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-4">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{current.label}</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="size-2 rounded-full bg-green-100" />
              <span>GeWe 连接</span>
              <StatusBadge status="online" />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{username}</span>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"
            >
              <LogOut className="size-4 text-muted-foreground" />
              退出登录
            </button>
          </div>
        </header>
        {adminEventsDisconnected ? (
          <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            连接已断开，重连中…
          </div>
        ) : null}
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
      <CommandPalette
        open={commandOpen}
        conversations={conversations}
        onOpenChange={setCommandOpen}
        onNavigate={(to) => {
          setCommandOpen(false);
          void navigate({ to });
        }}
        onRunAction={(action) => {
          setCommandOpen(false);
          if (action === "sync-contacts") {
            void apiFetch("/api/contacts/sync", { method: "POST" });
            return;
          }
          void navigate({ to: pageRoutes.apps, hash: "new-app" });
        }}
      />
      <ShortcutHelpDialog open={shortcutHelpOpen} onOpenChange={setShortcutHelpOpen} />
    </div>
  );
}

function NavButton({ item, active, hasAlert, onClick }: { item: NavItem; active: boolean; hasAlert?: boolean; onClick: () => void }) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
        active && "bg-muted font-medium text-foreground"
      )}
    >
      <Icon className="size-4" />
      <span>{item.label}</span>
      {hasAlert ? (
        <>
          <span className="ml-auto size-2 rounded-full bg-destructive" aria-hidden="true" />
          <span className="sr-only">有失败任务</span>
        </>
      ) : null}
    </button>
  );
}

interface CommandPaletteProps {
  open: boolean;
  conversations: ConversationSummary[];
  onOpenChange: (open: boolean) => void;
  onNavigate: (to: `/${string}`) => void;
  onRunAction: (action: CommandActionKey) => void;
}

type CommandActionKey = "sync-contacts" | "new-app";

const commandActions: Array<{
  key: CommandActionKey;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { key: "sync-contacts", label: "同步通讯录", description: "拉取联系人、群和群成员最新状态", icon: RefreshCw },
  { key: "new-app", label: "新建应用", description: "打开应用管理并聚焦新建表单", icon: Plus },
];

function CommandPalette({ open, conversations, onOpenChange, onNavigate, onRunAction }: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredPages = useMemo(
    () =>
      navItems.filter((item) =>
        [item.label, pageRoutes[item.key]].some((value) => value.toLowerCase().includes(normalizedSearch)),
      ),
    [normalizedSearch],
  );
  const filteredConversations = useMemo(
    () =>
      conversations
        .filter((conversation) =>
          [conversation.name, conversation.originalName, conversation.raw.peerWxid, conversation.lastMessage].some((value) =>
            value.toLowerCase().includes(normalizedSearch),
          ),
        )
        .slice(0, 6),
    [conversations, normalizedSearch],
  );
  const filteredActions = useMemo(
    () =>
      commandActions.filter((action) =>
        [action.label, action.description].some((value) => value.toLowerCase().includes(normalizedSearch)),
      ),
    [normalizedSearch],
  );

  useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0" hideClose>
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>命令面板</DialogTitle>
          <DialogDescription>搜索页面、会话或常用动作</DialogDescription>
        </DialogHeader>
        <div className="border-b px-4 py-3">
          <input
            ref={inputRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full bg-transparent text-sm outline-none"
            placeholder="搜索页面、会话或动作"
          />
        </div>
        <div className="max-h-[420px] overflow-y-auto p-2">
          <CommandSection title="页面">
            {filteredPages.map((item) => (
              <CommandButton key={item.key} ariaLabel={`打开 ${item.label}`} onSelect={() => onNavigate(pageRoutes[item.key])}>
                <span className="font-medium">打开 {item.label}</span>
                <span className="font-mono text-xs text-muted-foreground">{pageRoutes[item.key]}</span>
              </CommandButton>
            ))}
          </CommandSection>
          <CommandSection title="会话">
            {filteredConversations.length > 0 ? (
              filteredConversations.map((conversation) => (
                <CommandButton
                  key={conversation.id}
                  ariaLabel={`打开会话 ${conversation.name}`}
                  onSelect={() => onNavigate(pageRoutes.workbench)}
                >
                  <span className="font-medium">打开会话 {conversation.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{conversation.lastMessage}</span>
                </CommandButton>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-muted-foreground">暂无匹配会话</div>
            )}
          </CommandSection>
          <CommandSection title="动作">
            {filteredActions.map((action) => {
              const Icon = action.icon;
              return (
                <CommandButton key={action.key} ariaLabel={action.label} onSelect={() => onRunAction(action.key)}>
                  <span className="flex items-center gap-2 font-medium">
                    <Icon className="size-4 text-muted-foreground" />
                    {action.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{action.description}</span>
                </CommandButton>
              );
            })}
          </CommandSection>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CommandSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="py-1">
      <h3 className="px-3 py-1 text-xs font-medium text-muted-foreground">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function CommandButton({ children, ariaLabel, onSelect }: { children: ReactNode; ariaLabel: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onSelect}
      className="flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

const shortcutRows = [
  { keys: "⌘K / Ctrl K", action: "打开命令面板" },
  { keys: "?", action: "打开快捷键帮助" },
  { keys: "↑ / ↓", action: "工作台切换会话" },
  { keys: "Enter", action: "发送文本消息" },
  { keys: "Shift Enter", action: "消息输入框换行" },
  { keys: "Esc", action: "关闭弹窗或浮层" },
];

function ShortcutHelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>快捷键帮助</DialogTitle>
          <DialogDescription>GeWeHub 控制台常用键盘操作</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {shortcutRows.map((row) => (
            <div key={row.keys} className="flex items-center justify-between gap-4 rounded-md border bg-background px-3 py-2">
              <kbd className="shrink-0 rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">{row.keys}</kbd>
              <span className="text-sm">{row.action}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function isEditableElement(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}
