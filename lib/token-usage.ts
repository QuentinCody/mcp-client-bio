/**
 * Token Usage Tracking Module
 *
 * Provides types and utilities for tracking token usage across
 * all components of the chat system, with provider-specific support.
 */

/**
 * Core token usage structure compatible with all AI providers.
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
}

/**
 * Detailed breakdown of token usage by category.
 */
export interface TokenUsageBreakdown {
  prompt: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  response: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  codeBlocks: {
    estimated: number;
    blocks: number;
  };
  toolCalls: {
    count: number;
    totalTokens: number;
  };
  reasoning: {
    tokens: number;
  };
}

/**
 * Options for formatting token usage display.
 */
export interface FormatOptions {
  compact?: boolean;
}

/**
 * Creates a TokenUsage object with all fields initialized to zero.
 */
export function createEmptyTokenUsage(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
  };
}

export function resolveTotalTokens(
  inputTokens: number,
  outputTokens: number,
  totalTokens?: number
): number {
  if (typeof totalTokens === "number" && totalTokens > 0) {
    return totalTokens;
  }
  return inputTokens + outputTokens;
}

/**
 * Merges two TokenUsage objects by summing all fields.
 */
export function mergeTokenUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
  };
}

/**
 * Estimates the token count for a code block.
 * Uses a rough heuristic of ~4 tokens per line on average.
 */
export function calculateCodeBlockTokens(code: string): number {
  if (!code || code.trim().length === 0) {
    return 0;
  }

  const lines = code.split('\n');
  // Rough estimate: ~4 tokens per line on average for code
  // This accounts for keywords, operators, identifiers, etc.
  return Math.ceil(lines.length * 4);
}

/**
 * Formats a number with comma separators.
 */
function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Formats a number in compact form with K suffix for thousands.
 */
function formatCompact(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    // Format with one decimal place if not a whole number
    if (k % 1 === 0) {
      return `${k}k`;
    }
    return `${k.toFixed(1)}k`;
  }
  return formatNumber(n);
}

/**
 * Formats token usage for display.
 * Handles undefined values gracefully.
 */
export function formatTokenUsage(
  usage: TokenUsage,
  options?: FormatOptions
): string {
  const formatter = options?.compact ? formatCompact : formatNumber;

  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  const total = usage.totalTokens ?? (input + output);

  const parts: string[] = [];

  if (input > 0 || !options?.compact) {
    parts.push(`In: ${formatter(input)}`);
  }
  if (output > 0 || !options?.compact) {
    parts.push(`Out: ${formatter(output)}`);
  }
  parts.push(`Total: ${formatter(total)}`);

  // Add cache info if present
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  if (cacheRead > 0) {
    parts.push(`Cache Read: ${formatter(cacheRead)}`);
  }
  if (cacheWrite > 0) {
    parts.push(`Cache Write: ${formatter(cacheWrite)}`);
  }

  // Add reasoning if present
  const reasoning = usage.reasoningTokens ?? 0;
  if (reasoning > 0) {
    parts.push(`Reasoning: ${formatter(reasoning)}`);
  }

  return parts.join(' | ');
}

/**
 * Extracts TokenUsage from Vercel AI SDK's usage response.
 * Works with the standard usage format from streamText/generateText.
 */
export function extractFromAISDK(usage: {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}): TokenUsage {
  return {
    inputTokens: usage.promptTokens ?? 0,
    outputTokens: usage.completionTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
  };
}

/**
 * Extracts TokenUsage from OpenAI's raw response format.
 */
export function extractFromOpenAI(usage: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}): TokenUsage {
  return {
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
  };
}

/**
 * Extracts TokenUsage from Anthropic's raw response format.
 */
export function extractFromAnthropic(usage: {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}): TokenUsage {
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;

  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: input + output,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    reasoningTokens: 0,
  };
}

/**
 * Extracts TokenUsage from Google/Gemini's raw response format.
 */
export function extractFromGemini(usage: {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  thoughtsTokenCount?: number;
}): TokenUsage {
  return {
    inputTokens: usage.promptTokenCount ?? 0,
    outputTokens: usage.candidatesTokenCount ?? 0,
    totalTokens: usage.totalTokenCount ?? 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: usage.thoughtsTokenCount ?? 0,
  };
}

/**
 * Creates an empty TokenUsageBreakdown.
 */
export function createEmptyBreakdown(): TokenUsageBreakdown {
  return {
    prompt: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    response: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    codeBlocks: { estimated: 0, blocks: 0 },
    toolCalls: { count: 0, totalTokens: 0 },
    reasoning: { tokens: 0 },
  };
}

// ============================================
// Token Usage Store (Per-Conversation)
// ============================================

/**
 * Tool-specific token usage tracking.
 */
export interface ToolTokenUsage {
  toolName: string;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Per-conversation token usage tracking.
 */
interface ConversationTokenUsage {
  chatId: string;
  total: TokenUsage;
  messageCount: number;
  toolUsage: Map<string, ToolTokenUsage>;
  history: Array<{
    timestamp: number;
    usage: TokenUsage;
    model?: string;
    toolName?: string;
  }>;
  lastUpdated: number;
}

/**
 * In-memory store for token usage tracking by conversation.
 */
const conversationStore = new Map<string, ConversationTokenUsage>();

// Legacy session-wide store for backwards compatibility
interface TokenUsageStore {
  lastUsage: TokenUsage | null;
  sessionTotal: TokenUsage;
  messageCount: number;
  history: Array<{
    timestamp: number;
    usage: TokenUsage;
    model?: string;
  }>;
}

const tokenUsageStore: TokenUsageStore = {
  lastUsage: null,
  sessionTotal: createEmptyTokenUsage(),
  messageCount: 0,
  history: [],
};

const MAX_HISTORY_SIZE = 100;
const MAX_CONVERSATIONS = 50;

/**
 * Gets or creates conversation token usage.
 */
function getOrCreateConversation(chatId: string): ConversationTokenUsage {
  let conv = conversationStore.get(chatId);
  if (!conv) {
    conv = {
      chatId,
      total: createEmptyTokenUsage(),
      messageCount: 0,
      toolUsage: new Map(),
      history: [],
      lastUpdated: Date.now(),
    };
    conversationStore.set(chatId, conv);

    // Cleanup old conversations if too many
    if (conversationStore.size > MAX_CONVERSATIONS) {
      const entries = Array.from(conversationStore.entries());
      entries.sort((a, b) => a[1].lastUpdated - b[1].lastUpdated);
      const toRemove = entries.slice(0, entries.length - MAX_CONVERSATIONS);
      toRemove.forEach(([key]) => conversationStore.delete(key));
    }
  }
  return conv;
}

/**
 * Records token usage for a completed message in a specific conversation.
 */
export function recordTokenUsage(
  usage: TokenUsage,
  model?: string,
  chatId?: string,
  toolName?: string
): void {
  // Update legacy session store
  tokenUsageStore.lastUsage = usage;
  tokenUsageStore.sessionTotal = mergeTokenUsage(tokenUsageStore.sessionTotal, usage);
  tokenUsageStore.messageCount += 1;
  tokenUsageStore.history.push({
    timestamp: Date.now(),
    usage,
    model,
  });

  if (tokenUsageStore.history.length > MAX_HISTORY_SIZE) {
    tokenUsageStore.history = tokenUsageStore.history.slice(-MAX_HISTORY_SIZE);
  }

  // Update per-conversation store
  if (chatId) {
    const conv = getOrCreateConversation(chatId);
    conv.total = mergeTokenUsage(conv.total, usage);
    conv.messageCount += 1;
    conv.lastUpdated = Date.now();
    conv.history.push({
      timestamp: Date.now(),
      usage,
      model,
      toolName,
    });

    if (conv.history.length > MAX_HISTORY_SIZE) {
      conv.history = conv.history.slice(-MAX_HISTORY_SIZE);
    }

    // Update tool-specific usage
    if (toolName) {
      const existing = conv.toolUsage.get(toolName) || {
        toolName,
        callCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      };
      conv.toolUsage.set(toolName, {
        toolName,
        callCount: existing.callCount + 1,
        inputTokens: existing.inputTokens + usage.inputTokens,
        outputTokens: existing.outputTokens + usage.outputTokens,
        totalTokens: existing.totalTokens + usage.totalTokens,
      });
    }
  }
}

/**
 * Records tool-specific token usage for a conversation.
 */
export function recordToolTokenUsage(
  chatId: string,
  toolName: string,
  inputTokens: number,
  outputTokens: number
): void {
  const conv = getOrCreateConversation(chatId);
  const existing = conv.toolUsage.get(toolName) || {
    toolName,
    callCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };

  conv.toolUsage.set(toolName, {
    toolName,
    callCount: existing.callCount + 1,
    inputTokens: existing.inputTokens + inputTokens,
    outputTokens: existing.outputTokens + outputTokens,
    totalTokens: existing.totalTokens + inputTokens + outputTokens,
  });

  conv.lastUpdated = Date.now();
}

/**
 * Gets token usage for a specific conversation.
 */
export function getConversationTokenUsage(chatId: string): {
  total: TokenUsage;
  messageCount: number;
  toolUsage: ToolTokenUsage[];
  recentHistory: Array<{ timestamp: number; usage: TokenUsage; model?: string; toolName?: string }>;
} | null {
  const conv = conversationStore.get(chatId);
  if (!conv) return null;

  return {
    total: conv.total,
    messageCount: conv.messageCount,
    toolUsage: Array.from(conv.toolUsage.values()),
    recentHistory: conv.history.slice(-10),
  };
}

/**
 * Gets all conversation token usage summaries.
 */
export function getAllConversationUsage(): Array<{
  chatId: string;
  total: TokenUsage;
  messageCount: number;
  toolCount: number;
  lastUpdated: number;
}> {
  return Array.from(conversationStore.values()).map((conv) => ({
    chatId: conv.chatId,
    total: conv.total,
    messageCount: conv.messageCount,
    toolCount: conv.toolUsage.size,
    lastUpdated: conv.lastUpdated,
  }));
}

/**
 * Gets the current session-wide token usage statistics (legacy).
 */
export function getTokenUsageStats(): {
  lastUsage: TokenUsage | null;
  sessionTotal: TokenUsage;
  messageCount: number;
  recentHistory: Array<{ timestamp: number; usage: TokenUsage; model?: string }>;
} {
  return {
    lastUsage: tokenUsageStore.lastUsage,
    sessionTotal: tokenUsageStore.sessionTotal,
    messageCount: tokenUsageStore.messageCount,
    recentHistory: tokenUsageStore.history.slice(-10),
  };
}

/**
 * Resets token usage for a specific conversation.
 */
export function resetConversationTokenUsage(chatId: string): void {
  conversationStore.delete(chatId);
}

/**
 * Resets the session-wide token usage.
 */
export function resetTokenUsageSession(): void {
  tokenUsageStore.lastUsage = null;
  tokenUsageStore.sessionTotal = createEmptyTokenUsage();
  tokenUsageStore.messageCount = 0;
  tokenUsageStore.history = [];
  conversationStore.clear();
}
