export type SlashCommandKind = "local" | "mcp-prompt";

export interface SlashCommandArg {
  name: string;
  description?: string;
  required?: boolean;
}

export interface SlashCommandRunInput {
  args: string[] | Record<string, string>;
  signal: AbortSignal;
}

import type { SlashPromptDef } from "@/lib/mcp/prompts/types";

export interface SlashCommandMeta {
  id: string;
  name: string;
  title?: string;
  description?: string;
  kind: SlashCommandKind;
  sourceId?: string;
  arguments?: SlashCommandArg[];
  prompt?: SlashPromptDef;
  run(input: SlashCommandRunInput): Promise<ReadableStream<Uint8Array> | unknown>;
}

export interface SlashCommandSuggestion extends SlashCommandMeta {
  score: number;
  groupId: string;
}

export type SlashCommandGroup = "local" | "mcp";
