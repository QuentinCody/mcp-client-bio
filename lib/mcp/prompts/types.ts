export type PromptArg = {
  name: string;
  description?: string;
  required?: boolean;
  placeholder?: string;
  // future: type?: "string" | "number" | "enum"; options?: string[];
};

export type SlashPromptMode = "template" | "server" | "template-required";

export type SlashPromptMessage = {
  role: "system" | "user" | "assistant";
  text: string;
};

export type SlashPromptDef = {
  id: string; // unique slug: "<namespace>/<name>"
  namespace: string; // e.g., "client", "<server>-import"
  name: string; // e.g., "summarize_variant"
  title: string; // display title
  description?: string;
  origin: "client" | "server-import";
  sourceServerId?: string; // when origin === "server-import"
  version?: string;
  updatedAt?: string; // ISO
  mode: SlashPromptMode;
  args?: PromptArg[];
  template?: {
    messages: SlashPromptMessage[];
  };
};

