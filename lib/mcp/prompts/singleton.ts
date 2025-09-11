"use client";
import { PromptRegistry } from "./registry";
import type { SlashPromptDef } from "./types";

export const promptRegistry = new PromptRegistry();

let loaded = false;
let loading: Promise<void> | null = null;

export async function ensurePromptsLoaded(): Promise<void> {
  if (loaded) return;
  if (loading) return loading;
  loading = (async () => {
    try {
      const res = await fetch("/slash-prompts.json", { cache: "no-store" });
      if (!res.ok) return;
      const data: { version: string; prompts: SlashPromptDef[] } = await res.json();
      promptRegistry.load(data.prompts || []);
      loaded = true;
    } catch {
      // ignore load failures; menu will simply be empty
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export function isPromptsLoaded() {
  return loaded;
}

