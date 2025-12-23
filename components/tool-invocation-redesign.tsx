"use client";

import { useState } from "react";
import {
  ChevronDownIcon,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  Terminal,
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
          label: "Done",
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
    // Longer preview for desktop
    return inline.length > 120 ? `${inline.slice(0, 120)}...` : inline;
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
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-full px-4 py-3 text-left transition-colors",
          isExpanded ? "bg-muted/50" : "bg-muted/30 hover:bg-muted/50"
        )}
      >
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div
            className={cn(
              "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md",
              statusMeta.tone === "success" && "bg-success/10 text-success",
              statusMeta.tone === "error" && "bg-destructive/10 text-destructive",
              statusMeta.tone === "running" && "bg-warning/10 text-warning",
              statusMeta.tone === "waiting" && "bg-muted text-muted-foreground"
            )}
          >
            <StatusIcon
              className={cn(
                "h-4 w-4",
                statusMeta.animate && "animate-spin"
              )}
            />
          </div>

          {/* Tool name and status */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-mono font-medium text-foreground">
                {toolName}
              </span>
              <span
                className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded",
                  statusMeta.tone === "success" && "text-success bg-success/10",
                  statusMeta.tone === "error" && "text-destructive bg-destructive/10",
                  statusMeta.tone === "running" && "text-warning bg-warning/10",
                  statusMeta.tone === "waiting" && "text-muted-foreground bg-muted"
                )}
              >
                {statusMeta.label}
              </span>
            </div>

            {/* Preview when collapsed */}
            {!isExpanded && previewText && (
              <div className="mt-1 text-xs font-mono text-muted-foreground truncate">
                {previewText}
              </div>
            )}
          </div>

          {/* Expand chevron */}
          <ChevronDownIcon
            className={cn(
              "h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border bg-background">
          {/* Arguments */}
          {args && (
            <div className="p-4 border-b border-border">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Input
              </div>
              <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-sm font-mono leading-relaxed text-foreground">
                {formatContent(args)}
              </pre>
            </div>
          )}

          {/* Result or Error */}
          {(result || errorText) && (
            <div className="p-4">
              <div
                className={cn(
                  "mb-2 text-xs font-medium uppercase tracking-wide",
                  errorText ? "text-destructive" : "text-success"
                )}
              >
                {errorText ? "Error" : "Output"}
              </div>
              <pre
                className={cn(
                  "max-h-[400px] overflow-auto rounded-md border p-3 text-sm font-mono leading-relaxed",
                  errorText
                    ? "border-destructive/20 bg-destructive/5 text-destructive"
                    : "border-success/20 bg-success/5 text-foreground"
                )}
              >
                {formatContent(errorText || result)}
              </pre>
            </div>
          )}

          {/* Loading state */}
          {isStreamingState && !result && !errorText && (
            <div className="p-6 text-center">
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Executing...
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
