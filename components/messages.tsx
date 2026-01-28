import type { UIMessage as TMessage } from "ai";
import { Message } from "./message";
import { AnimatePresence, motion } from "motion/react";
import type { RefObject } from "react";
import { memo } from "react";
import { Brain, Sparkles } from "lucide-react";

interface MessagesProps {
  messages: TMessage[];
  isLoading: boolean;
  status: "error" | "submitted" | "streaming" | "ready";
  endRef: RefObject<HTMLDivElement | null>;
  disableAnimations?: boolean;
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

function MessagesComponent({
  messages,
  isLoading,
  status,
  endRef,
  disableAnimations = false,
}: MessagesProps) {
  // Disable layout animations during streaming to prevent flickering
  const isStreaming = status === "streaming" || status === "submitted";
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

    if (disableAnimations) {
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

  const messageElements = messages.map(renderMessage);

  // Show thinking indicator when:
  // 1. Status is "submitted" (waiting for first response)
  // 2. Last message is from user (no assistant response yet)
  const lastMessage = messages[messages.length - 1];
  const showThinkingIndicator =
    status === "submitted" &&
    (!lastMessage || lastMessage.role === "user");

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

export const Messages = memo(MessagesComponent);
Messages.displayName = "Messages";
