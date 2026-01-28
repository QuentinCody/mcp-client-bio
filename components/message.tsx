"use client";

import type { UIMessage as TMessage } from "ai";
import { memo, useEffect, useMemo, useState } from "react";
import equal from "fast-deep-equal";
import { Markdown } from "./markdown";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, ChevronRightIcon, LightbulbIcon, Copy, Check, Sparkles } from "lucide-react";
import { SpinnerIcon } from "./icons";
import { ToolInvocation } from "./tool-invocation-redesign";

// Elegant animation keyframes added via CSS-in-JS
const messageAnimationStyle = `
@keyframes messageSlideIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes subtlePulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
`;

interface ReasoningPart {
  type: "reasoning";
  text?: string;
  reasoningText?: string;
  details?: Array<{ type: "text"; text: string }>;
  state?: "streaming" | "done";
}

interface ReasoningMessagePartProps {
  part: ReasoningPart;
  isReasoning: boolean;
}

export function ReasoningMessagePart({
  part,
  isReasoning,
}: ReasoningMessagePartProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setIsExpanded(isReasoning);
  }, [isReasoning]);

  const detailItems =
    Array.isArray(part.details) && part.details.length > 0
      ? part.details
      : part.text || part.reasoningText
        ? [{ type: "text", text: part.text ?? part.reasoningText ?? "" }]
        : [];

  const hasDetails = detailItems.length > 0;
  const showDetails = isReasoning || isExpanded;

  if (!isReasoning && !hasDetails) {
    return null;
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => {
          if (!isReasoning) {
            setIsExpanded((prev) => !prev);
          }
        }}
        aria-expanded={!isReasoning ? isExpanded : undefined}
        disabled={isReasoning}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
          "disabled:cursor-default",
          isReasoning || isExpanded
            ? "border-amber-200/60 bg-amber-50/40 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
            : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        )}
      >
        <span className="flex items-center gap-2">
          <LightbulbIcon className="h-4 w-4 text-amber-500" />
          <span>Reasoning</span>
        </span>
        <span className="flex items-center gap-1.5">
          {isReasoning ? (
            <>
              <span className="text-[10px] uppercase tracking-wide text-amber-700/70 dark:text-amber-200/70">
                live
              </span>
              <div className="h-3.5 w-3.5 animate-spin text-amber-600 dark:text-amber-200">
                <SpinnerIcon />
              </div>
            </>
          ) : isExpanded ? (
            <ChevronDownIcon className="h-3.5 w-3.5" />
          ) : (
            <ChevronRightIcon className="h-3.5 w-3.5" />
          )}
        </span>
      </button>

      {showDetails && hasDetails && (
        <div
          className={cn(
            "mt-2 rounded-lg border px-3 py-2 text-sm leading-relaxed",
            isReasoning
              ? "border-amber-200/50 bg-amber-50/30 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100"
              : "border-border/50 bg-muted/30 text-foreground"
          )}
        >
          <div className="space-y-2">
            {detailItems.map((detail, detailIndex) =>
              detail.type === "text" ? (
                <div
                  key={detailIndex}
                  className={cn(
                    "text-sm leading-relaxed",
                    isReasoning ? "text-amber-900/80 dark:text-amber-100/80" : "text-muted-foreground"
                  )}
                >
                  <Markdown>{detail.text}</Markdown>
                  {isReasoning && detailIndex === detailItems.length - 1 && (
                    <span className="ml-0.5 inline-block h-4 w-0.5 animate-cursor bg-primary align-text-bottom" />
                  )}
                </div>
              ) : null
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const PurePreviewMessage = ({
  message,
  isLatestMessage,
  status,
}: {
  message: TMessage;
  isLoading: boolean;
  status: "error" | "submitted" | "streaming" | "ready";
  isLatestMessage: boolean;
}) => {
  const [copied, setCopied] = useState(false);

  const messageText = useMemo(() => {
    if (!message.parts) return "";
    return message.parts
      .filter((part) => part.type === "text")
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("\n\n");
  }, [message.parts]);

  const handleCopy = async () => {
    if (!messageText) return;
    await navigator.clipboard.writeText(messageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shouldShowCopyButton =
    message.role === "assistant" &&
    (!isLatestMessage || status !== "streaming") &&
    messageText.length > 0;

  const isUser = message.role === "user";

  // User messages: elegant bubble on right with refined styling
  if (isUser) {
    return (
      <>
        <style>{messageAnimationStyle}</style>
        <div
          className="flex justify-end"
          data-role="user"
          style={{ animation: 'messageSlideIn 0.25s ease-out' }}
        >
          <div className="max-w-[85%] sm:max-w-[75%] lg:max-w-[65%]">
            <div className="mb-1.5 flex items-center justify-end gap-1.5 text-[11px] font-medium text-muted-foreground/70">
              <span>You</span>
            </div>
            <div className={cn(
              "relative rounded-2xl rounded-br-md px-4 py-3",
              "bg-gradient-to-br from-primary to-primary/90",
              "text-primary-foreground",
              "shadow-md shadow-primary/10",
              "ring-1 ring-primary/30 ring-inset"
            )}>
              <div className="text-[15px] leading-relaxed [&_p]:mb-0 [&_p:last-child]:mb-0">
                {message.parts?.map((part, i) => {
                  if (part.type === "text") {
                    return (
                      <div key={`${message.id}-${i}`}>
                        <Markdown>{part.text}</Markdown>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  const isActiveAssistant = isLatestMessage && status === "streaming";

  // Assistant messages: elegant card with refined styling
  return (
    <>
      <style>{messageAnimationStyle}</style>
      <div
        className="group/message"
        data-role="assistant"
        style={{ animation: 'messageSlideIn 0.3s ease-out' }}
      >
        <div
          className={cn(
            "relative rounded-2xl border transition-all duration-300",
            isActiveAssistant
              ? "border-primary/40 bg-gradient-to-b from-primary/[0.03] to-transparent shadow-lg shadow-primary/5"
              : "border-border/60 bg-card/50 shadow-sm hover:shadow-md hover:border-border"
          )}
        >
          {/* Subtle glow effect when streaming */}
          {isActiveAssistant && (
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
          )}

          {/* Header row - refined */}
          <div className={cn(
            "relative flex items-center justify-between rounded-t-2xl border-b px-4 py-2.5 sm:px-5",
            isActiveAssistant
              ? "border-primary/20 bg-primary/[0.02]"
              : "border-border/40 bg-muted/30"
          )}>
            <div className="flex items-center gap-2.5">
              <div className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full",
                isActiveAssistant
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              )}>
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <span className={cn(
                "text-xs font-medium",
                isActiveAssistant ? "text-foreground" : "text-muted-foreground"
              )}>
                Assistant
              </span>
              {isLatestMessage && status === "streaming" && (
                <span className="flex items-center gap-1.5 text-[11px] text-primary/80">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-primary"
                    style={{ animation: 'subtlePulse 1.5s ease-in-out infinite' }}
                  />
                  generating
                </span>
              )}
            </div>

            {shouldShowCopyButton && (
              <button
                type="button"
                onClick={handleCopy}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
                  "text-muted-foreground hover:text-foreground",
                  "hover:bg-muted/80 active:scale-95",
                  "opacity-100 sm:opacity-0 sm:group-hover/message:opacity-100 sm:group-focus-within/message:opacity-100"
                )}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-green-600 dark:text-green-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </button>
            )}
          </div>

          {/* Message content - full width with refined spacing */}
          <div className="relative px-4 pb-5 pt-4 sm:px-5">
            <div className="text-[15px] leading-[1.7] text-foreground space-y-4">
              {message.parts?.map((part, i) => {
                const key = `message-${message.id}-part-${i}`;

                if (part.type === "text") {
                  const isStreamingText =
                    isLatestMessage &&
                    status === "streaming" &&
                    i === (message.parts?.length ?? 0) - 1;

                  return (
                    <div
                      key={key}
                      className={cn(
                        "prose prose-neutral dark:prose-invert max-w-none",
                        "prose-headings:font-semibold prose-headings:tracking-tight",
                        "prose-p:leading-[1.7] prose-li:leading-[1.7]",
                        "prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[13px]",
                        "prose-pre:rounded-lg prose-pre:border prose-pre:border-border/50"
                      )}
                    >
                      <Markdown>{part.text}</Markdown>
                      {isStreamingText && (
                        <span
                          className="inline-block h-[18px] w-[2px] ml-0.5 bg-primary align-text-bottom rounded-full"
                          style={{ animation: 'subtlePulse 0.8s ease-in-out infinite' }}
                        />
                      )}
                    </div>
                  );
                }

                if (part.type === "reasoning") {
                  return (
                    <ReasoningMessagePart
                      key={key}
                      part={part}
                      isReasoning={
                        (message.parts &&
                          status === "streaming" &&
                          i === message.parts.length - 1) ??
                        false
                      }
                    />
                  );
                }

                if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
                  const toolPart = part as any;
                  const toolName =
                    part.type === "dynamic-tool"
                      ? toolPart.toolName || "dynamic-tool"
                      : part.type.replace(/^tool-/, "") || "tool";
                  const result =
                    toolPart.output !== undefined
                      ? toolPart.output
                      : toolPart.errorText
                        ? { error: toolPart.errorText }
                        : undefined;

                  return (
                    <ToolInvocation
                      key={key}
                      toolName={toolName}
                      state={toolPart.state}
                      args={toolPart.input}
                      result={result}
                      errorText={toolPart.errorText}
                      callId={toolPart.toolCallId}
                      isLatestMessage={isLatestMessage}
                      status={status}
                    />
                  );
                }

                if (part.type.startsWith("data-") || part.type === "step-start") {
                  return null;
                }

                return null;
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export const Message = memo(PurePreviewMessage, (prevProps, nextProps) => {
  if (prevProps.status !== nextProps.status) return false;
  if (prevProps.isLoading !== nextProps.isLoading) return false;
  if (prevProps.isLatestMessage !== nextProps.isLatestMessage) return false;
  if (prevProps.message.id !== nextProps.message.id) return false;

  const prevParts = prevProps.message.parts;
  const nextParts = nextProps.message.parts;

  if (prevParts === nextParts) return true;
  if (!prevParts || !nextParts) return false;
  if (prevParts.length !== nextParts.length) return false;
  if (!equal(prevParts, nextParts)) return false;

  return true;
});
