"use client";

import {
  useTokenUsageSafe,
  useConversationTokenUsage,
  formatTokenCount,
  type ToolTokenUsage
} from "@/lib/context/token-context";
import { Coins, TrendingUp, TrendingDown, Wrench, ChevronDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";

interface TokenIndicatorProps {
  variant?: "compact" | "full" | "inline";
  showDetails?: boolean;
  className?: string;
  chatId?: string; // When provided, shows per-conversation data
}

export function TokenIndicator({
  variant = "compact",
  showDetails = true,
  className,
  chatId,
}: TokenIndicatorProps) {
  const globalContext = useTokenUsageSafe();
  const conversationData = useConversationTokenUsage(chatId);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Use conversation data when chatId is provided, otherwise fall back to global
  const hasUsage = chatId ? conversationData.hasUsage : (globalContext?.hasUsage ?? false);

  if (!hasUsage) {
    return null;
  }

  // Get data from the appropriate source
  const totalTokens = chatId ? conversationData.totalTokens : (globalContext?.totalTokens ?? 0);
  const inputTokens = chatId ? conversationData.inputTokens : (globalContext?.inputTokens ?? 0);
  const outputTokens = chatId ? conversationData.outputTokens : (globalContext?.outputTokens ?? 0);
  const messageCount = chatId ? conversationData.messageCount : (globalContext?.messageCount ?? 0);
  const cacheReadTokens = chatId ? conversationData.cacheReadTokens : (globalContext?.stats?.sessionTotal?.cacheReadTokens ?? 0);
  const reasoningTokens = chatId ? conversationData.reasoningTokens : (globalContext?.stats?.sessionTotal?.reasoningTokens ?? 0);
  const toolUsage = chatId ? conversationData.toolUsage : [];
  const onReset = chatId
    ? conversationData.reset ?? (() => {})
    : (globalContext?.reset ?? (() => {}));

  if (variant === "inline") {
    return (
      <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <Coins className="h-3 w-3" />
        <span className="tabular-nums">{formatTokenCount(totalTokens, true)}</span>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className={cn("relative", className)} ref={dropdownRef}>
        <button
          onClick={() => showDetails && setIsOpen(!isOpen)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5 text-xs font-medium transition-colors",
            showDetails && "hover:bg-muted hover:text-foreground cursor-pointer",
            isOpen && "bg-muted text-foreground"
          )}
        >
          <Coins className="h-3.5 w-3.5 text-amber-500" />
          <span className="tabular-nums text-muted-foreground">
            {formatTokenCount(totalTokens, true)}
          </span>
          {showDetails && (
            <ChevronDown className={cn(
              "h-3 w-3 text-muted-foreground transition-transform",
              isOpen && "rotate-180"
            )} />
          )}
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl border border-border bg-background/95 backdrop-blur-sm shadow-lg p-3"
            >
              <TokenDetailsPanel
                totalTokens={totalTokens}
                inputTokens={inputTokens}
                outputTokens={outputTokens}
                messageCount={messageCount}
                cacheReadTokens={cacheReadTokens}
                reasoningTokens={reasoningTokens}
                toolUsage={toolUsage}
                onReset={onReset}
                isConversation={!!chatId}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Full variant
  return (
    <div className={cn("rounded-xl border border-border bg-background p-4", className)}>
      <TokenDetailsPanel
        totalTokens={totalTokens}
        inputTokens={inputTokens}
        outputTokens={outputTokens}
        messageCount={messageCount}
        cacheReadTokens={cacheReadTokens}
        reasoningTokens={reasoningTokens}
        toolUsage={toolUsage}
        onReset={onReset}
        isConversation={!!chatId}
        expanded
      />
    </div>
  );
}

interface TokenDetailsPanelProps {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  messageCount: number;
  cacheReadTokens?: number;
  reasoningTokens?: number;
  toolUsage?: ToolTokenUsage[];
  onReset: () => void;
  isConversation?: boolean;
  expanded?: boolean;
}

function TokenDetailsPanel({
  totalTokens,
  inputTokens,
  outputTokens,
  messageCount,
  cacheReadTokens = 0,
  reasoningTokens = 0,
  toolUsage = [],
  onReset,
  isConversation = false,
  expanded = false,
}: TokenDetailsPanelProps) {
  const avgPerMessage = messageCount > 0 ? Math.round(totalTokens / messageCount) : 0;
  const inputRatio = totalTokens > 0 ? (inputTokens / totalTokens) * 100 : 0;
  const [showTools, setShowTools] = useState(false);

  // Sort tools by total tokens (descending)
  const sortedTools = [...toolUsage].sort((a, b) => b.totalTokens - a.totalTokens);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10">
            <Coins className="h-4 w-4 text-amber-500" />
          </div>
          <div>
            <div className="text-sm font-medium text-foreground">
              {isConversation ? "Conversation Tokens" : "Token Usage"}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {messageCount} message{messageCount !== 1 ? "s" : ""}
              {toolUsage.length > 0 && ` • ${toolUsage.reduce((sum, t) => sum + t.callCount, 0)} tool calls`}
            </div>
          </div>
        </div>
        <button
          onClick={onReset}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
        >
          Reset
        </button>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-2 gap-2">
        <TokenStatCard
          label="Input"
          value={inputTokens}
          icon={<TrendingUp className="h-3 w-3" />}
          color="blue"
        />
        <TokenStatCard
          label="Output"
          value={outputTokens}
          icon={<TrendingDown className="h-3 w-3" />}
          color="green"
        />
      </div>

      {/* Total */}
      <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">Total</span>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {formatTokenCount(totalTokens)}
        </span>
      </div>

      {/* Token Bar */}
      <div className="space-y-1">
        <div className="h-2 rounded-full bg-muted overflow-hidden flex">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${inputRatio}%` }}
          />
          <div
            className="h-full bg-green-500 transition-all duration-300"
            style={{ width: `${100 - inputRatio}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Input {inputRatio.toFixed(0)}%</span>
          <span>Output {(100 - inputRatio).toFixed(0)}%</span>
        </div>
      </div>

      {/* Extra Stats */}
      {(cacheReadTokens > 0 || reasoningTokens > 0) && (
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
          {cacheReadTokens > 0 && (
            <div className="text-[10px]">
              <span className="text-purple-500">Cache:</span>{" "}
              <span className="text-muted-foreground">
                {formatTokenCount(cacheReadTokens, true)}
              </span>
            </div>
          )}
          {reasoningTokens > 0 && (
            <div className="text-[10px]">
              <span className="text-amber-500">Thinking:</span>{" "}
              <span className="text-muted-foreground">
                {formatTokenCount(reasoningTokens, true)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Tool Usage Section */}
      {toolUsage.length > 0 && (
        <div className="pt-1 border-t border-border/50">
          <button
            onClick={() => setShowTools(!showTools)}
            className="flex items-center justify-between w-full text-[10px] py-1 hover:bg-muted/50 rounded transition-colors"
          >
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Wrench className="h-3 w-3" />
              Tool Usage ({toolUsage.length} tools)
            </span>
            <ChevronDown
              className={cn(
                "h-3 w-3 text-muted-foreground transition-transform",
                showTools && "rotate-180"
              )}
            />
          </button>
          <AnimatePresence>
            {showTools && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="mt-2 space-y-1.5 max-h-32 overflow-y-auto">
                  {sortedTools.map((tool) => (
                    <div
                      key={tool.toolName}
                      className="flex items-center justify-between text-[10px] px-2 py-1 rounded bg-muted/30"
                    >
                      <span className="text-muted-foreground truncate max-w-[120px]" title={tool.toolName}>
                        {tool.toolName}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground/60">×{tool.callCount}</span>
                        <span className="tabular-nums font-medium">
                          {formatTokenCount(tool.totalTokens, true)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Average */}
      {avgPerMessage > 0 && (
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Avg per message</span>
          <span className="font-medium tabular-nums text-muted-foreground">
            ~{formatTokenCount(avgPerMessage)}
          </span>
        </div>
      )}
    </div>
  );
}

interface TokenStatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: "blue" | "green" | "purple" | "amber";
}

function TokenStatCard({ label, value, icon, color }: TokenStatCardProps) {
  const colorClasses = {
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    green: "bg-green-500/10 text-green-600 dark:text-green-400",
    purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  };

  const iconColorClasses = {
    blue: "text-blue-500",
    green: "text-green-500",
    purple: "text-purple-500",
    amber: "text-amber-500",
  };

  return (
    <div className={cn("rounded-lg px-3 py-2", colorClasses[color])}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className={iconColorClasses[color]}>{icon}</span>
        <span className="text-[10px] font-medium opacity-80">{label}</span>
      </div>
      <div className="text-sm font-semibold tabular-nums">
        {formatTokenCount(value)}
      </div>
    </div>
  );
}
