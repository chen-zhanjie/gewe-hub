import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

export function CopyButton({ value, label = "复制", className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const Icon = copied ? Check : Copy;

  async function handleCopy() {
    await navigator.clipboard?.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={handleCopy}
      className={cn(
        "inline-flex h-8 items-center justify-center rounded-md border bg-background px-2 text-xs text-muted-foreground hover:text-foreground",
        className
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}
