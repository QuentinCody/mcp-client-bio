import Fuse from "fuse.js";
import type { SlashPromptDef } from "./types";

export interface PromptSearchResult {
  prompt: SlashPromptDef;
  score: number;
}

export class PromptRegistry {
  private prompts: SlashPromptDef[] = [];
  private byId = new Map<string, SlashPromptDef>();
  private byTrigger = new Map<string, SlashPromptDef>();
  private usage = new Map<string, number>();
  private fuse: Fuse<SlashPromptDef> | null = null;

  load(defs: SlashPromptDef[]) {
    this.prompts = defs.slice();
    this.byId.clear();
    this.byTrigger.clear();
    for (const d of defs) {
      this.byId.set(d.id, d);
      if (d.trigger) this.byTrigger.set(d.trigger.toLowerCase(), d);
    }
    const validIds = new Set(defs.map((d) => d.id));
    this.usage = new Map(
      Array.from(this.usage.entries()).filter(([id]) => validIds.has(id))
    );
    this.rebuildIndex();
  }

  getAll() {
    return this.prompts.slice();
  }

  getById(id: string) {
    return this.byId.get(id) || null;
  }

  getByTrigger(trigger: string) {
    return this.byTrigger.get(trigger.toLowerCase()) || null;
  }

  markUsed(id: string, timestamp?: number) {
    const ts = typeof timestamp === "number" ? timestamp : Date.now();
    this.usage.set(id, ts);
  }

  getUsageSnapshot() {
    return new Map(this.usage);
  }

  search(q: string, opts?: { limit?: number; recentBias?: Map<string, number> }) {
    return this.searchDetailed(q, opts).map((entry) => entry.prompt);
  }

  searchDetailed(q: string, opts?: { limit?: number; recentBias?: Map<string, number> }): PromptSearchResult[] {
    const recent = opts?.recentBias ?? this.usage;
    const now = Date.now();
    const limit = opts?.limit;
    const query = q.trim();

    if (!query) {
      const list = this.prompts.slice();
      if (recent.size) {
        list.sort((a, b) => {
          const at = recent.get(a.id) ?? 0;
          const bt = recent.get(b.id) ?? 0;
          if (at === bt) return a.trigger.localeCompare(b.trigger);
          return bt - at;
        });
      } else {
        list.sort((a, b) => a.trigger.localeCompare(b.trigger));
      }
      const mapped = list.map((prompt, index) => ({
        prompt,
        score: 1 - index * 0.01,
      }));
      return typeof limit === "number" ? mapped.slice(0, limit) : mapped;
    }

    const fuse = this.ensureIndex();
    const results = fuse.search(query).map(({ item, score }) => {
      const base = typeof score === "number" ? 1 - Math.min(1, Math.max(0, score)) : 1;
      const lastUsed = recent.get(item.id);
      let adjusted = base;
      if (lastUsed) {
        const ageMs = Math.max(1, now - lastUsed);
        const recencyBoost = Math.min(0.25, 600000 / ageMs);
        adjusted += recencyBoost;
      }
      return { prompt: item, score: adjusted };
    });
    results.sort((a, b) => b.score - a.score);
    return typeof limit === "number" ? results.slice(0, limit) : results;
  }

  private ensureIndex() {
    if (!this.fuse) {
      this.rebuildIndex();
    }
    return this.fuse!;
  }

  private rebuildIndex() {
    this.fuse = new Fuse(this.prompts, {
      includeScore: true,
      threshold: 0.35,
      ignoreLocation: true,
      keys: [
        { name: "trigger", weight: 0.4 },
        { name: "title", weight: 0.25 },
        { name: "description", weight: 0.15 },
        { name: "namespace", weight: 0.1 },
        { name: "sourceServerName", weight: 0.1 },
      ],
    });
  }
}
