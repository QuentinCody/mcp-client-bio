"use client";

import { useState } from "react";
import {
  ChevronRightIcon,
  Code2,
  Terminal,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  Play,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";

interface CodeExecutionDisplayProps {
  code?: string;
  result?: any;
  error?: string | any;
  logs?: string[];
  executionTime?: number;
  state: string;
}

export function CodeExecutionDisplay({
  code,
  result,
  error,
  logs,
  executionTime,
  state,
}: CodeExecutionDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<"code" | "logs" | "result">("code");

  const hasError = !!error || state === "output-error";
  const isCompleted = state === "output-available" || hasError;
  const isRunning = !isCompleted;
  const logCount = logs?.length ?? 0;

  const formatCode = (code: string) => {
    let formatted = code.trim();
    if (formatted.startsWith("async (helpers, console) =>")) {
      formatted = formatted.replace(/^async \(helpers, console\) =>\s*\{/, "");
      formatted = formatted.replace(/\}$/, "");
    }
    return formatted.trim();
  };

  const formatResult = (result: any): string => {
    if (result === undefined || result === null) return "null";
    if (typeof result === "string") {
      try {
        const parsed = JSON.parse(result);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return result;
      }
    }
    return JSON.stringify(result, null, 2);
  };

  return (
    <div
      className={cn(
        "group relative mb-3 overflow-hidden rounded-lg border transition-all duration-300",
        hasError
          ? "border-rose-200/60 bg-gradient-to-br from-rose-50/50 to-rose-50/20 dark:border-rose-900/40 dark:from-rose-950/40 dark:to-rose-950/10"
          : isCompleted
            ? "border-violet-200/60 bg-gradient-to-br from-violet-50/50 to-violet-50/20 dark:border-violet-900/40 dark:from-violet-950/40 dark:to-violet-950/10"
            : "border-amber-200/60 bg-gradient-to-br from-amber-50/50 to-amber-50/20 dark:border-amber-900/40 dark:from-amber-950/40 dark:to-amber-950/10",
        "hover:shadow-xl"
      )}
    >
      {/* Animated gradient accent */}
      <div
        className={cn(
          "absolute left-0 top-0 h-full w-1",
          hasError && "bg-gradient-to-b from-rose-500 to-rose-600",
          !hasError &&
            isCompleted &&
            "bg-gradient-to-b from-violet-500 via-violet-600 to-fuchsia-600",
          isRunning &&
            "bg-gradient-to-b from-amber-400 via-amber-500 to-orange-500 animate-pulse"
        )}
      />

      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 text-left transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className={cn(
              "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-all duration-300",
              hasError &&
                "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-400 shadow-lg shadow-rose-500/20",
              !hasError &&
                isCompleted &&
                "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-400 shadow-lg shadow-violet-500/20",
              isRunning &&
                "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400 shadow-lg shadow-amber-500/20",
              "group-hover:scale-110 group-hover:rotate-3"
            )}
          >
            {hasError ? (
              <AlertCircle className="h-5 w-5" />
            ) : isCompleted ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Title Row */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-foreground/60" />
                <span className="text-sm font-bold tracking-tight text-foreground">
                  Code Execution
                </span>
              </div>
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-sm",
                  hasError &&
                    "border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-800 dark:bg-rose-900/60 dark:text-rose-300",
                  !hasError &&
                    isCompleted &&
                    "border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-800 dark:bg-violet-900/60 dark:text-violet-300",
                  isRunning &&
                    "border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-900/60 dark:text-amber-300"
                )}
              >
                {isRunning && (
                  <Play className="h-2.5 w-2.5 fill-current animate-pulse" />
                )}
                {hasError ? "Failed" : isCompleted ? "Complete" : "Running"}
              </div>
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-md bg-gradient-to-r px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  "from-fuchsia-100 to-violet-100 text-violet-700",
                  "dark:from-fuchsia-950/60 dark:to-violet-950/60 dark:text-violet-300"
                )}
              >
                <Sparkles className="h-2.5 w-2.5" />
                Sandbox
              </div>
            </div>

            {/* Metrics Row */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {executionTime !== undefined && (
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="font-mono font-medium">{executionTime}ms</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5" />
                <span className="font-mono font-medium">
                  {logCount} log{logCount !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
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
        <div className="border-t border-border/30">
          {/* Tab Navigation */}
          <div className="flex border-b border-border/20 bg-background/30 dark:bg-background/10">
            <button
              onClick={() => setActiveTab("code")}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all",
                activeTab === "code"
                  ? "border-violet-500 bg-violet-50/50 text-violet-700 dark:border-violet-400 dark:bg-violet-950/30 dark:text-violet-300"
                  : "border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground"
              )}
            >
              <Code2 className="h-3.5 w-3.5" />
              Code
            </button>
            <button
              onClick={() => setActiveTab("logs")}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all",
                activeTab === "logs"
                  ? "border-violet-500 bg-violet-50/50 text-violet-700 dark:border-violet-400 dark:bg-violet-950/30 dark:text-violet-300"
                  : "border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground"
              )}
            >
              <Terminal className="h-3.5 w-3.5" />
              Logs
              {logCount > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-violet-100 px-1.5 text-[10px] font-bold text-violet-700 dark:bg-violet-900/60 dark:text-violet-300">
                  {logCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("result")}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all",
                activeTab === "result"
                  ? "border-violet-500 bg-violet-50/50 text-violet-700 dark:border-violet-400 dark:bg-violet-950/30 dark:text-violet-300"
                  : "border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground"
              )}
            >
              {hasError ? (
                <AlertCircle className="h-3.5 w-3.5" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {hasError ? "Error" : "Result"}
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-4">
            {/* Code Tab */}
            {activeTab === "code" && code && (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Generated JavaScript
                </div>
                <div className="overflow-hidden rounded-lg border border-violet-200/60 bg-slate-50 dark:border-violet-900/40 dark:bg-slate-950/50">
                  <Markdown>
                    {`\`\`\`javascript\n${formatCode(code)}\n\`\`\``}
                  </Markdown>
                </div>
              </div>
            )}

            {/* Logs Tab */}
            {activeTab === "logs" && (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Console Output
                </div>
                {logs && logs.length > 0 ? (
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    {logs.map((log, index) => (
                      <div
                        key={index}
                        className="rounded-md border border-slate-200/60 bg-slate-50 px-3 py-2 text-xs font-mono leading-relaxed text-slate-800 dark:border-slate-800/60 dark:bg-slate-950/50 dark:text-slate-200"
                      >
                        <span className="mr-2 text-slate-400 dark:text-slate-600">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        {typeof log === "string" ? log : JSON.stringify(log)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center text-xs text-muted-foreground dark:border-slate-800 dark:bg-slate-950/30">
                    No console output yet
                  </div>
                )}
              </div>
            )}

            {/* Result Tab */}
            {activeTab === "result" && (
              <div className="space-y-2">
                <div
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-wider",
                    hasError
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  )}
                >
                  {hasError ? "Execution Error" : "Returned Value"}
                </div>
                {result || error ? (
                  <div className="overflow-hidden rounded-lg border">
                    <pre
                      className={cn(
                        "max-h-[400px] overflow-auto p-4 text-xs font-mono leading-relaxed",
                        hasError
                          ? "border-rose-200/60 bg-rose-50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/50 dark:text-rose-200"
                          : "border-emerald-200/60 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/50 dark:text-emerald-200"
                      )}
                    >
                      {hasError
                        ? typeof error === "string"
                          ? error
                          : JSON.stringify(error, null, 2)
                        : formatResult(result)}
                    </pre>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center text-xs text-muted-foreground dark:border-slate-800 dark:bg-slate-950/30">
                    {isRunning
                      ? "Waiting for execution to complete..."
                      : "No result returned"}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
