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
    <div className="flex flex-col mb-2 group">
      {isReasoning ? (
        <div className="space-y-2">
          <div
            className={cn(
              "flex items-center gap-2.5 rounded-full py-1.5 px-3",
              "bg-indigo-50/50 dark:bg-indigo-900/10 text-indigo-700 dark:text-indigo-300",
              "border border-indigo-200/50 dark:border-indigo-700/20 w-fit"
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
                "text-sm text-muted-foreground flex flex-col gap-2",
                "pl-3.5 ml-0.5",
                "border-l border-amber-200/50 dark:border-amber-700/30"
              )}
            >
              <div className="text-xs text-muted-foreground/70 pl-1 font-medium">
                The assistant&apos;s thought process:
              </div>
              {part.details.map((detail, detailIndex) =>
                detail.type === "text" ? (
                  <div
                    key={detailIndex}
                    className="px-2 py-1.5 bg-muted/10 rounded-md border border-border/30"
                  >
                    <div className="relative">
                      <Markdown>{detail.text}</Markdown>
                      {detailIndex === part.details.length - 1 && (
                        <span className="inline-block w-2 h-4 bg-amber-500 animate-pulse ml-1 align-text-bottom" />
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
            "flex items-center justify-between w-full",
            "rounded-md py-2 px-3 mb-0.5",
            "bg-muted/50 border border-border/60 hover:border-border/80",
            "transition-all duration-150 cursor-pointer",
            isExpanded ? "bg-muted border-primary/20" : ""
          )}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "flex items-center justify-center w-6 h-6 rounded-full",
                "bg-amber-50 dark:bg-amber-900/20",
                "text-amber-600 dark:text-amber-400 ring-1 ring-amber-200 dark:ring-amber-700/30"
              )}
            >
              <LightbulbIcon className="h-3.5 w-3.5" />
            </div>
            <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
              Reasoning
              <span className="text-xs text-muted-foreground font-normal">
                (click to {isExpanded ? "hide" : "view"})
              </span>
            </div>
          </div>
          <div
            className={cn(
              "flex items-center justify-center",
              "rounded-full p-0.5 w-5 h-5",
              "text-muted-foreground hover:text-foreground",
              "bg-background/80 border border-border/50",
              "transition-colors"
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
            "text-sm text-muted-foreground flex flex-col gap-2",
            "pl-3.5 ml-0.5 mt-1",
            "border-l border-amber-200/50 dark:border-amber-700/30"
          )}
        >
          <div className="text-xs text-muted-foreground/70 pl-1 font-medium">
            The assistant&apos;s thought process:
          </div>
          {part.details.map((detail, detailIndex) =>
            detail.type === "text" ? (
              <div
                key={detailIndex}
                className="px-2 py-1.5 bg-muted/10 rounded-md border border-border/30"
              >
                <div className="relative">
                  <Markdown>{detail.text}</Markdown>
                  {isReasoning && detailIndex === part.details.length - 1 && (
                    <span className="inline-block w-2 h-4 bg-amber-500 animate-pulse ml-1 align-text-bottom" />
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
    "relative rounded-[22px] border px-5 py-4 shadow-sm backdrop-blur-sm transition-colors",
    isUser
      ? "border-primary/35 bg-gradient-to-br from-primary/25 via-primary/15 to-primary/5 text-primary-foreground"
      : "border-border/60 bg-gradient-to-br from-background/98 via-background/95 to-background/90 text-foreground"
  );

  const headerClassName = cn(
    "flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80",
    isUser ? "justify-end" : "justify-start"
  );

  const copyAlignmentClass = cn(
    "mt-3 flex",
    isUser ? "justify-end" : "justify-start"
  );

  return (
    <div
      className={cn(
        "group/message relative mx-auto w-full px-2 sm:px-4",
        message.role === "assistant" ? "mb-9" : "mb-7"
      )}
      data-role={message.role}
    >
      <div
        className={cn(
          "flex w-full items-start gap-3 sm:gap-4",
          isUser ? "flex-row-reverse text-right" : "text-left"
        )}
      >
        <div className="relative flex flex-col items-center pt-1 sm:pt-0">
          <Avatar
            className={cn(
              "h-9 w-9 border border-border/60 bg-background shadow-sm transition-transform duration-200 group-hover/message:scale-[1.02]",
              isUser
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border/60 bg-secondary/40 text-secondary-foreground"
            )}
          >
            <AvatarFallback className="text-[10px] font-semibold uppercase tracking-wide">
              {isUser ? "You" : "AI"}
            </AvatarFallback>
          </Avatar>
          <span className="mt-2 hidden h-full w-px flex-1 bg-border/40 sm:block" />
        </div>

        <div className="flex-1 space-y-3">
          <div className={headerClassName}>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
                isUser
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/60 bg-background/80 text-muted-foreground"
              )}
            >
              {speakerLabel}
            </span>
            {!isUser && (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                <Sparkles className="h-3 w-3" />
                Adaptive
              </span>
            )}
            {streamingLabel && (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-primary">
                <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                {streamingLabel}
              </span>
            )}
          </div>

          <div className={bubbleClassName}>
            <div className="flex flex-col gap-4 text-sm leading-relaxed text-foreground/90">
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
                          <span className="absolute -bottom-1 left-0 inline-flex h-4 w-1.5 animate-pulse rounded-full bg-primary" />
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
            {shouldShowCopyButton && (
              <div className={copyAlignmentClass}>
                <CopyButton text={getMessageText()} />
              </div>
            )}
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
