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
import type { BackendHubApp } from "./types";

export function DeleteAppDialog({
  app,
  deletingId,
  error,
  confirmText,
  onConfirmTextChange,
  onOpenChange,
  onConfirm,
}: {
  app: BackendHubApp | null;
  deletingId: string | null;
  error: string | null;
  confirmText: string;
  onConfirmTextChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const deleting = Boolean(app && deletingId === app.id);
  const conversationCount = app?._count?.conversations ?? 0;
  const deliveryCount = app?._count?.deliveries ?? 0;
  const canConfirm = Boolean(app && confirmText === app.name && !deleting);

  return (
    <AlertDialog open={app !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>停用应用</AlertDialogTitle>
          <AlertDialogDescription>
            停用后该应用 token 将不可再连接或发送，现有会话绑定、账号备注、推送记录和发送审计会继续保留。
          </AlertDialogDescription>
        </AlertDialogHeader>
        {app ? (
          <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
            <div className="font-medium text-destructive">{app.name}</div>
            <div className="text-xs text-muted-foreground">{conversationCount} 个绑定会话</div>
            <div className="text-xs text-muted-foreground">{deliveryCount} 条推送记录</div>
          </div>
        ) : null}
        {app ? (
          <label className="block text-xs text-muted-foreground">
            输入应用名确认停用
            <input
              aria-label="输入应用名确认停用"
              value={confirmText}
              disabled={deleting}
              onChange={(event) => onConfirmTextChange(event.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              placeholder={app.name}
            />
          </label>
        ) : null}
        {error ? <div className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">{error}</div> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {deleting ? "停用中" : "确认停用"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
