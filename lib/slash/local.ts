import { slashRegistry } from "./registry";
import type { SlashCommandMeta } from "./types";

function textStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function register(command: SlashCommandMeta) {
  slashRegistry.registerLocal(command);
}

export function registerCoreLocalCommands() {
  const commands: SlashCommandMeta[] = [
    {
      id: "local/help",
      name: "help",
      title: "Help",
      description: "Show available slash commands",
      kind: "local",
      sourceId: "local",
      run: async () => textStream("Available commands: /help, /connect, /servers, /tools, /prompts, /clear"),
    },
    {
      id: "local/connect",
      name: "connect",
      title: "Connect MCP Server",
      description: "Open the MCP server connection dialog",
      kind: "local",
      sourceId: "local",
      run: async () => textStream("Use the server panel to connect a Model Context Protocol server."),
    },
    {
      id: "local/servers",
      name: "servers",
      title: "List Servers",
      description: "Summarize connected MCP servers",
      kind: "local",
      sourceId: "local",
      run: async () => textStream("Listing connected MCP servers is not yet implemented."),
    },
    {
      id: "local/tools",
      name: "tools",
      title: "List Tools",
      description: "Show registered MCP tools",
      kind: "local",
      sourceId: "local",
      run: async () => textStream("Tool inspection will be implemented in a later step."),
    },
    {
      id: "local/prompts",
      name: "prompts",
      title: "List Prompts",
      description: "Show discovered MCP server prompts",
      kind: "local",
      sourceId: "local",
      run: async () => textStream("Prompt discovery not yet wired to slash commands."),
    },
    {
      id: "local/clear",
      name: "clear",
      title: "Clear Chat",
      description: "Clear the current conversation",
      kind: "local",
      sourceId: "local",
      run: async () => textStream("Clearing chat is not yet connected."),
    },
  ];

  for (const command of commands) {
    register(command);
  }
}

// Register immediately for now since registry is a singleton
registerCoreLocalCommands();

