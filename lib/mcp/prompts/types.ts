export type PromptArg = {
  name: string;
  description?: string;
  required?: boolean;
  placeholder?: string;
  // future: type?: "string" | "number" | "enum"; options?: string[];
};

export type SlashPromptMode = "template" | "server" | "template-required" | "command" | "client";

export type SlashPromptMessage = {
  role: "system" | "user" | "assistant";
  text: string;
};

export type SlashPromptDef = {
  id: string; // unique slug: "<namespace>/<name>"
  /**
   * The slash-command trigger that users type after the leading slash. Example: "mcp.genomics.summary".
   * This should remain stable so tokens in existing chat drafts keep resolving.
   */
  trigger: string;
  namespace: string; // e.g., "client", "<server>-import"
  name: string; // e.g., "summarize_variant"
  title: string; // display title
  description?: string;
  origin: "client" | "server-import" | "client-prompt";
  sourceServerId?: string; // when origin === "server-import"
  version?: string;
  updatedAt?: string; // ISO
  mode: SlashPromptMode;
  args?: PromptArg[];
  template?: {
    messages: SlashPromptMessage[];
  };
  commandMetaId?: string;
  /**
   * Optional metadata describing which MCP server provided this prompt.
   * Used for grouping, telemetry, and completions.
   */
  sourceServerName?: string;
  /**
   * Normalized slug (safe for command usage) for the originating server.
   * Populated for server-origin prompts so UI can build `/mcp.<server>.*` entries quickly.
   */
  sourceServerSlug?: string;
};
