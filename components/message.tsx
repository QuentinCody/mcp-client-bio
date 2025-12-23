"use client";

import type { UIMessage as TMessage } from "ai";
import { memo, useCallback, useEffect, useState } from "react";
import equal from "fast-deep-equal";
import { Markdown } from "./markdown";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, ChevronRightIcon, LightbulbIcon, Copy, Check } from "lucide-react";
import { SpinnerIcon } from "./icons";
import { ToolInvocation } from "./tool-invocation-redesign";

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
    memoizedSetIsExpanded(isReasoning);
  }, [isReasoning, memoizedSetIsExpanded]);

  const detailItems =
    Array.isArray(part.details) && part.details.length > 0
      ? part.details
      : part.text || part.reasoningText
        ? [{ type: "text", text: part.text ?? part.reasoningText ?? "" }]
        : [];

  return (
    <div className="mb-4">
      {isReasoning ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="h-4 w-4 animate-spin">
              <SpinnerIcon />
            </div>
            <span className="text-sm font-medium">Thinking...</span>
          </div>

          {detailItems.length > 0 && (
            <div className="border-l-2 border-amber-300 dark:border-amber-700 pl-4 space-y-2">
              {detailItems.map((detail, detailIndex) =>
                detail.type === "text" ? (
                  <div
                    key={detailIndex}
                    className="text-sm text-muted-foreground leading-relaxed"
                  >
                    <Markdown>{detail.text}</Markdown>
                    {detailIndex === detailItems.length - 1 && (
                      <span className="ml-0.5 inline-block h-4 w-0.5 animate-cursor bg-primary align-text-bottom" />
                    )}
                  </div>
                ) : null
              )}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          <LightbulbIcon className="h-4 w-4 text-amber-500" />
          <span className="font-medium">Reasoning</span>
          {isExpanded ? (
            <ChevronDownIcon className="h-3.5 w-3.5" />
          ) : (
            <ChevronRightIcon className="h-3.5 w-3.5" />
          )}
        </button>
      )}

      {!isReasoning && isExpanded && detailItems.length > 0 && (
        <div className="mt-2 border-l-2 border-amber-300 dark:border-amber-700 pl-4 space-y-2 animate-fade-in">
          {detailItems.map((detail, detailIndex) =>
            detail.type === "text" ? (
              <div
                key={detailIndex}
                className="text-sm text-muted-foreground leading-relaxed"
              >
                <Markdown>{detail.text}</Markdown>
              </div>
            ) : null
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
  const [copied, setCopied] = useState(false);

  const getMessageText = () => {
    if (!message.parts) return "";
    return message.parts
      .filter((part) => part.type === "text")
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("\n\n");
  };

  const handleCopy = async () => {
    const text = getMessageText();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shouldShowCopyButton =
    message.role === "assistant" &&
    (!isLatestMessage || status !== "streaming");

  const isUser = message.role === "user";

  // User messages: compact bubble on right
  if (isUser) {
    return (
      <div className="flex justify-end" data-role="user">
        <div className="max-w-[80%] sm:max-w-[70%] lg:max-w-[60%]">
          <div className="mb-1 text-xs font-medium text-muted-foreground text-right">
            You
          </div>
          <div className="rounded-2xl bg-primary text-primary-foreground px-4 py-3">
            <div className="text-[15px] leading-relaxed">
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
    );
  }

  // Assistant messages: full-width, no bubble
  return (
    <div className="group/message" data-role="assistant">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Assistant
          </span>
          {isLatestMessage && status === "streaming" && (
            <span className="flex items-center gap-1.5 text-xs text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-subtle-pulse" />
              typing
            </span>
          )}
        </div>

        {shouldShowCopyButton && (
          <button
            onClick={handleCopy}
            className="opacity-0 group-hover/message:opacity-100 transition-opacity flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Copied
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

      {/* Message content - full width */}
      <div className="text-[15px] leading-relaxed text-foreground space-y-4">
        {message.parts?.map((part, i) => {
          const key = `message-${message.id}-part-${i}`;

          if (part.type === "text") {
            const isStreamingText =
              isLatestMessage &&
              status === "streaming" &&
              i === (message.parts?.length ?? 0) - 1;

            return (
              <div key={key} className="prose prose-neutral dark:prose-invert max-w-none">
                <Markdown>{part.text}</Markdown>
                {isStreamingText && (
                  <span className="inline-block h-4 w-0.5 ml-0.5 animate-cursor bg-primary align-text-bottom" />
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
