"use client";

import { type modelID, modelDetails } from "@/ai/providers";
import { Button } from "@/components/ui/button";
import { ModelPicker } from "@/components/model-picker";
import { CodeModeToggle } from "@/components/code-mode-toggle";
import { cn } from "@/lib/utils";
import { Activity, Loader2, Plus, ServerIcon, Sparkles } from "lucide-react";

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
  const modelInfo = modelDetails[selectedModel];
  const activeServers = serverStatusCounts.total;
  const onlineServers = serverStatusCounts.online;

  const statusLabel = (() => {
    if (status === "streaming") return "Streaming";
    if (status === "submitted") return "Thinking";
    if (status === "error") return "Error";
    return "Ready";
  })();

  const statusTone = (() => {
    if (status === "streaming") {
      return "bg-gradient-to-r from-success/10 to-success/5 text-success border border-success/20 shadow-sm dark:from-success/20 dark:to-success/10 dark:border-success/30";
    }
    if (status === "submitted") {
      return "bg-gradient-to-r from-warning/10 to-warning/5 text-warning border border-warning/20 shadow-sm dark:from-warning/20 dark:to-warning/10 dark:border-warning/30";
    }
    if (status === "error") {
      return "bg-gradient-to-r from-destructive/10 to-destructive/5 text-destructive border border-destructive/20 shadow-sm dark:from-destructive/20 dark:to-destructive/10 dark:border-destructive/30";
    }
    return "bg-gradient-to-r from-info/10 to-info/5 text-info border border-info/20 shadow-sm dark:from-info/20 dark:to-info/10 dark:border-info/30";
  })();

  return (
    <header className="sticky top-0 z-30 flex flex-col gap-2 border-b border-[#e3e3e3] bg-white/95 px-3 py-3 shadow-sm backdrop-blur-sm dark:border-[#1f1f1f] dark:bg-[#0f0f0f]/95 sm:flex-row sm:h-16 sm:items-center sm:px-4 sm:py-0">
      <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
        <div className="flex items-center gap-2 md:gap-3 overflow-x-auto no-scrollbar flex-1 min-w-0">
          <ModelPicker
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            variant="inline"
            className="min-w-[140px] sm:min-w-[200px] max-w-full flex-1 sm:max-w-none"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 text-[11px] font-medium text-[#6b7280] dark:text-[#9ca3af] flex-shrink-0 sm:justify-end">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-[11px]",
            statusTone
          )}
        >
          {status === "streaming" || status === "submitted" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Activity className="h-3 w-3" />
          )}
          <span className="hidden sm:inline">{statusLabel}</span>
        </span>
        <div className="hidden sm:block">
          <CodeModeToggle />
        </div>
        <button
          onClick={onOpenServerManager}
          type="button"
          className="inline-flex items-center gap-1.5 sm:gap-2 rounded-full border border-border bg-gradient-to-r from-card to-card/80 px-3 sm:px-4 py-1.5 text-[10px] sm:text-[11px] font-bold text-foreground shadow-sm backdrop-blur-sm transition-all duration-200 hover:shadow-md hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 min-h-[44px] sm:min-h-0 dark:border-border/60 dark:shadow-[0_0_12px_rgba(96,165,250,0.12)] dark:hover:shadow-[0_0_20px_rgba(96,165,250,0.2)]"
        >
          <ServerIcon className={cn(
            "h-3.5 w-3.5 flex-shrink-0 transition-colors",
            onlineServers > 0
              ? "text-success dark:drop-shadow-[0_0_4px_rgba(34,197,94,0.8)]"
              : "text-muted-foreground"
          )} />
          <span className="hidden xs:inline">{onlineServers}/{activeServers}</span>
          <span className="xs:hidden">{onlineServers}</span>
        </button>
      </div>
    </header>
  );
}
