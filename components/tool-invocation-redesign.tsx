"use client";

import { useState } from "react";
import {
  ChevronRightIcon,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CodeExecutionDisplay } from "./code-execution-display-redesign";

interface ToolInvocationProps {
  toolName: string;
  state: string;
  args: any;
  result: any;
  errorText?: string;
  callId?: string;
  isLatestMessage: boolean;
  status: string;
}

export function ToolInvocation({
  toolName,
  state,
  args,
  result,
  errorText,
  callId,
  isLatestMessage,
  status,
}: ToolInvocationProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const statusMeta = (() => {
    switch (state) {
      case "input-streaming":
      case "call":
        return {
          label: "Running",
          tone: "running" as const,
          icon: Loader2,
          animate: true,
        };
      case "input-available":
      case "approval-requested":
        return {
          label: "Waiting",
          tone: "waiting" as const,
          icon: Clock,
          animate: false,
        };
      case "approval-responded":
      case "output-available":
        return {
          label: "Complete",
          tone: "success" as const,
          icon: CheckCircle2,
          animate: false,
        };
      case "output-error":
      case "output-denied":
        return {
          label: "Failed",
          tone: "error" as const,
          icon: AlertCircle,
          animate: false,
        };
      default:
        return {
          label: "Pending",
          tone: "waiting" as const,
          icon: Clock,
          animate: false,
        };
    }
  })();

  const isStreamingState =
    statusMeta.tone === "running" ||
    (statusMeta.tone === "waiting" && isLatestMessage && status !== "ready");

  const formatContent = (content: any): string => {
    try {
      if (content === undefined || content === null) return "";
      if (typeof content === "string") {
        try {
          const parsed = JSON.parse(content);
          return JSON.stringify(parsed, null, 2);
        } catch {
          return content;
        }
      }
      return JSON.stringify(content, null, 2)
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    } catch {
      return String(content);
    }
  };

  const previewSnippet = (content: any): string | null => {
    const formatted = formatContent(content);
    if (!formatted) return null;
    const inline = formatted.replace(/\s+/g, " ").trim();
    if (!inline) return null;
    return inline.length > 100 ? `${inline.slice(0, 100)}…` : inline;
  };

  const previewContent = errorText ?? result ?? args;
  const previewText = previewSnippet(previewContent);
  const StatusIcon = statusMeta.icon;

  // Special handling for code execution
  if (toolName === "codemode_sandbox") {
    return (
      <CodeExecutionDisplay
        code={args?.code}
        result={result?.result || result}
        error={errorText || result?.error}
        logs={result?.logs || result?.console || []}
        executionTime={result?.executionTime}
        state={state}
      />
    );
  }

  return (
    <div
      className={cn(
        "group relative mb-3 overflow-hidden rounded-lg border transition-all duration-300",
        statusMeta.tone === "success" &&
          "border-emerald-200/60 bg-gradient-to-br from-emerald-50/40 to-emerald-50/20 dark:border-emerald-900/40 dark:from-emerald-950/30 dark:to-emerald-950/10",
        statusMeta.tone === "error" &&
          "border-rose-200/60 bg-gradient-to-br from-rose-50/40 to-rose-50/20 dark:border-rose-900/40 dark:from-rose-950/30 dark:to-rose-950/10",
        statusMeta.tone === "running" &&
          "border-amber-200/60 bg-gradient-to-br from-amber-50/40 to-amber-50/20 dark:border-amber-900/40 dark:from-amber-950/30 dark:to-amber-950/10",
        statusMeta.tone === "waiting" &&
          "border-slate-200/60 bg-gradient-to-br from-slate-50/40 to-slate-50/20 dark:border-slate-800/40 dark:from-slate-950/30 dark:to-slate-950/10",
        "hover:shadow-lg"
      )}
    >
      {/* Animated accent bar */}
      <div
        className={cn(
          "absolute left-0 top-0 h-full w-1 transition-all duration-500",
          statusMeta.tone === "success" && "bg-emerald-500",
          statusMeta.tone === "error" && "bg-rose-500",
          statusMeta.tone === "running" && "bg-amber-500",
          statusMeta.tone === "waiting" && "bg-slate-400",
          isStreamingState && "animate-pulse"
        )}
      />

      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 text-left transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className={cn(
              "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-all duration-300",
              statusMeta.tone === "success" &&
                "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400",
              statusMeta.tone === "error" &&
                "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-400",
              statusMeta.tone === "running" &&
                "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400",
              statusMeta.tone === "waiting" &&
                "bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400",
              "group-hover:scale-105"
            )}
          >
            <StatusIcon
              className={cn(
                "h-5 w-5",
                statusMeta.animate && "animate-spin"
              )}
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Header Row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-mono font-semibold text-foreground tracking-tight">
                {toolName}
              </span>
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  statusMeta.tone === "success" &&
                    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
                  statusMeta.tone === "error" &&
                    "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300",
                  statusMeta.tone === "running" &&
                    "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
                  statusMeta.tone === "waiting" &&
                    "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
                )}
              >
                {isStreamingState && (
                  <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                )}
                {statusMeta.label}
              </div>
              {callId && (
                <span className="text-[10px] font-mono text-muted-foreground/60">
                  #{callId.slice(0, 8)}
                </span>
              )}
            </div>

            {/* Preview */}
            {!isExpanded && previewText && (
              <div className="text-xs font-mono text-muted-foreground/80 truncate">
                {previewText}
              </div>
            )}
          </div>

          {/* Expand Icon */}
          <ChevronRightIcon
            className={cn(
              "h-5 w-5 flex-shrink-0 text-muted-foreground/40 transition-transform duration-300",
              isExpanded && "rotate-90"
            )}
          />
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-border/30 bg-background/40 dark:bg-background/20">
          {/* Arguments */}
          {args && (
            <div className="border-b border-border/20 px-4 py-3">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Zap className="h-3.5 w-3.5" />
                Input
              </div>
              <pre className="overflow-x-auto rounded-md border border-border/40 bg-muted/30 p-3 text-xs font-mono leading-relaxed">
                {formatContent(args)}
              </pre>
            </div>
          )}

          {/* Result or Error */}
          {(result || errorText) && (
            <div className="px-4 py-3">
              <div
                className={cn(
                  "mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider",
                  errorText
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-emerald-600 dark:text-emerald-400"
                )}
              >
                {errorText ? (
                  <>
                    <AlertCircle className="h-3.5 w-3.5" />
                    Error
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Output
                  </>
                )}
              </div>
              <pre
                className={cn(
                  "max-h-[400px] overflow-auto rounded-md border p-3 text-xs font-mono leading-relaxed",
                  errorText
                    ? "border-rose-200/60 bg-rose-50/50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200"
                    : "border-emerald-200/60 bg-emerald-50/50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200"
                )}
              >
                {formatContent(errorText || result)}
              </pre>
            </div>
          )}

          {/* Loading State */}
          {isStreamingState && !result && !errorText && (
            <div className="px-4 py-6 text-center">
              <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Executing...
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
