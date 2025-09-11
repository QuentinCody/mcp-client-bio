import { SlashPromptDef } from "./types";
import { renderTemplate } from "./template";

export type RenderedMsg = { role: "user" | "assistant"; content: string } | { role: "system"; content: string };

export function renderPrompt(def: SlashPromptDef, args: Record<string, string>): RenderedMsg[] {
  if (def.mode !== "template" || !def.template) throw new Error("Prompt not templated");
  return def.template.messages.map((m) => ({
    role: m.role,
    content: renderTemplate(m.text, args),
  }));
}

