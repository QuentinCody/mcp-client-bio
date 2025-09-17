import { SlashFuzzyIndex } from "./fuzzy";
import type { SlashCommandMeta, SlashCommandSuggestion } from "./types";

export type SlashRegistryListener = (commands: SlashCommandMeta[]) => void;

export class SlashCommandRegistry {
  private locals = new Map<string, SlashCommandMeta>();
  private mcpByServer = new Map<string, Map<string, SlashCommandMeta>>();
  private byName = new Map<string, SlashCommandMeta>();
  private byId = new Map<string, SlashCommandMeta>();
  private index = new SlashFuzzyIndex();
  private listeners = new Set<SlashRegistryListener>();
  private usage = new Map<string, number>();

  constructor(initial?: SlashCommandMeta[]) {
    if (initial?.length) {
      for (const cmd of initial) {
        if (cmd.kind === "local") {
          this.locals.set(cmd.id, cmd);
        } else {
          const bucket = this.mcpByServer.get(cmd.sourceId || "mcp") || new Map();
          bucket.set(cmd.id, cmd);
          this.mcpByServer.set(cmd.sourceId || "mcp", bucket);
        }
      }
      this.rebuildIndex();
    }
  }

  registerLocal(command: SlashCommandMeta) {
    this.locals.set(command.id, command);
    this.rebuildIndex();
  }

  registerLocalMany(commands: SlashCommandMeta[]) {
    let dirty = false;
    for (const cmd of commands) {
      if (cmd.kind !== "local") continue;
      this.locals.set(cmd.id, cmd);
      dirty = true;
    }
    if (dirty) this.rebuildIndex();
  }

  registerMcpPrompt(serverId: string, command: SlashCommandMeta) {
    if (command.kind !== "mcp-prompt") {
      throw new Error(`MCP prompt must have kind "mcp-prompt" (got ${command.kind})`);
    }
    const bucket = this.mcpByServer.get(serverId) ?? new Map<string, SlashCommandMeta>();
    bucket.set(command.id, command);
    this.mcpByServer.set(serverId, bucket);
    this.rebuildIndex();
  }

  removeMcpPrompt(serverId: string, commandId: string) {
    const bucket = this.mcpByServer.get(serverId);
    if (!bucket) return;
    bucket.delete(commandId);
    if (bucket.size === 0) {
      this.mcpByServer.delete(serverId);
    }
    this.rebuildIndex();
  }

  clearServer(serverId: string) {
    if (!this.mcpByServer.has(serverId)) return;
    this.mcpByServer.delete(serverId);
    this.rebuildIndex();
  }

  list(query: string): SlashCommandSuggestion[] {
    const results = this.index.search(query, { recent: this.usage });
    return results.map(({ command, score }) => ({
      ...command,
      score,
      groupId: command.kind === "local" ? "local" : "mcp",
    }));
  }

  getAll(): SlashCommandMeta[] {
    return Array.from(this.byName.values());
  }

  getByName(name: string): SlashCommandMeta | undefined {
    return this.byName.get(name.toLowerCase());
  }

  getById(id: string): SlashCommandMeta | undefined {
    return this.byId.get(id);
  }

  markUsed(id: string) {
    this.usage.set(id, Date.now());
  }

  listen(listener: SlashRegistryListener) {
    this.listeners.add(listener);
    listener(this.getOrderedCommands());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private getOrderedCommands(): SlashCommandMeta[] {
    const commands: SlashCommandMeta[] = [];
    for (const cmd of this.locals.values()) commands.push(cmd);
    for (const bucket of this.mcpByServer.values()) {
      for (const cmd of bucket.values()) commands.push(cmd);
    }
    commands.sort((a, b) => a.name.localeCompare(b.name));
    return commands;
  }

  private rebuildIndex() {
    const commands = this.getOrderedCommands();
    this.byName.clear();
    this.byId.clear();
    for (const cmd of commands) {
      this.byName.set(cmd.name.toLowerCase(), cmd);
      this.byId.set(cmd.id, cmd);
    }
    this.index.setCommands(commands);
    for (const listener of this.listeners) {
      try {
        listener(commands);
      } catch (err) {
        console.error("Slash registry listener error", err);
      }
    }
  }
}

export const slashRegistry = new SlashCommandRegistry();
