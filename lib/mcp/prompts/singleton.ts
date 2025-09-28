"use client";
import { PromptRegistry } from "./registry";
import type { SlashPromptDef } from "./types";
import { clientPromptDefs } from "@/lib/slash/client-prompts-defs";

export const promptRegistry = new PromptRegistry();

let loaded = false;
let loading: Promise<void> | null = null;

function normalizeSegment(value: string | undefined | null, fallback: string): string {
  const safe = (value ?? fallback).trim().toLowerCase();
  const normalized = safe
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : fallback;
}

function normalizePrompt(def: SlashPromptDef): SlashPromptDef {
  const baseNamespace = def.namespace || "client";
  const baseName = def.name || "prompt";
  const serverSlug = def.origin === "server-import"
    ? def.sourceServerSlug || normalizeSegment(def.sourceServerName, baseNamespace)
    : undefined;
  const namespaceSegment = def.origin === "server-import"
    ? `mcp.${serverSlug}`
    : normalizeSegment(baseNamespace.replace(/\//g, "."), baseNamespace);
  const nameSegment = normalizeSegment(baseName, baseName);
  const trigger = def.trigger
    ? def.trigger
    : `${namespaceSegment}.${nameSegment}`;

  return {
    ...def,
    trigger,
    sourceServerSlug: serverSlug ?? def.sourceServerSlug,
  };
}

export async function ensurePromptsLoaded(): Promise<void> {
  if (loaded) return;
  if (loading) return loading;
  loading = (async () => {
    try {
      const res = await fetch("/slash-prompts.json", { cache: "no-store" });
      if (!res.ok) return;
      const data: { version: string; prompts: SlashPromptDef[] } = await res.json();
      const normalized = Array.isArray(data.prompts)
        ? data.prompts.map((p) => normalizePrompt(p))
        : [];
      const map = new Map(normalized.map((def) => [def.trigger.toLowerCase(), def] as const));
      for (const prompt of clientPromptDefs.map(normalizePrompt)) {
        map.set(prompt.trigger.toLowerCase(), prompt);
      }
      promptRegistry.load(Array.from(map.values()));
      try {
        const raw = typeof window !== "undefined" ? window.localStorage.getItem("prompt:recent") : null;
        if (raw) {
          const recent: Array<{ id: string; ts: number }> = JSON.parse(raw);
          for (const entry of recent) {
            if (!entry || typeof entry.id !== "string") continue;
            promptRegistry.markUsed(entry.id, typeof entry.ts === "number" ? entry.ts : undefined);
          }
        }
      } catch {
        // ignore localStorage hydration issues
      }
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
