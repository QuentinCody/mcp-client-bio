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
  return (
    <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-2.5 py-4 sm:px-2">
      <AnimatePresence initial={false}>
        {messages.map((m, i) => {
          const key = m.id ?? `message-${i}`;
          return (
            <motion.div
              key={key}
              layout
              initial={{ opacity: 0, translateY: 12 }}
              animate={{ opacity: 1, translateY: 0 }}
              exit={{ opacity: 0, translateY: -8 }}
              transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <Message
                isLatestMessage={i === messages.length - 1}
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
