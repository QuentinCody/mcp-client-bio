"use client";

import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ResourceChip({
  uri,
  name,
  onRemove,
}: {
  uri: string;
  name?: string;
  onRemove?: () => void;
}) {
  return (
    <Badge variant="secondary" className="flex items-center gap-2 max-w-[18rem]">
      <span className="truncate" title={name ?? uri}>
        {name ?? uri}
      </span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-sm p-0.5 hover:bg-muted"
          aria-label="Remove resource"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </Badge>
  );
}
