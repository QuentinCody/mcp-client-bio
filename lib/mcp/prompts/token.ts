import type { SlashPromptDef } from "./types";

// Slash prompt triggers follow `/namespace.segment` format (at least one dot).
// Allow alphanumeric, dot, underscore, and dash segments to align with MCP spec guidance.
export const PROMPT_TRIGGER_RE = /\/([a-z0-9][a-z0-9._-]*\.[a-z0-9][a-z0-9._-]*)/gi;

export type PromptTokenMatch = {
  start: number;
  end: number;
  trigger: string;
};

export function toToken(triggerOrPrompt: string | Pick<SlashPromptDef, "trigger">) {
  const trigger = typeof triggerOrPrompt === "string" ? triggerOrPrompt : triggerOrPrompt.trigger;
  if (!trigger) return "";
  const normalized = trigger.startsWith("/") ? trigger.slice(1) : trigger;
  return `/${normalized}`;
}

export function findTokens(input: string): PromptTokenMatch[] {
  const matches: PromptTokenMatch[] = [];
  for (const m of input.matchAll(PROMPT_TRIGGER_RE)) {
    if (typeof m.index !== "number") continue;
    const trigger = (m[1] || "").trim();
    if (!trigger) continue;
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      trigger,
    });
  }
  return matches;
}
