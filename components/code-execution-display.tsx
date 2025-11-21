"use client";

import { useState } from "react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  Code2,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";

interface CodeExecutionDisplayProps {
  code?: string;
  result?: any;
  error?: string;
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
  const hasError = !!error || state === "output-error";
  const isCompleted = state === "output-available" || hasError;
  const logCount = logs?.length ?? 0;
  const statusTag = hasError ? "Error" : isCompleted ? "Completed" : "Running";
  const statusBadgeClass = hasError
    ? "bg-red-100 text-red-600 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700"
    : isCompleted
      ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700"
      : "bg-primary/10 text-primary border-primary/40";
  const statusHint = (() => {
    switch (state) {
      case "input-streaming":
        return "Streaming data into the sandbox";
      case "input-available":
        return "Helpers are ready for this call";
      case "approval-requested":
        return "Waiting on approval";
      case "approval-responded":
        return "Approval granted";
      case "output-available":
        return "Sandbox returned a result";
      case "output-error":
        return "Sandbox reported an error";
      case "output-denied":
        return "Sandbox denied the call";
      case "call":
        return "Tool call initiated";
      default:
        return state || "In progress";
    }
  })();
  const dynamicWorkerDoc =
    "https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/";
  const codeModeBlog = "https://blog.cloudflare.com/code-mode/";

  const formatCode = (code: string) => {
    // Remove function wrapper if present
    let formatted = code.trim();

    if (formatted.startsWith('async (helpers, console) =>')) {
      formatted = formatted.replace(/^async \(helpers, console\) =>\s*\{/, '');
      formatted = formatted.replace(/\}$/, '');
    }

    return formatted.trim();
  };

  const formatResult = (result: any): string => {
    if (result === undefined || result === null) {
      return "null";
    }
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
        "flex flex-col mb-2 rounded-lg border overflow-hidden",
        hasError
          ? "border-red-200 dark:border-red-900"
          : "border-blue-200 dark:border-blue-900",
        "bg-gradient-to-b from-background to-muted/20"
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
          hasError
            ? "bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/40"
            : "bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/40"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div
          className={cn(
            "flex items-center justify-center rounded-full w-6 h-6",
            hasError
              ? "bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400"
              : "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400"
          )}
        >
          <Code2 className="h-3.5 w-3.5" />
        </div>

        <div className="flex flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {hasError ? (
              <AlertTriangle className="h-3 w-3 text-red-600 dark:text-red-300" />
            ) : isCompleted ? (
              <CheckCircle2 className="h-3 w-3 text-blue-600 dark:text-blue-300" />
            ) : (
              <Loader2 className="h-3 w-3 animate-spin text-primary/70" />
            )}
            <span
              className={cn(
                "text-sm tracking-tight",
                hasError ? "text-red-700 dark:text-red-300" : "text-blue-700 dark:text-blue-300"
              )}
            >
              Code Execution
            </span>
            <div
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                statusBadgeClass
              )}
            >
              {statusTag}
            </div>
            {executionTime && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{executionTime}ms</span>
              </div>
            )}
            <div className="text-[11px] text-muted-foreground">
              {logCount} log{logCount !== 1 ? "s" : ""}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground/80">
            <span>{statusHint}</span>
            {!hasError && logCount === 0 && (
              <span className="rounded-full bg-muted/10 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                Waiting for logs
              </span>
            )}
          </div>
        </div>

        <div
          className={cn(
            "flex items-center justify-center rounded-full w-5 h-5",
            hasError
              ? "text-red-600 dark:text-red-400"
              : "text-blue-600 dark:text-blue-400"
          )}
        >
          {isExpanded ? (
            <ChevronDownIcon className="h-4 w-4" />
          ) : (
            <ChevronUpIcon className="h-4 w-4" />
          )}
        </div>
      </div>

      <div className="px-4 pt-1 pb-2 text-[11px] text-muted-foreground/80 flex flex-wrap items-center gap-2">
        <span>
          Runs inside Cloudflare Code Mode via the Dynamic Worker Loader.
        </span>
        <a
          href={dynamicWorkerDoc}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-primary underline-offset-2 hover:underline"
        >
          Read the worker loader docs ↗
        </a>
        <a
          href={codeModeBlog}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-primary underline-offset-2 hover:underline"
        >
          Learn about Code Mode ↗
        </a>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="flex flex-col divide-y divide-border/30">
          {/* Code Section */}
          {code && (
            <div className="px-4 py-3">
              <div className="flex items-center gap-2 mb-2 text-xs font-medium text-muted-foreground">
                <Code2 className="h-3.5 w-3.5" />
                <span>Generated Code</span>
              </div>
              <div className="relative">
                <Markdown>
                  {`\`\`\`javascript\n${formatCode(code)}\n\`\`\``}
                </Markdown>
              </div>
            </div>
          )}

          {/* Console Logs */}
          {logs && logs.length > 0 && (
            <div className="px-4 py-3 bg-muted/20">
              <div className="flex items-center gap-2 mb-2 text-xs font-medium text-muted-foreground">
                <Terminal className="h-3.5 w-3.5" />
                <span>Console Output</span>
              </div>
              <div className="space-y-1">
                {logs.map((log, index) => (
                  <div
                    key={index}
                    className="text-xs font-mono text-foreground/80 bg-background rounded px-2 py-1 border border-border/30"
                  >
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}
          {(logs?.length ?? 0) === 0 && (
            <div className="px-4 py-3 text-[11px] text-muted-foreground/70">
              Console output will appear here once the sandbox starts executing the snippet.
            </div>
          )}

          {/* Result Section */}
          {result && !hasError && (
            <div className="px-4 py-3">
              <div className="flex items-center gap-2 mb-2 text-xs font-medium text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Result</span>
              </div>
              <div className="relative">
                <Markdown>
                  {`\`\`\`json\n${formatResult(result)}\n\`\`\``}
                </Markdown>
              </div>
            </div>
          )}
          {!result && !hasError && (
            <div className="px-4 py-3 text-[11px] text-muted-foreground/70">
              Awaiting the Code Mode sandbox to return structured output. Logs may update while you wait.
            </div>
          )}

          {/* Error Section */}
          {hasError && error && (
            <div className="px-4 py-3 bg-red-50/50 dark:bg-red-950/20">
              <div className="flex items-center gap-2 mb-2 text-xs font-medium text-red-600 dark:text-red-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Error</span>
              </div>
              <div className="text-sm font-mono text-red-700 dark:text-red-300 bg-red-100/50 dark:bg-red-900/20 rounded px-3 py-2 border border-red-200 dark:border-red-800">
                {error}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
