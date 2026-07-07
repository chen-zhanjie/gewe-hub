import { useState } from "react";
import { cn } from "@/lib/utils";

type AvatarSize = 24 | 32 | 40;

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
}

const sizeClassByPx: Record<AvatarSize, string> = {
  24: "size-6 text-xs",
  32: "size-8 text-xs",
  40: "size-10 text-sm",
};

export function Avatar({ name, src, size = 32, className }: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const label = name.trim() || "?";
  const canShowImage = Boolean(src) && !imageFailed;

  return (
    <span
      aria-label={label}
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-medium text-muted-foreground",
        sizeClassByPx[size],
        className,
      )}
    >
      {canShowImage ? (
        <img
          src={src ?? undefined}
          alt={label}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        label.slice(0, 1)
      )}
    </span>
  );
}
