"use client";

import { type modelID } from "@/ai/providers";
import { ModelPicker } from "@/components/model-picker";
import { CodeModeToggle } from "@/components/code-mode-toggle";
import { TokenIndicator } from "@/components/token-indicator";
import { cn } from "@/lib/utils";
import { Loader2, Plus, ServerIcon } from "lucide-react";

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
  chatId?: string;
}

export function ChatHeader({
  selectedModel,
  setSelectedModel,
  onNewChat,
  onOpenServerManager,
  serverStatusCounts,
  status,
  chatId,
}: ChatHeaderProps) {
  const activeServers = serverStatusCounts.total;
  const onlineServers = serverStatusCounts.online;
  const connectingServers = serverStatusCounts.connecting;
  const errorServers = serverStatusCounts.error;
  const statusMeta = (() => {
    switch (status) {
      case "streaming":
        return {
          label: "Streaming",
          className: "border-primary/20 bg-primary/10 text-primary",
          indicatorClassName: "bg-primary",
          showSpinner: true,
        };
      case "submitted":
        return {
          label: "Thinking",
          className: "border-warning/30 bg-warning/10 text-warning",
          indicatorClassName: "bg-warning",
          showSpinner: true,
        };
      case "error":
        return {
          label: "Error",
          className: "border-destructive/30 bg-destructive/10 text-destructive",
          indicatorClassName: "bg-destructive",
          showSpinner: false,
        };
      default:
        return {
          label: "Ready",
          className: "border-border bg-secondary text-muted-foreground",
          indicatorClassName: "bg-success",
          showSpinner: false,
        };
    }
  })();

  const serverLabel =
    activeServers > 0 ? `${onlineServers}/${activeServers}` : "No servers";
  const serverTitleParts = [
    activeServers > 0
      ? `Online ${onlineServers}/${activeServers}`
      : "No servers configured",
  ];

  if (activeServers > 0 && connectingServers > 0) {
    serverTitleParts.push(`Connecting ${connectingServers}`);
  }

  if (activeServers > 0 && errorServers > 0) {
    serverTitleParts.push(`Error ${errorServers}`);
  }

  const serverTitle = serverTitleParts.join(" | ");

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border/60 bg-gradient-to-b from-background/95 to-background/85 px-4 backdrop-blur-xl">
      {/* Left: Model picker */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <ModelPicker
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          variant="inline"
          className="flex-shrink-0"
        />

        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium",
            statusMeta.className
          )}
        >
          {statusMeta.showSpinner ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <span
              className={cn("h-1.5 w-1.5 rounded-full", statusMeta.indicatorClassName)}
            />
          )}
          <span>{statusMeta.label}</span>
        </span>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Token Usage Indicator */}
        <TokenIndicator variant="compact" chatId={chatId} />

        <div className="hidden sm:block">
          <CodeModeToggle />
        </div>

        <button
          onClick={onNewChat}
          type="button"
          className="hidden md:inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" />
          New chat
        </button>

        <button
          onClick={onOpenServerManager}
          type="button"
          title={serverTitle}
          className="flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ServerIcon
            className={cn(
              "h-3.5 w-3.5",
              onlineServers > 0 ? "text-success" : "text-muted-foreground"
            )}
          />
          <span className="text-xs font-semibold">{serverLabel}</span>
          {(connectingServers > 0 || errorServers > 0) && activeServers > 0 && (
            <span className="hidden md:flex items-center gap-1">
              {connectingServers > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">
                  <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
                  {connectingServers}
                </span>
              )}
              {errorServers > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                  {errorServers}
                </span>
              )}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
