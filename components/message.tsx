"use client";

import type { UIMessage as TMessage } from "ai";
import { memo, useCallback, useEffect, useState } from "react";
import equal from "fast-deep-equal";
import { Markdown } from "./markdown";
import { cn } from "@/lib/utils";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  LightbulbIcon,
  Sparkles,
} from "lucide-react";
import { SpinnerIcon } from "./icons";
import { ToolInvocation } from "./tool-invocation";
import { CopyButton } from "./copy-button";
import { Avatar, AvatarFallback } from "./ui/avatar";

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

  const memoizedSetIsExpanded = useCallback((value: boolean) => {
    setIsExpanded(value);
  }, []);

  useEffect(() => {
    // Auto-expand when reasoning starts, so users see tokens immediately
    memoizedSetIsExpanded(isReasoning);
  }, [isReasoning, memoizedSetIsExpanded]);

  const detailItems =
    Array.isArray(part.details) && part.details.length > 0
      ? part.details
      : part.text || part.reasoningText
        ? [{ type: "text", text: part.text ?? part.reasoningText ?? "" }]
        : [];

  return (
    <div className="mb-2 flex flex-col group">
      {isReasoning ? (
        <div className="space-y-2">
          <div
            className={cn(
              "flex items-center gap-2 sm:gap-2.5 rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-2.5 sm:px-3 py-1.5 text-[#1d4ed8]",
              "dark:border-[#1e3a8a] dark:bg-[#1e3a8a]/30 dark:text-[#bfdbfe]",
              "w-fit"
            )}
          >
            <div className="animate-spin h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0">
              <SpinnerIcon />
            </div>
            <div className="text-[11px] sm:text-xs font-medium tracking-tight">Thinking...</div>
          </div>
          {/* Show reasoning content immediately while thinking */}
          {detailItems.length > 0 && (
            <div
              className={cn(
                "ml-0.5 flex flex-col gap-1.5 sm:gap-2 border-l-2 border-[#fde68a] pl-2 sm:pl-3",
                "text-[13px] sm:text-sm text-[#6b7280] dark:text-[#d1d5db]"
              )}
            >
              <div className="pl-0.5 sm:pl-1 text-[11px] sm:text-xs font-medium text-[#9ca3af] dark:text-[#9ca3af]">
                The assistant&apos;s thought process:
              </div>
              {detailItems.map((detail, detailIndex) =>
                detail.type === "text" ? (
                  <div
                    key={detailIndex}
                    className="rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-2 py-1.5 text-[13px] sm:text-sm text-[#374151] dark:border-[#303030] dark:bg-[#1c1c1c] dark:text-[#d1d5db]"
                  >
                    <div className="relative">
                      <Markdown>{detail.text}</Markdown>
                      {detailIndex === detailItems.length - 1 && (
                        <span className="ml-1 inline-block h-4 w-2 animate-pulse rounded bg-amber-500 align-text-bottom" />
                      )}
                    </div>
                  </div>
                ) : (
                  "<redacted>"
                )
              )}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            "mb-0.5 flex w-full items-center justify-between rounded-xl border border-[#d4d4d4] bg-[#f5f5f5] px-2.5 sm:px-3 py-2 text-left min-h-[44px] sm:min-h-0",
            "transition-all duration-150 hover:bg-[#ededee] active:scale-[0.98] dark:border-[#2b2b2b] dark:bg-[#1c1c1c] dark:hover:bg-[#232323]",
            isExpanded ? "shadow-inner" : ""
          )}
        >
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div
              className={cn(
                "flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full flex-shrink-0",
                "bg-[#fde68a] text-[#92400e] dark:bg-[#92400e]/30 dark:text-[#fcd34d]"
              )}
            >
              <LightbulbIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5 text-[13px] sm:text-sm font-medium text-[#1f2937] dark:text-[#f5f5f5]">
              <span>Reasoning</span>
              <span className="hidden xs:inline text-xs text-muted-foreground font-normal">
                (click to {isExpanded ? "hide" : "view"})
              </span>
            </div>
          </div>
          <div
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full border border-transparent bg-white text-[#6b7280] transition-colors hover:text-[#1f2937] dark:bg-[#1f1f1f] dark:text-[#9ca3af] dark:hover:text-[#f5f5f5] flex-shrink-0"
            )}
          >
            {isExpanded ? (
              <ChevronDownIcon className="h-3 w-3" />
            ) : (
              <ChevronUpIcon className="h-3 w-3" />
            )}
          </div>
        </button>
      )}

      {/* Show expandable block only after reasoning (streaming) phase ends to avoid duplication */}
      {!isReasoning && isExpanded && detailItems.length > 0 && (
        <div
          className={cn(
            "mt-2 ml-0.5 flex flex-col gap-1.5 sm:gap-2 border-l-2 border-[#fde68a] pl-2 sm:pl-3",
            "text-[13px] sm:text-sm text-[#6b7280] dark:text-[#d1d5db]"
          )}
        >
          <div className="pl-0.5 sm:pl-1 text-[11px] sm:text-xs font-medium text-[#9ca3af] dark:text-[#9ca3af]">
            The assistant&apos;s thought process:
          </div>
          {detailItems.map((detail, detailIndex) =>
            detail.type === "text" ? (
              <div
                key={detailIndex}
                className="rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-2 py-1.5 text-[13px] sm:text-sm text-[#374151] dark:border-[#303030] dark:bg-[#1c1c1c] dark:text-[#d1d5db]"
              >
                <div className="relative">
                  <Markdown>{detail.text}</Markdown>
                  {isReasoning && detailIndex === detailItems.length - 1 && (
                    <span className="ml-1 inline-block h-4 w-2 animate-pulse rounded bg-amber-500 align-text-bottom" />
                  )}
                </div>
              </div>
            ) : (
              "<redacted>"
            )
          )}
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
  // Create a string with all text parts for copy functionality
  const getMessageText = () => {
    if (!message.parts) return "";
    return message.parts
      .filter((part) => part.type === "text")
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("\n\n");
  };

  // Check if this is an expanded message
  const expansionData = null;

  // Only show copy button if the message is from the assistant and not currently streaming
  const shouldShowCopyButton =
    message.role === "assistant" &&
    (!isLatestMessage || status !== "streaming");

  const isUser = message.role === "user";
  const speakerLabel = isUser ? "You" : "Bio MCP";
  const streamingLabel = isLatestMessage
    ? status === "streaming"
      ? "Streaming…"
      : status === "submitted"
        ? "Pending…"
        : null
    : null;

  const bubbleClassName = cn(
    "relative max-w-[95%] sm:max-w-[90%] rounded-xl border px-3 py-3 sm:px-5 sm:py-4 shadow-sm transition-colors",
    isUser
      ? "border-[#d4d4d4] bg-[#f4f4f5] text-[#1f2933] dark:border-[#2b2b2b] dark:bg-[#1c1c1c] dark:text-[#f3f4f6]"
      : "border-[#e3e3e3] bg-white text-[#1b1b1f] dark:border-[#252525] dark:bg-[#141414] dark:text-[#f7f7f8]"
  );

  const headerClassName = cn(
    "flex flex-wrap items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide text-[#707070] dark:text-[#9f9f9f]",
    isUser ? "justify-end" : "justify-start"
  );

  const bubbleAlignment = isUser ? "ml-auto text-right" : "mr-auto";
  const copyButtonPosition = isUser ? "left-2 sm:left-3" : "right-2 sm:right-3";

  return (
    <div
      className={cn(
        "group/message relative mx-auto w-full px-2 py-1.5 sm:px-1 sm:py-2",
        message.role === "assistant" ? "mb-4 sm:mb-8" : "mb-3 sm:mb-7"
      )}
      data-role={message.role}
    >
      <div
        className={cn(
          "flex w-full items-start gap-2 sm:gap-4 md:gap-5",
          isUser ? "flex-row-reverse text-right" : "text-left"
        )}
      >
        <div className="relative flex flex-col items-center pt-0.5 sm:pt-1">
          <Avatar
            className={cn(
              "h-7 w-7 sm:h-9 sm:w-9 border border-transparent text-sm font-semibold uppercase tracking-wide shadow-lg ring-1 ring-black/5 transition-transform duration-200 group-hover/message:scale-[1.02] dark:ring-white/10",
              isUser
                ? "bg-[#4b5563] text-white dark:bg-[#374151]"
                : "bg-[#1f7aec] text-white dark:bg-[#2563eb]"
            )}
          >
            <AvatarFallback className="text-[9px] sm:text-[10px] font-semibold uppercase">
              {isUser ? "You" : "AI"}
            </AvatarFallback>
          </Avatar>
        </div>

        <div className="flex w-full flex-1 flex-col gap-1.5 sm:gap-2 min-w-0">
          <div className={headerClassName}>
            <span
              className={cn(
                "inline-flex items-center gap-1 px-0.5 py-0.5 text-[#1f2933] dark:text-[#fafafa]",
                isUser ? "font-semibold" : "font-semibold"
              )}
            >
              {speakerLabel}
            </span>
            {!isUser && (
              <span className="inline-flex items-center gap-0.5 sm:gap-1 rounded-full border border-transparent bg-[#e0f2fe] px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-[#0369a1] dark:bg-[#1e40af]/30 dark:text-[#93c5fd]">
                <Sparkles className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                <span className="hidden xs:inline">Assistant</span>
              </span>
            )}
            {streamingLabel && (
              <span className="inline-flex items-center gap-0.5 sm:gap-1 rounded-full border border-transparent bg-[#d1fae5] px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] text-[#047857] dark:bg-[#064e3b] dark:text-[#34d399]">
                <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-[#047857] dark:bg-[#34d399]" />
                <span className="hidden xs:inline">{streamingLabel}</span>
              </span>
            )}
          </div>

          <div className={cn(bubbleClassName, bubbleAlignment)}>
            {shouldShowCopyButton && (
              <>
                <CopyButton
                  text={getMessageText()}
                  className={cn(
                    "absolute top-2 sm:top-3 h-7 sm:h-8 w-auto px-1.5 sm:px-2 py-1 text-[10px] sm:text-xs text-[#525252] dark:text-[#d4d4d4] transition-opacity duration-200",
                    copyButtonPosition,
                    "hidden sm:inline-flex"
                  )}
                />
              </>
            )}
            <div
              className={cn(
                "flex flex-col gap-3 sm:gap-4 text-[0.875rem] sm:text-[0.95rem] leading-6 sm:leading-7 text-[#1f2937] dark:text-[#e7e7e7]",
                isUser ? "items-end text-right" : "text-left"
              )}
            >
              {shouldShowCopyButton && !isUser && (
                <div className="sm:hidden mt-2 -mb-1">
                  <CopyButton
                    text={getMessageText()}
                    className="w-full justify-center rounded-lg border border-border/40 bg-background/60 px-3 py-2.5 text-[11px] font-medium text-foreground/80 hover:bg-background active:scale-95 transition-all dark:border-[#2b2b2b] dark:bg-[#1a1a1a]/60"
                  />
                </div>
              )}
              {message.parts?.map((part, i) => {
                const key = `message-${message.id}-part-${i}`;

                if (part.type === "text") {
                  const isStreamingText =
                    isLatestMessage &&
                    status === "streaming" &&
                    i === (message.parts?.length ?? 0) - 1;

                  return (
                    <div key={key} className="relative">
                      <Markdown>{part.text}</Markdown>
                      {isStreamingText && (
                        <span className="absolute -bottom-1 left-0 inline-flex h-4 w-1.5 animate-pulse rounded-full bg-[#34d399] dark:bg-[#10b981]" />
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
    </div>
  );
};

export const Message = memo(PurePreviewMessage, (prevProps, nextProps) => {
  // Fast path: check primitives first
  if (prevProps.status !== nextProps.status) return false;
  if (prevProps.isLoading !== nextProps.isLoading) return false;
  if (prevProps.isLatestMessage !== nextProps.isLatestMessage) return false;
  if (prevProps.message.id !== nextProps.message.id) return false;

  // Optimize parts comparison with shallow checks first
  const prevParts = prevProps.message.parts;
  const nextParts = nextProps.message.parts;

  // Same reference check (fastest path)
  if (prevParts === nextParts) return true;

  // Null/undefined checks
  if (!prevParts || !nextParts) return false;

  // Length check (very fast)
  if (prevParts.length !== nextParts.length) return false;

  // Deep compare ONLY the parts array (not entire message)
  if (!equal(prevParts, nextParts)) return false;

  return true;
});
