import type { SlashPromptDef } from "./types";

export class PromptRegistry {
  private prompts: SlashPromptDef[] = [];
  private byId = new Map<string, SlashPromptDef>();

  load(defs: SlashPromptDef[]) {
    this.prompts = defs.slice();
    this.byId.clear();
    for (const d of defs) this.byId.set(d.id, d);
  }

  getAll() {
    return this.prompts.slice();
  }

  getByNamespaceName(namespace: string, name: string) {
    return this.byId.get(`${namespace}/${name}`) || null;
  }

  search(q: string) {
    const s = q.trim().toLowerCase();
    if (!s) return this.getAll();
    return this.prompts.filter(
      (p) =>
        p.title?.toLowerCase().includes(s) ||
        p.name.toLowerCase().includes(s) ||
        p.namespace.toLowerCase().includes(s) ||
        p.description?.toLowerCase().includes(s)
    );
  }
}

