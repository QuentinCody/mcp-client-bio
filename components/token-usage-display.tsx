"use client";

import { useState, useEffect } from "react";
import { formatTokenUsage, type TokenUsage } from "@/lib/token-usage";
import { Coins, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface TokenUsageDisplayProps {
  usage: TokenUsage | null;
  className?: string;
  compact?: boolean;
}

export function TokenUsageDisplay({
  usage,
  className,
  compact = false,
}: TokenUsageDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!usage || usage.totalTokens === 0) {
    return null;
  }

  const formattedTotal = formatTokenUsage(usage, { compact: true });

  if (compact) {
    return (
      <div
        className={cn(
          "flex items-center gap-1.5 text-xs text-muted-foreground",
          className
        )}
      >
        <Coins className="h-3 w-3" />
        <span>{usage.totalTokens.toLocaleString()} tokens</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-muted/30 p-3",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between text-sm font-medium text-foreground hover:text-foreground/80"
      >
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-primary" />
          <span>Token Usage</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {usage.totalTokens.toLocaleString()} total
          </span>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <TokenMetric label="Input" value={usage.inputTokens} color="blue" />
          <TokenMetric label="Output" value={usage.outputTokens} color="green" />
          {usage.cacheReadTokens > 0 && (
            <TokenMetric
              label="Cache Read"
              value={usage.cacheReadTokens}
              color="purple"
            />
          )}
          {usage.cacheWriteTokens > 0 && (
            <TokenMetric
              label="Cache Write"
              value={usage.cacheWriteTokens}
              color="orange"
            />
          )}
          {usage.reasoningTokens > 0 && (
            <TokenMetric
              label="Reasoning"
              value={usage.reasoningTokens}
              color="yellow"
            />
          )}
        </div>
      )}
    </div>
  );
}

interface TokenMetricProps {
  label: string;
  value: number;
  color: "blue" | "green" | "purple" | "orange" | "yellow";
}

function TokenMetric({ label, value, color }: TokenMetricProps) {
  const colorClasses = {
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    green: "bg-green-500/10 text-green-600 dark:text-green-400",
    purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    yellow: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-md px-2 py-1.5",
        colorClasses[color]
      )}
    >
      <span className="font-medium">{label}</span>
      <span className="tabular-nums">{value.toLocaleString()}</span>
    </div>
  );
}

// Hook to aggregate token usage from streamed responses
export function useTokenUsage() {
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  const [sessionTotal, setSessionTotal] = useState<TokenUsage>({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
  });

  const updateUsage = (newUsage: TokenUsage) => {
    setUsage(newUsage);
    setSessionTotal((prev) => ({
      inputTokens: prev.inputTokens + newUsage.inputTokens,
      outputTokens: prev.outputTokens + newUsage.outputTokens,
      totalTokens: prev.totalTokens + newUsage.totalTokens,
      cacheReadTokens: prev.cacheReadTokens + newUsage.cacheReadTokens,
      cacheWriteTokens: prev.cacheWriteTokens + newUsage.cacheWriteTokens,
      reasoningTokens: prev.reasoningTokens + newUsage.reasoningTokens,
    }));
  };

  const resetUsage = () => {
    setUsage(null);
  };

  const resetSession = () => {
    setUsage(null);
    setSessionTotal({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    });
  };

  return {
    usage,
    sessionTotal,
    updateUsage,
    resetUsage,
    resetSession,
  };
}
