"use client";

import type { UIMessage as TMessage } from "ai";
import { Message } from "./message";
import { AnimatePresence, motion } from "motion/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { RefObject } from "react";
import { memo, useRef, useCallback, useEffect } from "react";
import { Brain, Sparkles } from "lucide-react";

interface MessagesProps {
  messages: TMessage[];
  isLoading: boolean;
  status: "error" | "submitted" | "streaming" | "ready";
  endRef: RefObject<HTMLDivElement | null>;
  disableAnimations?: boolean;
  parentRef?: RefObject<HTMLDivElement | null>;
}

// Thinking indicator shown immediately when query is submitted
const ThinkingIndicator = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="flex items-start gap-4"
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center border border-primary/20">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        {/* Pulsing ring */}
        <motion.div
          className="absolute inset-0 rounded-xl border-2 border-primary/30"
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Thinking bubble */}
      <div className="flex-1 max-w-[80%]">
        <div className="inline-flex items-center gap-3 rounded-2xl bg-muted/50 border border-border/50 px-4 py-3">
          <Brain className="h-4 w-4 text-amber-500" />
          <span className="text-sm text-muted-foreground">Thinking</span>
          {/* Animated dots */}
          <div className="flex items-center gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-amber-500"
                animate={{ y: [0, -4, 0] }}
                transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  delay: i * 0.15,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// Threshold for enabling virtualization (only virtualize long conversations)
const VIRTUALIZATION_THRESHOLD = 20;

// Estimated row height for virtualization
const ESTIMATED_ROW_HEIGHT = 200;

function MessagesComponent({
  messages,
  isLoading,
  status,
  endRef,
  disableAnimations = false,
  parentRef,
}: MessagesProps) {
  const isStreaming = status === "streaming" || status === "submitted";
  const internalParentRef = useRef<HTMLDivElement>(null);
  const scrollElementRef = parentRef || internalParentRef;

  // Show thinking indicator when:
  // 1. Status is "submitted" (waiting for first response)
  // 2. Last message is from user (no assistant response yet)
  const lastMessage = messages[messages.length - 1];
  const showThinkingIndicator =
    status === "submitted" &&
    (!lastMessage || lastMessage.role === "user");

  // Use virtualization only for long conversations
  const shouldVirtualize = messages.length > VIRTUALIZATION_THRESHOLD;

  // Setup virtualizer
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: useCallback(() => ESTIMATED_ROW_HEIGHT, []),
    overscan: 5,
    enabled: shouldVirtualize,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (shouldVirtualize && messages.length > 0) {
      // Small delay to allow DOM to update
      const timer = setTimeout(() => {
        virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [messages.length, shouldVirtualize, virtualizer]);

  const renderMessage = (m: TMessage, i: number) => {
    const key = m.id ?? `message-${i}`;
    const isLatestMessage = i === messages.length - 1;
    const messageNode = (
      <Message
        isLatestMessage={isLatestMessage}
        isLoading={isLoading}
        message={m}
        status={status}
      />
    );

    if (disableAnimations || shouldVirtualize) {
      return (
        <div key={key}>
          {messageNode}
        </div>
      );
    }

    return (
      <motion.div
        key={key}
        layout={!isStreaming || !isLatestMessage}
        initial={{ opacity: 0, translateY: 12 }}
        animate={{ opacity: 1, translateY: 0 }}
        exit={{ opacity: 0, translateY: -8 }}
        transition={{
          duration: isStreaming && isLatestMessage ? 0 : 0.18,
          ease: [0.25, 0.1, 0.25, 1],
        }}
      >
        {messageNode}
      </motion.div>
    );
  };

  // Non-virtualized rendering for short conversations
  if (!shouldVirtualize) {
    const messageElements = messages.map(renderMessage);

    return (
      <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 pb-32 pt-8 sm:px-6 lg:px-8">
        {disableAnimations ? (
          <>
            {messageElements}
            {showThinkingIndicator && <ThinkingIndicator />}
          </>
        ) : (
          <AnimatePresence initial={false}>
            {messageElements}
            {showThinkingIndicator && <ThinkingIndicator key="thinking-indicator" />}
          </AnimatePresence>
        )}
        <div className="h-1" ref={endRef} />
      </div>
    );
  }

  // Virtualized rendering for long conversations
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={internalParentRef}
      className="relative mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8"
      style={{
        height: "100%",
        overflow: parentRef ? "visible" : "auto",
      }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((virtualItem) => {
          const message = messages[virtualItem.index];
          const isLatestMessage = virtualItem.index === messages.length - 1;

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
              }}
              className="py-4"
            >
              <Message
                isLatestMessage={isLatestMessage}
                isLoading={isLoading}
                message={message}
                status={status}
              />
            </div>
          );
        })}
      </div>

      {/* Thinking indicator (always at the bottom) */}
      {showThinkingIndicator && (
        <div
          style={{
            position: "absolute",
            top: `${virtualizer.getTotalSize()}px`,
            left: 0,
            width: "100%",
            padding: "1rem",
          }}
        >
          <ThinkingIndicator />
        </div>
      )}

      {/* Spacer for scroll padding */}
      <div className="h-32" />
      <div className="h-1" ref={endRef} />
    </div>
  );
}

export const Messages = memo(MessagesComponent);
Messages.displayName = "Messages";
