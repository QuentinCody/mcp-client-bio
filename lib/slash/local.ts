import { slashRegistry } from "./registry";
import type { SlashCommandMeta } from "./types";
import { getSlashRuntimeActions, getSlashRuntimeServers } from "./runtime";
import type { SlashRuntimeServer, SlashServerStatus, SlashRuntimePrompt, SlashRuntimeTool } from "./runtime";

function textStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function formatStatus(status: SlashServerStatus): string {
  switch (status) {
    case "connected":
      return "ok";
    case "connecting":
      return "pending";
    case "error":
      return "error";
    case "disconnected":
      return "offline";
    default:
      return "unknown";
  }
}

function resolveServerLabel(server: SlashRuntimeServer): string {
  const base = server.name?.trim() || server.url;
  return base.length > 0 ? base : server.id;
}

function formatPrompt(prompt: SlashRuntimePrompt): string {
  const label = prompt.title?.trim() || prompt.name;
  if (prompt.description) {
    return `${label} — ${prompt.description}`;
  }
  return label;
}

function formatTool(tool: SlashRuntimeTool): string {
  return tool.description ? `${tool.name} — ${tool.description}` : tool.name;
}

function buildHelpText(): string {
  const commands = slashRegistry
    .getAll()
    .filter((cmd) => cmd.kind === "local")
    .sort((a, b) => a.name.localeCompare(b.name));

  const lines: string[] = ["Built-in slash commands:"];
  for (const command of commands) {
    const description = command.description ? ` — ${command.description}` : "";
    lines.push(`/${command.name}${description}`);
  }

  const servers = getSlashRuntimeServers();
  const promptCount = servers.reduce((total, server) => total + (server.prompts?.length ?? 0), 0);
  if (promptCount > 0) {
    lines.push("", `Discovered ${promptCount} MCP prompts. Use /prompts to browse them.`);
  }

  if (lines.length === 1) {
    lines.push("No local slash commands registered yet.");
  }

  return lines.join("\n");
}

function buildServersText(): string {
  const servers = getSlashRuntimeServers();
  if (servers.length === 0) {
    return "No MCP servers configured. Use /connect to add one.";
  }

  const lines: string[] = ["MCP server status:"];
  for (const server of servers) {
    const statusLabel = formatStatus(server.status);
    const activeLabel = server.active ? " (active)" : "";
    const promptCount = server.prompts?.length ?? 0;
    const toolCount = server.tools?.length ?? 0;
    const extras: string[] = [];
    if (promptCount > 0) extras.push(`${promptCount} prompts`);
    if (toolCount > 0) extras.push(`${toolCount} tools`);
    if (server.errorMessage) extras.push(`error: ${server.errorMessage}`);
    const summary = extras.length > 0 ? ` — ${extras.join(", ")}` : "";
    lines.push(`- [${statusLabel}] ${resolveServerLabel(server)} (${server.type.toUpperCase()})${activeLabel}${summary}`);
  }
  return lines.join("\n");
}

function pluralize(label: string, count: number): string {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function buildToolsText(): string {
  const servers = getSlashRuntimeServers();
  if (servers.length === 0) {
    return "No MCP servers configured. Use /connect to add one.";
  }

  const lines: string[] = ["MCP tools by server:"];
  let listedToolCount = 0;

  for (const server of servers) {
    const statusLabel = formatStatus(server.status);
    const tools = server.tools ?? [];
    const hasTools = tools.length > 0;
    const label = resolveServerLabel(server);
    const base = `- [${statusLabel}] ${label} (${server.type.toUpperCase()})`;

    if (!hasTools) {
      if (server.status === "connected") {
        const reason = server.errorMessage
          ? `error: ${server.errorMessage}`
          : "no tools reported";
        lines.push(`${base} — ${reason}. Try reconnecting via /connect.`);
      } else if (server.status === "error") {
        lines.push(`${base} — last error: ${server.errorMessage ?? "unknown"}. Fix the server, then /connect.`);
      } else {
        lines.push(`${base} — connect with /connect to load tools.`);
      }
      continue;
    }

    listedToolCount += tools.length;
    lines.push(`${base} — ${pluralize("tool", tools.length)} available:`);
    const limited = tools.slice(0, 12);
    for (const tool of limited) {
      lines.push(`  • ${formatTool(tool)}`);
    }
    if (tools.length > limited.length) {
      lines.push(`  • … ${tools.length - limited.length} more`);
    }
  }

  if (listedToolCount === 0) {
    lines.push("", "No servers have reported tools yet. Connect or restart a server, then retry /tools.");
  }

  return lines.join("\n");
}

function buildPromptsText(): string {
  const servers = getSlashRuntimeServers();
  const sections: string[] = [];

  for (const server of servers) {
    const prompts = server.prompts ?? [];
    if (prompts.length === 0) continue;
    sections.push(`${resolveServerLabel(server)} prompts:`);
    const limited = prompts.slice(0, 10);
    for (const prompt of limited) {
      const trigger = prompt.trigger ?? prompt.name;
      sections.push(`  • /${trigger} — ${formatPrompt(prompt)}`);
    }
    if (prompts.length > limited.length) {
      sections.push(`  • … ${prompts.length - limited.length} more`);
    }
  }

  if (sections.length === 0) {
    return "No MCP prompts loaded yet. Ensure your connected servers support prompts.";
  }

  return sections.join("\n");
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
      run: async () => textStream(buildHelpText()),
    },
    {
      id: "local/connect",
      name: "connect",
      title: "Connect MCP Server",
      description: "Open the MCP server connection dialog",
      kind: "local",
      sourceId: "local",
      run: async () => {
        const { openServerManager } = getSlashRuntimeActions();
        if (typeof openServerManager === "function") {
          openServerManager();
          return textStream("Opening the MCP server manager…");
        }
        return textStream("Use the server panel in the sidebar to connect a Model Context Protocol server.");
      },
    },
    {
      id: "local/servers",
      name: "servers",
      title: "List Servers",
      description: "Summarize connected MCP servers",
      kind: "local",
      sourceId: "local",
      run: async () => textStream(buildServersText()),
    },
    {
      id: "local/tools",
      name: "tools",
      title: "List Tools",
      description: "Show registered MCP tools",
      kind: "local",
      sourceId: "local",
      run: async () => textStream(buildToolsText()),
    },
    {
      id: "local/prompts",
      name: "prompts",
      title: "List Prompts",
      description: "Show discovered MCP server prompts",
      kind: "local",
      sourceId: "local",
      run: async () => textStream(buildPromptsText()),
    },
    {
      id: "local/clear",
      name: "clear",
      title: "Clear Chat",
      description: "Clear the current conversation",
      kind: "local",
      sourceId: "local",
      run: async () => {
        const { clearChat } = getSlashRuntimeActions();
        if (typeof clearChat === "function") {
          const result = clearChat();
          if (result && typeof result === "object" && "cleared" in result) {
            const clearedResult = result as { cleared: boolean; message?: string };
            if (!clearedResult.cleared) {
              return textStream(clearedResult.message ?? "Conversation is already empty.");
            }
            return textStream(clearedResult.message ?? "Cleared the current conversation.");
          }
          return textStream("Cleared the current conversation.");
        }
        return textStream("Unable to clear the chat from this view.");
      },
    },
  ];

  for (const command of commands) {
    register(command);
  }
}

// Register immediately for now since registry is a singleton
registerCoreLocalCommands();
