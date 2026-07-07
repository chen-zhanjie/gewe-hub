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

export function ResetTokenDialog({
  app,
  resettingId,
  confirmText,
  onConfirmTextChange,
  onOpenChange,
  onConfirm,
}: {
  app: BackendHubApp | null;
  resettingId: string | null;
  confirmText: string;
  onConfirmTextChange: (text: string) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={app !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>重置 token</AlertDialogTitle>
          <AlertDialogDescription>请输入应用名称确认重置 token</AlertDialogDescription>
        </AlertDialogHeader>
        {app ? (
          <div className="space-y-3">
            <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm font-medium">{app.name}</p>
            <label className="block text-xs text-muted-foreground">
              输入应用名称确认
              <input
                aria-label="输入应用名称确认"
                value={confirmText}
                disabled={resettingId === app.id}
                onChange={(event) => onConfirmTextChange(event.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                autoComplete="off"
              />
            </label>
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={Boolean(resettingId)}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={!app || confirmText !== app.name || resettingId === app.id}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {resettingId === app?.id ? "重置中" : "确认重置 token"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
