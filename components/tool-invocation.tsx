"use client";

import { useState } from "react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  Loader2,
  CheckCircle2,
  TerminalSquare,
  Code,
  ArrowRight,
  Circle,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
        return { label: "Running", tone: "running" as const };
      case "input-available":
        return { label: "Waiting", tone: "waiting" as const };
      case "approval-requested":
        return { label: "Approval Needed", tone: "waiting" as const };
      case "approval-responded":
        return { label: "Approved", tone: "completed" as const };
      case "output-available":
        return { label: "Completed", tone: "completed" as const };
      case "output-error":
        return { label: "Error", tone: "error" as const };
      case "output-denied":
        return { label: "Denied", tone: "error" as const };
      case "call":
        return { label: "Running", tone: "running" as const };
      default:
        return { label: state || "Pending", tone: "waiting" as const };
    }
  })();

  const isStreamingState =
    statusMeta.tone === "running" ||
    (statusMeta.tone === "waiting" && isLatestMessage && status !== "ready");

  const getStatusIcon = () => {
    if (statusMeta.tone === "completed") {
      return <CheckCircle2 size={14} className="text-primary/90" />;
    }
    if (statusMeta.tone === "error") {
      return (
        <AlertTriangle className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
      );
    }
    if (isStreamingState) {
      return <Loader2 className="animate-spin h-3.5 w-3.5 text-primary/70" />;
    }
    return (
      <Circle className="h-3.5 w-3.5 fill-muted-foreground/10 text-muted-foreground/70" />
    );
  };

  const getStatusClass = () => {
    if (statusMeta.tone === "completed") {
      return "text-primary";
    }
    if (statusMeta.tone === "error") {
      return "text-red-600 dark:text-red-400";
    }
    if (isStreamingState) {
      return "text-primary";
    }
    return "text-muted-foreground";
  };

  const formatContent = (content: any): string => {
    try {
      if (content === undefined || content === null) {
        return "";
      }
      if (typeof content === "string") {
        try {
          const parsed = JSON.parse(content);
          return JSON.stringify(parsed, null, 2);
        } catch {
          // Check if it looks like JSON but failed to parse, try to format it anyway
          if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
            return content;
          }
          return content;
        }
      }
      // Always pretty print with 2-space indentation
      let formatted = JSON.stringify(content, (key, value) => {
        // Handle special formatting for better readability
        return value;
      }, 2);
      
      // Clean up escaped characters for better readability
      formatted = formatted
        .replace(/\\n/g, '\n')      // Convert \n to actual newlines
        .replace(/\\"/g, '"')      // Convert \" to regular quotes
        .replace(/\\\\/g, '\\');   // Convert \\ to single backslash
        
      return formatted;
    } catch {
      return String(content);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col mb-2 rounded-md border border-border/50 overflow-hidden",
        "bg-gradient-to-b from-background to-muted/30 backdrop-blur-sm",
        "transition-all duration-200 hover:border-border/80 group"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors",
          "hover:bg-muted/20"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-center rounded-full w-5 h-5 bg-primary/5 text-primary">
          <TerminalSquare className="h-3.5 w-3.5" />
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground flex-1">
          <span className="text-foreground font-semibold tracking-tight">
            {toolName}
          </span>
          <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
          <span className={cn("font-medium", getStatusClass())}>
            {statusMeta.label}
          </span>
        </div>
        <div className="flex items-center gap-2 opacity-70 group-hover:opacity-100 transition-opacity">
          {getStatusIcon()}
          <div className="bg-muted/30 rounded-full p-0.5 border border-border/30">
            {isExpanded ? (
              <ChevronUpIcon className="h-3 w-3 text-foreground/70" />
            ) : (
              <ChevronDownIcon className="h-3 w-3 text-foreground/70" />
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-2 px-3 pb-3">
          {callId && (
            <div className="text-[10px] text-muted-foreground/70 select-all">
              Call ID: {callId}
            </div>
          )}
          {!!args && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70 pt-1.5">
                <Code className="h-3 w-3" />
                <span className="font-medium">Arguments</span>
              </div>
              <pre
                className={cn(
                  "text-xs font-mono p-2.5 rounded-md overflow-x-auto",
                  "border border-border/40 bg-muted/10"
                )}
              >
                {formatContent(args)}
              </pre>
            </div>
          )}

          {isStreamingState && !result && !errorText && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                <Loader2 className="animate-spin h-3 w-3" />
                <span className="font-medium">Running...</span>
              </div>
            </div>
          )}

          {!!result && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                <ArrowRight className="h-3 w-3" />
                <span className="font-medium">Result</span>
              </div>
              <pre
                className={cn(
                  "text-xs font-mono p-2.5 rounded-md overflow-x-auto max-h-[300px] overflow-y-auto",
                  "border border-border/40 bg-muted/10"
                )}
              >
                {formatContent(result)}
              </pre>
            </div>
          )}

          {errorText && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400">
                <AlertTriangle className="h-3 w-3" />
                <span className="font-medium">Error</span>
              </div>
              <pre
                className={cn(
                  "text-xs font-mono p-2.5 rounded-md overflow-x-auto max-h-[300px] overflow-y-auto",
                  "border border-border/40 bg-muted/10 text-red-600 dark:text-red-400"
                )}
              >
                {formatContent(errorText)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
