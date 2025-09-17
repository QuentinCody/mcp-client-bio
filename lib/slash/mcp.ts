import type { SlashCommandMeta } from "./types";
import type { SlashPromptDef } from "@/lib/mcp/prompts/types";

export function promptToSlashCommand(serverId: string, prompt: SlashPromptDef): SlashCommandMeta {
  return {
    id: `mcp:${serverId}:${prompt.id}`,
    name: prompt.name,
    title: prompt.title,
    description: prompt.description,
    kind: "mcp-prompt",
    sourceId: serverId,
    arguments: prompt.args?.map((arg) => ({
      name: arg.name,
      description: arg.description,
      required: arg.required,
    })),
    async run() {
      throw new Error(`Prompt execution for ${prompt.name} is not yet implemented.`);
    },
  };
}
