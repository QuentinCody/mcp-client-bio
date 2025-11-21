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

        <div className="flex items-center gap-2 text-sm font-medium flex-1">
          <span
            className={cn(
              hasError
                ? "text-red-700 dark:text-red-300"
                : "text-blue-700 dark:text-blue-300"
            )}
          >
            Code Execution
          </span>
          {isCompleted && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {hasError ? (
                <AlertTriangle className="h-3 w-3" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              <span>{hasError ? "Failed" : "Completed"}</span>
              {executionTime && (
                <>
                  <Clock className="h-3 w-3 ml-1" />
                  <span>{executionTime}ms</span>
                </>
              )}
            </div>
          )}
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
