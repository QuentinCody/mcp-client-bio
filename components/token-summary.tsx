"use client";

import {
  useTokenUsageSafe,
  useConversationTokenUsage,
  formatTokenCount,
} from "@/lib/context/token-context";
import { Coins, Zap, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";

interface TokenSummaryProps {
  className?: string;
  showWhenEmpty?: boolean;
  chatId?: string;
}

export function TokenSummary({ className, showWhenEmpty = false, chatId }: TokenSummaryProps) {
  const globalContext = useTokenUsageSafe();
  const conversationData = useConversationTokenUsage(chatId);

  // Use conversation data when chatId is provided
  const hasUsage = chatId ? conversationData.hasUsage : (globalContext?.hasUsage ?? false);
  const totalTokens = chatId ? conversationData.totalTokens : (globalContext?.totalTokens ?? 0);
  const inputTokens = chatId ? conversationData.inputTokens : (globalContext?.inputTokens ?? 0);
  const outputTokens = chatId ? conversationData.outputTokens : (globalContext?.outputTokens ?? 0);
  const messageCount = chatId ? conversationData.messageCount : (globalContext?.messageCount ?? 0);
  const toolCount = chatId ? conversationData.toolUsage.reduce((sum, t) => sum + t.callCount, 0) : 0;

  if (!hasUsage && !showWhenEmpty) return null;

  return (
    <AnimatePresence>
      {hasUsage && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.2 }}
          className={cn(
            "flex items-center gap-3 text-[11px] text-muted-foreground",
            className
          )}
        >
          <div className="flex items-center gap-1.5">
            <Coins className="h-3 w-3 text-amber-500" />
            <span className="font-medium tabular-nums">
              {formatTokenCount(totalTokens, true)}
            </span>
            <span className="text-muted-foreground/60">tokens</span>
          </div>

          <div className="h-3 w-px bg-border" />

          <div className="hidden sm:flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="text-blue-500">In:</span>
              <span className="tabular-nums">{formatTokenCount(inputTokens, true)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-green-500">Out:</span>
              <span className="tabular-nums">{formatTokenCount(outputTokens, true)}</span>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-1 text-muted-foreground/60">
            <Zap className="h-2.5 w-2.5" />
            <span>{messageCount} msg{messageCount !== 1 ? "s" : ""}</span>
          </div>

          {toolCount > 0 && (
            <div className="hidden sm:flex items-center gap-1 text-muted-foreground/60">
              <Wrench className="h-2.5 w-2.5" />
              <span>{toolCount} tool{toolCount !== 1 ? "s" : ""}</span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Inline variant for tight spaces
export function TokenSummaryInline({ className }: { className?: string }) {
  const context = useTokenUsageSafe();

  if (!context?.hasUsage) return null;

  const { totalTokens } = context;

  return (
    <div className={cn("flex items-center gap-1 text-[10px] text-muted-foreground", className)}>
      <Coins className="h-2.5 w-2.5 text-amber-500/70" />
      <span className="tabular-nums">{formatTokenCount(totalTokens, true)}</span>
    </div>
  );
}

// Live streaming indicator with token animation
export function TokenStreamIndicator({
  isStreaming,
  className,
}: {
  isStreaming: boolean;
  className?: string;
}) {
  const context = useTokenUsageSafe();

  if (!isStreaming || !context?.hasUsage) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        "flex items-center gap-1.5 text-xs text-primary",
        className
      )}
    >
      <motion.div
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 0.6, repeat: Infinity }}
      >
        <Zap className="h-3 w-3" />
      </motion.div>
      <span className="tabular-nums font-medium">
        {formatTokenCount(context.totalTokens, true)}
      </span>
    </motion.div>
  );
}
