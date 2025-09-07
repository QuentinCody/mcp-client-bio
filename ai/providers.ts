import { createGroq } from "@ai-sdk/groq";
import { createXai } from "@ai-sdk/xai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

import {
  customProvider,
  wrapLanguageModel,
  extractReasoningMiddleware
} from "ai";

export interface ModelInfo {
  provider: string;
  name: string;
  description: string;
  apiVersion: string;
  capabilities: string[];
}

const middleware = extractReasoningMiddleware({
  tagName: 'think',
});

// Helper to get API keys from environment variables first, then localStorage
const getApiKey = (key: string): string | undefined => {
  // Check for environment variables first
  if (process.env[key]) {
    return process.env[key] || undefined;
  }

  // Fall back to localStorage if available
  if (typeof window !== 'undefined') {
    return window.localStorage.getItem(key) || undefined;
  }

  return undefined;
};

const groqClient = createGroq({
  apiKey: getApiKey('GROQ_API_KEY'),
});

const xaiClient = createXai({
  apiKey: getApiKey('XAI_API_KEY'),
});

const anthropicClient = createAnthropic({
  apiKey: getApiKey('ANTHROPIC_API_KEY'),
});

const openaiClient = createOpenAI({
  apiKey: getApiKey('OPENAI_API_KEY'),
});

const googleClient = createGoogleGenerativeAI({
  apiKey: getApiKey('GOOGLE_GENERATIVE_AI_API_KEY'),
});

const languageModels = {
  "claude-sonnet-4": anthropicClient("claude-sonnet-4-20250514"),
  "gpt-5": openaiClient("gpt-5"),
  "gpt-5-mini": openaiClient("gpt-5-mini"), 
  "gpt-5-nano": openaiClient("gpt-5-nano"),
  "gpt-4o": openaiClient("gpt-4o"),
  "gpt-4o-mini": openaiClient("gpt-4o-mini"),
  "qwen3-32b": wrapLanguageModel(
    {
      model: groqClient('qwen/qwen3-32b'),
      middleware
    }
  ),
  "grok-3-mini": xaiClient("grok-3-mini-latest"),
  "kimi-k2": groqClient('moonshotai/kimi-k2-instruct'),
  "llama4": groqClient('meta-llama/llama-4-scout-17b-16e-instruct'),
  "gemini-2.5-pro": googleClient("gemini-2.5-pro"),
  "gemini-2.5-flash": googleClient("gemini-2.5-flash"),
  "gemini-2.5-flash-lite": googleClient("gemini-2.5-flash-lite")
};

export const modelDetails: Record<keyof typeof languageModels, ModelInfo> = {
  "claude-sonnet-4": {
    provider: "Anthropic",
    name: "Claude Sonnet 4",
    description: "High-performance model with exceptional reasoning capabilities and fast response times.",
    apiVersion: "claude-sonnet-4-20250514",
    capabilities: ["Reasoning", "Analysis", "Agentic", "Tools", "Fast"]
  },
  "gpt-5": {
    provider: "OpenAI",
    name: "GPT-5",
    description: "OpenAI's most advanced model with state-of-the-art performance across coding, math, writing, health, and visual perception.",
    apiVersion: "gpt-5",
    capabilities: ["Reasoning", "Analysis", "Coding", "Writing", "Health", "Vision", "Tools"]
  },
  "gpt-5-mini": {
    provider: "OpenAI", 
    name: "GPT-5 Mini",
    description: "A faster, cheaper version of GPT-5 for well-defined tasks while maintaining high quality.",
    apiVersion: "gpt-5-mini",
    capabilities: ["Reasoning", "Analysis", "Coding", "Writing", "Tools", "Fast"]
  },
  "gpt-5-nano": {
    provider: "OpenAI",
    name: "GPT-5 Nano", 
    description: "The fastest, cheapest version of GPT-5—great for summarization and classification tasks.",
    apiVersion: "gpt-5-nano",
    capabilities: ["Analysis", "Classification", "Summarization", "Fast"]
  },
  "gpt-4o": {
    provider: "OpenAI",
    name: "GPT-4o",
    description: "GPT-4 Omni with multimodal capabilities including text, images, and audio.",
    apiVersion: "gpt-4o",
    capabilities: ["Reasoning", "Analysis", "Vision", "Audio", "Tools"]
  },
  "gpt-4o-mini": {
    provider: "OpenAI",
    name: "GPT-4o Mini",
    description: "Faster, more affordable version of GPT-4o for simpler tasks.",
    apiVersion: "gpt-4o-mini", 
    capabilities: ["Analysis", "Vision", "Tools", "Fast"]
  },
  "kimi-k2": {
    provider: "Groq",
    name: "Kimi K2",
    description: "Latest version of Moonshot AI's Kimi K2 with good balance of capabilities.",
    apiVersion: "kimi-k2-instruct",
    capabilities: ["Balanced", "Efficient", "Agentic"]
  },
  "qwen3-32b": {
    provider: "Groq",
    name: "Qwen 3 32B",
    description: "Latest version of Alibaba's Qwen 32B with strong reasoning and coding capabilities.",
    apiVersion: "qwen3-32b",
    capabilities: ["Reasoning", "Efficient", "Agentic"]
  },
  "grok-3-mini": {
    provider: "XAI",
    name: "Grok 3 Mini",
    description: "Latest version of XAI's Grok 3 Mini with strong reasoning and coding capabilities.",
    apiVersion: "grok-3-mini-latest",
    capabilities: ["Reasoning", "Efficient", "Agentic"]
  },
  "llama4": {
    provider: "Groq",
    name: "Llama 4",
    description: "Latest version of Meta's Llama 4 with good balance of capabilities.",
    apiVersion: "llama-4-scout-17b-16e-instruct",
    capabilities: ["Balanced", "Efficient", "Agentic"]
  },
  "gemini-2.5-pro": {
    provider: "Google",
    name: "Gemini 2.5 Pro",
    description: "Google's state-of-the-art thinking model with advanced reasoning over complex problems in code, math, and STEM.",
    apiVersion: "gemini-2.5-pro",
    capabilities: ["Reasoning", "Analysis", "Coding", "Math", "STEM", "Long Context", "Thinking", "Tools"]
  },
  "gemini-2.5-flash": {
    provider: "Google",
    name: "Gemini 2.5 Flash",
    description: "Google's best price-performance model with thinking capabilities and well-rounded functionality.",
    apiVersion: "gemini-2.5-flash",
    capabilities: ["Reasoning", "Analysis", "Thinking", "Fast", "Efficient", "Tools"]
  },
  "gemini-2.5-flash-lite": {
    provider: "Google",
    name: "Gemini 2.5 Flash Lite",
    description: "Lightweight version of Gemini 2.5 Flash optimized for speed and cost efficiency.",
    apiVersion: "gemini-2.5-flash-lite",
    capabilities: ["Fast", "Efficient", "Analysis", "Tools"]
  }
};

// Update API keys when localStorage changes (for runtime updates)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    // Reload the page if any API key changed to refresh the providers
    if (event.key?.includes('API_KEY')) {
      window.location.reload();
    }
  });
}

export const model = customProvider({
  languageModels,
});

export type modelID = keyof typeof languageModels;

export const MODELS = Object.keys(languageModels);

export const defaultModel: modelID = "gpt-5";
