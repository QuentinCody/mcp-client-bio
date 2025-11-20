import type { UIMessage as TMessage } from "ai";
import { Message } from "./message";
import { AnimatePresence, motion } from "motion/react";
import type { RefObject } from "react";

export const Messages = ({
  messages,
  isLoading,
  status,
  endRef,
}: {
  messages: TMessage[];
  isLoading: boolean;
  status: "error" | "submitted" | "streaming" | "ready";
  endRef: RefObject<HTMLDivElement | null>;
}) => {
  // Disable layout animations during streaming to prevent flickering
  const isStreaming = status === "streaming" || status === "submitted";
  
  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-3 px-3 pb-28 pt-6 sm:px-6 lg:px-8">
      <AnimatePresence initial={false}>
        {messages.map((m, i) => {
          const key = m.id ?? `message-${i}`;
          const isLatestMessage = i === messages.length - 1;
          
          return (
            <motion.div
              key={key}
              layout={!isStreaming || !isLatestMessage}
              initial={{ opacity: 0, translateY: 12 }}
              animate={{ opacity: 1, translateY: 0 }}
              exit={{ opacity: 0, translateY: -8 }}
              transition={{ 
                duration: isStreaming && isLatestMessage ? 0 : 0.18, 
                ease: [0.25, 0.1, 0.25, 1] 
              }}
            >
              <Message
                isLatestMessage={isLatestMessage}
                isLoading={isLoading}
                message={m}
                status={status}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
      <div className="h-1" ref={endRef} />
    </div>
  );
};
