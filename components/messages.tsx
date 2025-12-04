import type { UIMessage as TMessage } from "ai";
import { Message } from "./message";
import { AnimatePresence, motion } from "motion/react";
import type { RefObject } from "react";
import { memo } from "react";

interface MessagesProps {
  messages: TMessage[];
  isLoading: boolean;
  status: "error" | "submitted" | "streaming" | "ready";
  endRef: RefObject<HTMLDivElement | null>;
  disableAnimations?: boolean;
}

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

  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-3 px-3 pb-28 pt-6 sm:px-6 lg:px-8">
      {disableAnimations ? (
        messageElements
      ) : (
        <AnimatePresence initial={false}>{messageElements}</AnimatePresence>
      )}
      <div className="h-1" ref={endRef} />
    </div>
  );
}

export const Messages = memo(MessagesComponent);
Messages.displayName = "Messages";
