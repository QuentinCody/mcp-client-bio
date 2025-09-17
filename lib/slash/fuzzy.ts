import Fuse from "fuse.js";
import type { SlashCommandMeta } from "./types";

export interface SlashFuzzyResult {
  command: SlashCommandMeta;
  score: number;
}

function normalizeScore(score: number | undefined) {
  if (typeof score !== "number") return 0;
  const clamped = Math.max(0, Math.min(score, 1));
  return 1 - clamped; // invert so higher is better
}

export class SlashFuzzyIndex {
  private fuse: Fuse<SlashCommandMeta> | null = null;
  private commands: SlashCommandMeta[] = [];

  setCommands(commands: SlashCommandMeta[]) {
    this.commands = commands.slice();
    this.fuse = new Fuse(this.commands, {
      includeScore: true,
      threshold: 0.35,
      ignoreLocation: true,
      keys: [
        { name: "name", weight: 0.6 },
        { name: "title", weight: 0.25 },
        { name: "description", weight: 0.1 },
        { name: "sourceId", weight: 0.05 },
      ],
    });
  }

  search(query: string, opts?: { recent?: Map<string, number> }): SlashFuzzyResult[] {
    if (!query.trim()) {
      const list = this.commands.slice();
      const recent = opts?.recent;
      if (recent && recent.size) {
        list.sort((a, b) => {
          const at = recent.get(a.id) || 0;
          const bt = recent.get(b.id) || 0;
          if (at === bt) return a.name.localeCompare(b.name);
          return bt - at;
        });
        return list.map((command, index) => ({ command, score: recent?.get(command.id) ? 1.5 - index * 0.01 : 1 - index * 0.01 }));
      }
      list.sort((a, b) => a.name.localeCompare(b.name));
      return list.map((command, index) => ({ command, score: 1 - index * 0.01 }));
    }

    if (!this.fuse) {
      this.setCommands(this.commands);
    }
    const fuse = this.fuse!;
    const recent = opts?.recent || new Map<string, number>();
    const now = Date.now();
    return fuse.search(query).map(({ item, score }) => {
      const base = normalizeScore(score);
      const lastUsed = recent.get(item.id);
      let boosted = base;
      if (lastUsed) {
        const ageMs = Math.max(1, now - lastUsed);
        const recencyWeight = Math.min(0.2, 600000 / ageMs); // decay after 10 minutes
        boosted += recencyWeight;
      }
      return { command: item, score: boosted };
    }).sort((a, b) => b.score - a.score);
  }
}

