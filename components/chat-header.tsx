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
      return "bg-[#dcfce7] text-[#047857] dark:bg-[#064e3b] dark:text-[#34d399]";
    }
    if (status === "submitted") {
      return "bg-[#fef9c3] text-[#854d0e] dark:bg-[#713f12] dark:text-[#fcd34d]";
    }
    if (status === "error") {
      return "bg-[#fee2e2] text-[#b91c1c] dark:bg-[#7f1d1d] dark:text-[#fecaca]";
    }
    return "bg-[#e0f2fe] text-[#0369a1] dark:bg-[#1e3a8a]/40 dark:text-[#93c5fd]";
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
          className="inline-flex items-center gap-1.5 sm:gap-2 rounded-full border border-[#d4d4d4] bg-white px-2 sm:px-3 py-1 text-[10px] sm:text-[11px] font-semibold text-[#1f2937] shadow-sm transition hover:bg-[#f4f4f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93c5fd] active:scale-95 dark:border-[#2b2b2b] dark:bg-[#181818] dark:text-[#e5e5e5] dark:hover:bg-[#202020] min-h-[44px] sm:min-h-0"
        >
          <ServerIcon className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="hidden xs:inline">{onlineServers}/{activeServers}</span>
          <span className="xs:hidden">{onlineServers}</span>
        </button>
      </div>
    </header>
  );
}
