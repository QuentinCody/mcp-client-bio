"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { TokenUsage, ToolTokenUsage } from "@/lib/token-usage";

interface TokenUsageStats {
  lastUsage: TokenUsage | null;
  sessionTotal: TokenUsage;
  messageCount: number;
  recentHistory: Array<{
    timestamp: number;
    usage: TokenUsage;
    model?: string;
  }>;
  conversations?: Array<{
    chatId: string;
    total: TokenUsage;
    messageCount: number;
    toolCount: number;
    lastUpdated: number;
  }>;
}

// Per-conversation token usage
interface ConversationTokenStats {
  total: TokenUsage;
  messageCount: number;
  toolUsage: ToolTokenUsage[];
  recentHistory: Array<{
    timestamp: number;
    usage: TokenUsage;
    model?: string;
    toolName?: string;
  }>;
}

interface TokenContextValue {
  stats: TokenUsageStats | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  reset: () => Promise<void>;
  resetConversation: (chatId: string) => Promise<void>;
  fetchConversationStats: (chatId: string) => Promise<ConversationTokenStats | null>;
  // Derived values for easy access
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  messageCount: number;
  lastMessageTokens: number | null;
  hasUsage: boolean;
}

const defaultStats: TokenUsageStats = {
  lastUsage: null,
  sessionTotal: {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
  },
  messageCount: 0,
  recentHistory: [],
};

const TokenContext = createContext<TokenContextValue | null>(null);

interface TokenProviderProps {
  children: ReactNode;
  pollInterval?: number;
}

export function TokenProvider({
  children,
  pollInterval = 3000,
}: TokenProviderProps) {
  const [stats, setStats] = useState<TokenUsageStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/token-usage");
      if (!res.ok) {
        throw new Error("Failed to fetch token usage");
      }
      const data = await res.json();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
    }
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    await fetchStats();
    setIsLoading(false);
  }, [fetchStats]);

  const reset = useCallback(async () => {
    try {
      await fetch("/api/token-usage", { method: "DELETE" });
      setStats(defaultStats);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to reset"));
    }
  }, []);

  const resetConversation = useCallback(async (chatId: string) => {
    try {
      await fetch(`/api/token-usage?chatId=${encodeURIComponent(chatId)}`, {
        method: "DELETE"
      });
      // Refresh global stats after resetting conversation
      await fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to reset conversation"));
    }
  }, [fetchStats]);

  const fetchConversationStats = useCallback(async (chatId: string): Promise<ConversationTokenStats | null> => {
    try {
      const res = await fetch(`/api/token-usage?chatId=${encodeURIComponent(chatId)}`);
      if (!res.ok) {
        return null;
      }
      const data = await res.json();
      return data as ConversationTokenStats;
    } catch {
      return null;
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Polling
  useEffect(() => {
    const interval = setInterval(fetchStats, pollInterval);
    return () => clearInterval(interval);
  }, [fetchStats, pollInterval]);

  // Derived values
  const totalTokens = stats?.sessionTotal.totalTokens ?? 0;
  const inputTokens = stats?.sessionTotal.inputTokens ?? 0;
  const outputTokens = stats?.sessionTotal.outputTokens ?? 0;
  const messageCount = stats?.messageCount ?? 0;
  const lastMessageTokens = stats?.lastUsage?.totalTokens ?? null;
  const hasUsage = totalTokens > 0;

  const value: TokenContextValue = {
    stats,
    isLoading,
    error,
    refresh,
    reset,
    resetConversation,
    fetchConversationStats,
    totalTokens,
    inputTokens,
    outputTokens,
    messageCount,
    lastMessageTokens,
    hasUsage,
  };

  return (
    <TokenContext.Provider value={value}>{children}</TokenContext.Provider>
  );
}

export function useTokenUsage() {
  const context = useContext(TokenContext);
  if (!context) {
    throw new Error("useTokenUsage must be used within a TokenProvider");
  }
  return context;
}

// Optional hook that doesn't throw if context is missing
export function useTokenUsageSafe() {
  return useContext(TokenContext);
}

// Format helpers
export function formatTokenCount(count: number, compact = false): string {
  if (compact && count >= 10000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  if (compact && count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toLocaleString();
}

export function formatTokenRate(
  tokens: number,
  durationMs: number
): string {
  if (durationMs <= 0) return "—";
  const tokensPerSecond = (tokens / durationMs) * 1000;
  return `${tokensPerSecond.toFixed(0)} tok/s`;
}

// Hook for per-conversation token usage with automatic polling
export function useConversationTokenUsage(
  chatId: string | undefined,
  pollInterval = 3000
) {
  const context = useContext(TokenContext);
  const [conversationStats, setConversationStats] = useState<ConversationTokenStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!chatId || !context?.fetchConversationStats) return;

    const stats = await context.fetchConversationStats(chatId);
    setConversationStats(stats);
  }, [chatId, context]);

  // Initial fetch
  useEffect(() => {
    if (!chatId) {
      setConversationStats(null);
      return;
    }
    setIsLoading(true);
    fetchStats().finally(() => setIsLoading(false));
  }, [chatId, fetchStats]);

  // Polling
  useEffect(() => {
    if (!chatId) return;

    const interval = setInterval(fetchStats, pollInterval);
    return () => clearInterval(interval);
  }, [chatId, fetchStats, pollInterval]);

  // Derived values
  const total = conversationStats?.total;
  const totalTokens = total?.totalTokens ?? 0;
  const inputTokens = total?.inputTokens ?? 0;
  const outputTokens = total?.outputTokens ?? 0;
  const cacheReadTokens = total?.cacheReadTokens ?? 0;
  const cacheWriteTokens = total?.cacheWriteTokens ?? 0;
  const reasoningTokens = total?.reasoningTokens ?? 0;
  const messageCount = conversationStats?.messageCount ?? 0;
  const toolUsage = conversationStats?.toolUsage ?? [];
  const recentHistory = conversationStats?.recentHistory ?? [];
  const hasUsage = totalTokens > 0;

  return {
    stats: conversationStats,
    isLoading,
    refresh: fetchStats,
    reset: chatId ? () => context?.resetConversation(chatId) : undefined,
    // Derived values
    totalTokens,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
    messageCount,
    toolUsage,
    recentHistory,
    hasUsage,
  };
}

// Export the ConversationTokenStats type for use elsewhere
export type { ConversationTokenStats, ToolTokenUsage };
