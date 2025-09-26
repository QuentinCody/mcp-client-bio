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
  reasoningText: string;
  details: Array<{ type: "text"; text: string }>;
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

  return (
    <div className="mb-2 flex flex-col group">
      {isReasoning ? (
        <div className="space-y-2">
          <div
            className={cn(
              "flex items-center gap-2.5 rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1.5 text-[#1d4ed8]",
              "dark:border-[#1e3a8a] dark:bg-[#1e3a8a]/30 dark:text-[#bfdbfe]",
              "w-fit"
            )}
          >
            <div className="animate-spin h-3.5 w-3.5">
              <SpinnerIcon />
            </div>
            <div className="text-xs font-medium tracking-tight">Thinking...</div>
          </div>
          {/* Show reasoning content immediately while thinking */}
          {part.details && part.details.length > 0 && (
            <div
              className={cn(
                "ml-0.5 flex flex-col gap-2 border-l-2 border-[#fde68a] pl-3",
                "text-sm text-[#6b7280] dark:text-[#d1d5db]"
              )}
            >
              <div className="pl-1 text-xs font-medium text-[#9ca3af] dark:text-[#9ca3af]">
                The assistant&apos;s thought process:
              </div>
              {part.details.map((detail, detailIndex) =>
                detail.type === "text" ? (
                  <div
                    key={detailIndex}
                    className="rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-2 py-1.5 text-sm text-[#374151] dark:border-[#303030] dark:bg-[#1c1c1c] dark:text-[#d1d5db]"
                  >
                    <div className="relative">
                      <Markdown>{detail.text}</Markdown>
                      {detailIndex === part.details.length - 1 && (
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
            "mb-0.5 flex w-full items-center justify-between rounded-xl border border-[#d4d4d4] bg-[#f5f5f5] px-3 py-2 text-left",
            "transition-all duration-150 hover:bg-[#ededee] dark:border-[#2b2b2b] dark:bg-[#1c1c1c] dark:hover:bg-[#232323]",
            isExpanded ? "shadow-inner" : ""
          )}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full",
                "bg-[#fde68a] text-[#92400e] dark:bg-[#92400e]/30 dark:text-[#fcd34d]"
              )}
            >
              <LightbulbIcon className="h-3.5 w-3.5" />
            </div>
            <div className="flex items-center gap-1.5 text-sm font-medium text-[#1f2937] dark:text-[#f5f5f5]">
              Reasoning
              <span className="text-xs text-muted-foreground font-normal">
                (click to {isExpanded ? "hide" : "view"})
              </span>
            </div>
          </div>
          <div
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full border border-transparent bg-white text-[#6b7280] transition-colors hover:text-[#1f2937] dark:bg-[#1f1f1f] dark:text-[#9ca3af] dark:hover:text-[#f5f5f5]"
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
      {!isReasoning && isExpanded && (
        <div
          className={cn(
            "mt-2 ml-0.5 flex flex-col gap-2 border-l-2 border-[#fde68a] pl-3",
            "text-sm text-[#6b7280] dark:text-[#d1d5db]"
          )}
        >
          <div className="pl-1 text-xs font-medium text-[#9ca3af] dark:text-[#9ca3af]">
            The assistant&apos;s thought process:
          </div>
          {part.details.map((detail, detailIndex) =>
            detail.type === "text" ? (
              <div
                key={detailIndex}
                className="rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-2 py-1.5 text-sm text-[#374151] dark:border-[#303030] dark:bg-[#1c1c1c] dark:text-[#d1d5db]"
              >
                <div className="relative">
                  <Markdown>{detail.text}</Markdown>
                  {isReasoning && detailIndex === part.details.length - 1 && (
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
    "relative max-w-[90%] rounded-xl border px-5 py-4 shadow-sm transition-colors",
    isUser
      ? "border-[#d4d4d4] bg-[#f4f4f5] text-[#1f2933] dark:border-[#2b2b2b] dark:bg-[#1c1c1c] dark:text-[#f3f4f6]"
      : "border-[#e3e3e3] bg-white text-[#1b1b1f] dark:border-[#252525] dark:bg-[#141414] dark:text-[#f7f7f8]"
  );

  const headerClassName = cn(
    "flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#707070] dark:text-[#9f9f9f]",
    isUser ? "justify-end" : "justify-start"
  );

  const bubbleAlignment = isUser ? "ml-auto text-right" : "mr-auto";
  const copyButtonPosition = isUser ? "left-3" : "right-3";

  return (
    <div
      className={cn(
        "group/message relative mx-auto w-full px-1 py-2 sm:px-2",
        message.role === "assistant" ? "mb-8" : "mb-7"
      )}
      data-role={message.role}
    >
      <div
        className={cn(
          "flex w-full items-start gap-4 sm:gap-5",
          isUser ? "flex-row-reverse text-right" : "text-left"
        )}
      >
        <div className="relative flex flex-col items-center pt-1">
          <Avatar
            className={cn(
              "h-9 w-9 border border-transparent text-sm font-semibold uppercase tracking-wide shadow-lg ring-1 ring-black/5 transition-transform duration-200 group-hover/message:scale-[1.02] dark:ring-white/10",
              isUser
                ? "bg-[#4b5563] text-white dark:bg-[#374151]"
                : "bg-[#1f7aec] text-white dark:bg-[#2563eb]"
            )}
          >
            <AvatarFallback className="text-[10px] font-semibold uppercase">
              {isUser ? "You" : "AI"}
            </AvatarFallback>
          </Avatar>
        </div>

        <div className="flex w-full flex-1 flex-col gap-2">
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
              <span className="inline-flex items-center gap-1 rounded-full border border-transparent bg-[#e0f2fe] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#0369a1] dark:bg-[#1e40af]/30 dark:text-[#93c5fd]">
                <Sparkles className="h-3 w-3" />
                Assistant
              </span>
            )}
            {streamingLabel && (
              <span className="inline-flex items-center gap-1 rounded-full border border-transparent bg-[#d1fae5] px-2 py-0.5 text-[#047857] dark:bg-[#064e3b] dark:text-[#34d399]">
                <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-[#047857] dark:bg-[#34d399]" />
                {streamingLabel}
              </span>
            )}
          </div>

          <div className={cn(bubbleClassName, bubbleAlignment)}>
            {shouldShowCopyButton && (
              <CopyButton
                text={getMessageText()}
                className={cn(
                  "absolute top-3 h-8 w-auto px-2 py-1 text-xs text-[#525252] dark:text-[#d4d4d4]",
                  copyButtonPosition
                )}
              />
            )}
            <div
              className={cn(
                "flex flex-col gap-4 text-[0.95rem] leading-7 text-[#1f2937] dark:text-[#e7e7e7]",
                isUser ? "items-end text-right" : "text-left"
              )}
            >
              {message.parts?.map((part, i) => {
                switch (part.type) {
                  case "text": {
                    try {
                      const maybe = JSON.parse(part.text || "null");
                      if (
                        maybe &&
                        typeof maybe === "object" &&
                        maybe.toolInvocation &&
                        typeof maybe.toolInvocation === "object"
                      ) {
                        const ti = maybe.toolInvocation;
                        return (
                          <ToolInvocation
                            key={`message-${message.id}-part-${i}`}
                            toolName={ti.toolName || "unknown"}
                            state={ti.state || "call"}
                            args={ti.args}
                            result={"result" in ti ? ti.result : undefined}
                            isLatestMessage={isLatestMessage}
                            status={status}
                          />
                        );
                      }
                    } catch (err) {
                      // ignore parse errors
                    }

                    const isStreamingText =
                      isLatestMessage &&
                      status === "streaming" &&
                      i === (message.parts?.length ?? 0) - 1;

                    return (
                      <div
                        key={`message-${message.id}-part-${i}`}
                        className="relative"
                      >
                        <Markdown>{part.text}</Markdown>
                        {isStreamingText && (
                          <span className="absolute -bottom-1 left-0 inline-flex h-4 w-1.5 animate-pulse rounded-full bg-[#34d399] dark:bg-[#10b981]" />
                        )}
                      </div>
                    );
                  }
                  case "tool-invocation": {
                    const { toolName, state, args } = part.toolInvocation;
                    const result =
                      "result" in part.toolInvocation
                        ? part.toolInvocation.result
                        : null;

                    return (
                      <ToolInvocation
                        key={`message-${message.id}-part-${i}`}
                        toolName={toolName}
                        state={state}
                        args={args}
                        result={result}
                        isLatestMessage={isLatestMessage}
                        status={status}
                      />
                    );
                  }
                  case "reasoning":
                    return (
                      <ReasoningMessagePart
                        key={`message-${message.id}-${i}`}
                        // @ts-expect-error part
                        part={part}
                        isReasoning={
                          (message.parts &&
                            status === "streaming" &&
                            i === message.parts.length - 1) ??
                          false
                        }
                      />
                    );
                  default:
                    return null;
                }
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const Message = memo(PurePreviewMessage, (prevProps, nextProps) => {
  if (prevProps.status !== nextProps.status) return false;
  if (prevProps.isLoading !== nextProps.isLoading) return false;
  if (prevProps.isLatestMessage !== nextProps.isLatestMessage) return false;
  if (prevProps.message.annotations !== nextProps.message.annotations)
    return false;
  if (prevProps.message.id !== nextProps.message.id) return false;
  if (!equal(prevProps.message.parts, nextProps.message.parts)) return false;
  return true;
});
