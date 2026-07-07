import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import type { ConversationSummary } from "@/lib/workspace-data";

interface ConversationRemarkDialogProps {
  conversation: ConversationSummary | null;
  draft: string;
  saving: boolean;
  error: string | null;
  onDraftChange: (draft: string) => void;
  onSave: () => void;
  onOpenChange: (open: boolean) => void;
}

export function ConversationRemarkDialog({
  conversation,
  draft,
  saving,
  error,
  onDraftChange,
  onSave,
  onOpenChange,
}: ConversationRemarkDialogProps) {
  return (
    <Dialog open={Boolean(conversation)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑会话备注</DialogTitle>
          <DialogDescription>{conversation?.raw.peerWxid ?? "请选择会话"}</DialogDescription>
        </DialogHeader>
        <label className="block text-sm text-muted-foreground">
          平台会话备注
          <input
            aria-label="平台会话备注"
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSave();
              }
            }}
            className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none"
            placeholder={conversation?.originalName ?? conversation?.raw.peerWxid}
          />
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
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
            disabled={!conversation || saving}
            onClick={onSave}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "保存中" : "保存备注"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
