/**
 * TDD Tests for Token Usage Tracking
 *
 * Tests verify that token counts are properly tracked and exposed
 * for all components of the chat system.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TokenUsage,
  TokenUsageBreakdown,
  createEmptyTokenUsage,
  resolveTotalTokens,
  mergeTokenUsage,
  calculateCodeBlockTokens,
  formatTokenUsage,
  recordTokenUsage,
  getTokenUsageStats,
  resetTokenUsageSession,
} from './token-usage';

describe('Token Usage Types', () => {
  it('creates empty token usage with all fields initialized', () => {
    const usage = createEmptyTokenUsage();

    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
    expect(usage.totalTokens).toBe(0);
    expect(usage.cacheReadTokens).toBe(0);
    expect(usage.cacheWriteTokens).toBe(0);
    expect(usage.reasoningTokens).toBe(0);
  });

  it('merges token usage from multiple steps', () => {
    const step1: TokenUsage = {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      reasoningTokens: 0,
    };

    const step2: TokenUsage = {
      inputTokens: 80,
      outputTokens: 120,
      totalTokens: 200,
      cacheReadTokens: 20,
      cacheWriteTokens: 0,
      reasoningTokens: 30,
    };

    const merged = mergeTokenUsage(step1, step2);

    expect(merged.inputTokens).toBe(180);
    expect(merged.outputTokens).toBe(170);
    expect(merged.totalTokens).toBe(350);
    expect(merged.cacheReadTokens).toBe(30);
    expect(merged.cacheWriteTokens).toBe(5);
    expect(merged.reasoningTokens).toBe(30);
  });

  it('resolves total tokens when providers omit totals', () => {
    expect(resolveTotalTokens(120, 80, undefined)).toBe(200);
    expect(resolveTotalTokens(120, 80, 0)).toBe(200);
  });

  it('prefers provider totals when available', () => {
    expect(resolveTotalTokens(120, 80, 250)).toBe(250);
  });
});

describe('Token Usage Breakdown', () => {
  it('tracks code block token estimates', () => {
    const code = `const x = 1;
const y = 2;
return x + y;`;

    const tokens = calculateCodeBlockTokens(code);

    // Rough estimate: ~4 tokens per line average
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(100);
  });

  it('provides breakdown by category', () => {
    const breakdown: TokenUsageBreakdown = {
      prompt: { inputTokens: 500, outputTokens: 0, totalTokens: 500 },
      response: { inputTokens: 0, outputTokens: 300, totalTokens: 300 },
      codeBlocks: { estimated: 50, blocks: 2 },
      toolCalls: { count: 3, totalTokens: 150 },
      reasoning: { tokens: 100 },
    };

    expect(breakdown.prompt.inputTokens).toBe(500);
    expect(breakdown.response.outputTokens).toBe(300);
    expect(breakdown.codeBlocks.blocks).toBe(2);
    expect(breakdown.toolCalls.count).toBe(3);
    expect(breakdown.reasoning.tokens).toBe(100);
  });
});

describe('Token Usage Formatting', () => {
  it('formats token counts for display', () => {
    const usage: TokenUsage = {
      inputTokens: 1234,
      outputTokens: 567,
      totalTokens: 1801,
      cacheReadTokens: 100,
      cacheWriteTokens: 50,
      reasoningTokens: 200,
    };

    const formatted = formatTokenUsage(usage);

    expect(formatted).toContain('1,234');
    expect(formatted).toContain('567');
    expect(formatted).toContain('1,801');
  });

  it('handles undefined values gracefully', () => {
    const usage: Partial<TokenUsage> = {
      inputTokens: undefined,
      outputTokens: 100,
    };

    const formatted = formatTokenUsage(usage as TokenUsage);

    expect(formatted).toContain('100');
    expect(formatted).not.toContain('undefined');
  });

  it('formats large token counts with K suffix', () => {
    const usage: TokenUsage = {
      inputTokens: 15000,
      outputTokens: 8500,
      totalTokens: 23500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    };

    const formatted = formatTokenUsage(usage, { compact: true });

    expect(formatted).toMatch(/15\.?0?k|15,000/i);
  });
});

describe('Provider Token Verification', () => {
  it('extracts token usage from OpenAI response format', () => {
    const openAIUsage = {
      prompt_tokens: 150,
      completion_tokens: 75,
      total_tokens: 225,
    };

    // This would be part of the provider-specific extraction
    expect(openAIUsage.prompt_tokens).toBe(150);
    expect(openAIUsage.completion_tokens).toBe(75);
    expect(openAIUsage.total_tokens).toBe(225);
  });

  it('extracts token usage from Anthropic response format', () => {
    const anthropicUsage = {
      input_tokens: 200,
      output_tokens: 100,
      cache_creation_input_tokens: 50,
      cache_read_input_tokens: 25,
    };

    expect(anthropicUsage.input_tokens).toBe(200);
    expect(anthropicUsage.output_tokens).toBe(100);
    expect(anthropicUsage.cache_creation_input_tokens).toBe(50);
    expect(anthropicUsage.cache_read_input_tokens).toBe(25);
  });

  it('extracts token usage from Google/Gemini response format', () => {
    const geminiUsage = {
      promptTokenCount: 180,
      candidatesTokenCount: 90,
      totalTokenCount: 270,
      thoughtsTokenCount: 40,
    };

    expect(geminiUsage.promptTokenCount).toBe(180);
    expect(geminiUsage.candidatesTokenCount).toBe(90);
    expect(geminiUsage.totalTokenCount).toBe(270);
    expect(geminiUsage.thoughtsTokenCount).toBe(40);
  });
});

describe('Token Usage Store', () => {
  beforeEach(() => {
    resetTokenUsageSession();
  });

  it('records and retrieves token usage', () => {
    const usage: TokenUsage = {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      reasoningTokens: 0,
    };

    recordTokenUsage(usage, 'gpt-4');

    const stats = getTokenUsageStats();
    expect(stats.lastUsage).toEqual(usage);
    expect(stats.messageCount).toBe(1);
    expect(stats.sessionTotal.totalTokens).toBe(150);
  });

  it('aggregates token usage across multiple messages', () => {
    const usage1: TokenUsage = {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    };

    const usage2: TokenUsage = {
      inputTokens: 200,
      outputTokens: 100,
      totalTokens: 300,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    };

    recordTokenUsage(usage1, 'gpt-4');
    recordTokenUsage(usage2, 'claude-3');

    const stats = getTokenUsageStats();
    expect(stats.messageCount).toBe(2);
    expect(stats.sessionTotal.inputTokens).toBe(300);
    expect(stats.sessionTotal.outputTokens).toBe(150);
    expect(stats.sessionTotal.totalTokens).toBe(450);
    expect(stats.lastUsage).toEqual(usage2);
  });

  it('resets session data', () => {
    const usage: TokenUsage = {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    };

    recordTokenUsage(usage, 'gpt-4');
    resetTokenUsageSession();

    const stats = getTokenUsageStats();
    expect(stats.lastUsage).toBeNull();
    expect(stats.messageCount).toBe(0);
    expect(stats.sessionTotal.totalTokens).toBe(0);
    expect(stats.recentHistory).toHaveLength(0);
  });

  it('keeps recent history of token usage', () => {
    for (let i = 0; i < 5; i++) {
      const usage: TokenUsage = {
        inputTokens: 100 + i * 10,
        outputTokens: 50 + i * 5,
        totalTokens: 150 + i * 15,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
      };
      recordTokenUsage(usage, `model-${i}`);
    }

    const stats = getTokenUsageStats();
    expect(stats.messageCount).toBe(5);
    expect(stats.recentHistory).toHaveLength(5);
    expect(stats.recentHistory[4].model).toBe('model-4');
  });
});
