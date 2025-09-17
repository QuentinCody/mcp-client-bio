import type { SlashPromptDef } from "./types";

export class PromptRegistry {
  private prompts: SlashPromptDef[] = [];
  private byId = new Map<string, SlashPromptDef>();
  private byTrigger = new Map<string, SlashPromptDef>();

  load(defs: SlashPromptDef[]) {
    this.prompts = defs.slice();
    this.byId.clear();
    this.byTrigger.clear();
    for (const d of defs) {
      this.byId.set(d.id, d);
      if (d.trigger) this.byTrigger.set(d.trigger.toLowerCase(), d);
    }
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

  search(q: string) {
    const s = q.trim().toLowerCase();
    if (!s) return this.getAll();
    return this.prompts.filter(
      (p) =>
        p.title?.toLowerCase().includes(s) ||
        p.name.toLowerCase().includes(s) ||
        p.namespace.toLowerCase().includes(s) ||
        p.trigger.toLowerCase().includes(s) ||
        p.description?.toLowerCase().includes(s)
    );
  }
}
