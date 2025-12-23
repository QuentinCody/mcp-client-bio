"use client";

import { type modelID, modelDetails } from "@/ai/providers";
import { ModelPicker } from "@/components/model-picker";
import { CodeModeToggle } from "@/components/code-mode-toggle";
import { cn } from "@/lib/utils";
import { Loader2, ServerIcon } from "lucide-react";

interface ServerStatusCounts {
  total: number;
  online: number;
  connecting: number;
  error: number;
}

interface ChatHeaderProps {
  selectedModel: modelID;
  setSelectedModel: (model: modelID) => void;
  onNewChat: () => void;
  onOpenServerManager: () => void;
  serverStatusCounts: ServerStatusCounts;
  status: "error" | "submitted" | "streaming" | "ready";
}

export function ChatHeader({
  selectedModel,
  setSelectedModel,
  onNewChat,
  onOpenServerManager,
  serverStatusCounts,
  status,
}: ChatHeaderProps) {
  const activeServers = serverStatusCounts.total;
  const onlineServers = serverStatusCounts.online;
  const isActive = status === "streaming" || status === "submitted";

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-border bg-background/95 backdrop-blur-sm px-4 h-14">
      {/* Left: Model picker */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <ModelPicker
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          variant="inline"
          className="flex-shrink-0"
        />

        {isActive && (
          <span className="flex items-center gap-1.5 text-xs text-primary">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="hidden sm:inline">
              {status === "submitted" ? "Thinking" : "Streaming"}
            </span>
          </span>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <div className="hidden sm:block">
          <CodeModeToggle />
        </div>

        <button
          onClick={onOpenServerManager}
          type="button"
          className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ServerIcon className={cn(
            "h-3.5 w-3.5",
            onlineServers > 0 ? "text-success" : "text-muted-foreground"
          )} />
          <span>{onlineServers}/{activeServers}</span>
        </button>
      </div>
    </header>
  );
}
