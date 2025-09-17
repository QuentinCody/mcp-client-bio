"use client";

import { createContext, useContext, useRef, useEffect, useCallback, useState } from "react";
import mcpServersConfig from "@/config/mcp-servers.json";
import { useLocalStorage } from "@/lib/hooks/use-local-storage";
import { isServerLocked } from "@/lib/utils";
import { ensurePromptsLoaded, isPromptsLoaded, promptRegistry } from "@/lib/mcp/prompts/singleton";
import type { SlashPromptDef } from "@/lib/mcp/prompts/types";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export interface KeyValuePair {
  key: string;
  value: string;
}

export type ServerStatus =
  | "connected"
  | "connecting"
  | "disconnected"
  | "error";

// Define storage keys as constants
const STORAGE_KEYS = {
  MCP_SERVERS: "mcp-servers",
  SELECTED_MCP_SERVERS: "selected-mcp-servers",
} as const;

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: any;
}

export interface MCPPromptArg {
  name: string;
  description?: string;
  required?: boolean;
}

export interface MCPPromptDef {
  name: string;
  title?: string;
  description?: string;
  arguments?: MCPPromptArg[];
}

export interface MCPServer {
  id: string;
  name: string;
  url: string;
  type: "sse" | "http";
  command?: string;
  args?: string[];
  env?: KeyValuePair[];
  headers?: KeyValuePair[];
  description?: string;
  status?: ServerStatus;
  errorMessage?: string;
  tools?: MCPTool[];
  prompts?: MCPPromptDef[];
  capabilities?: {
    prompts?: { listChanged?: boolean } | null;
    completions?: boolean;
  };
  instructions?: string;
}

export interface MCPServerApi {
  type: "sse" | "http";
  url: string;
  headers?: KeyValuePair[];
}

interface MCPContextType {
  mcpServers: MCPServer[];
  setMcpServers: (servers: MCPServer[]) => void;
  selectedMcpServers: string[];
  setSelectedMcpServers: (serverIds: string[]) => void;
  mcpServersForApi: MCPServerApi[];
  startServer: (serverId: string) => Promise<boolean>;
  stopServer: (serverId: string) => Promise<boolean>;
  updateServerStatus: (
    serverId: string,
    status: ServerStatus,
    errorMessage?: string
  ) => void;
  getActiveServersForApi: () => MCPServerApi[];
  fetchPromptMessages: (
    serverId: string,
    promptName: string,
    args: Record<string, string>
  ) => Promise<{ messages: PromptMessage[]; description?: string } | null>;
  completePromptArgument: (input: {
    serverId: string;
    promptName: string;
    argumentName: string;
    value: string;
    contextArgs: Record<string, string>;
  }) => Promise<{ values: string[]; hasMore?: boolean; total?: number } | null>;
  getPromptClient: (serverId: string) => Promise<Client | null>;
  ensureAllPromptsLoaded: (options?: { force?: boolean }) => Promise<void>;
}

type MCPPromptContent = { type: string; [key: string]: any };
export type PromptMessage = {
  role: string;
  content?: MCPPromptContent[];
};

const MCPContext = createContext<MCPContextType | undefined>(undefined);

function normalizeSlug(value: string | undefined | null, fallback: string): string {
  const base = (value ?? fallback).toString().trim().toLowerCase();
  const sanitized = base
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const fallbackSanitized = fallback
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const candidate = sanitized.length > 0 ? sanitized : fallbackSanitized;
  return candidate.length > 0 ? candidate : "entry";
}

function getServerSlug(server: MCPServer): string {
  let host = "";
  try {
    host = new URL(server.url).hostname;
  } catch {
    host = "";
  }
  return normalizeSlug(server.name || host || server.id, server.id || "server");
}

function getPromptSegments(server: MCPServer, prompt: MCPPromptDef) {
  const serverSlug = getServerSlug(server);
  const promptSlug = normalizeSlug(prompt.name, `prompt-${serverSlug}`);
  const namespace = `mcp.${serverSlug}`;
  const trigger = `${namespace}.${promptSlug}`;
  return { serverSlug, promptSlug, namespace, trigger };
}

function headerPairsToRecord(headers?: KeyValuePair[] | null): Record<string, string> {
  if (!headers) return {};
  const record: Record<string, string> = {};
  for (const header of headers) {
    if (!header?.key) continue;
    record[header.key] = header.value ?? "";
  }
  return record;
}

// Helper function to check server health with aggressive timeout
async function checkServerHealth(
  url: string,
  headers?: KeyValuePair[],
  timeoutMs: number = 8000, // allow more time for cold starts
  preferredType?: 'sse' | 'http'
): Promise<{ ready: boolean; tools?: MCPTool[]; prompts?: MCPPromptDef[]; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('/api/mcp-health', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, headers, preferredType }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const result = await response.json();
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    const errorMessage = controller.signal.aborted 
      ? `Connection timeout (${timeoutMs}ms)` 
      : error instanceof Error ? error.message : 'Unknown error';
    
  // suppress logging to reduce noise
    return {
      ready: false,
      error: errorMessage
    };
  }
}

export function MCPProvider({ children }: { children: React.ReactNode }) {
  const [mcpServers, setMcpServersInternal] = useLocalStorage<MCPServer[]>(
    STORAGE_KEYS.MCP_SERVERS,
    []
  );
  // Bootstrap from config only once (when no servers stored)
  const [bootstrapped, setBootstrapped] = useState(false);
  useEffect(() => {
    if (bootstrapped) return;
    try {
      const preset = (mcpServersConfig as any).servers || [];
      if (!preset.length) {
        setBootstrapped(true);
        return;
      }

      // Always derive config servers (stable) so production picks up new additions.
      const configServers: MCPServer[] = preset.map((server: any, index: number) => ({
        id: `config-${index}`,
        name: server.name,
        type: server.type === 'streamable-http' || server.type === 'http' ? 'http' : 'sse',
        url: server.url,
        headers: [],
        description: server.description,
        status: 'disconnected'
      }));

      if (mcpServers.length === 0) {
        // Fresh load: just use config servers
        setMcpServersInternal(configServers);
        setSelectedMcpServersInternal(configServers.map(s => s.id));
      } else {
        // Merge: add any config server whose URL is not already present
        const existingUrls = new Set(mcpServers.map(s => s.url));
        const newOnes = configServers.filter(s => !existingUrls.has(s.url));
        if (newOnes.length > 0) {
          setMcpServersInternal(current => [...current, ...newOnes]);
          setSelectedMcpServersInternal(current => [...current, ...newOnes.map(s => s.id)]);
        }
      }

      // Optional lock via env (does NOT control which servers appear; list is ONLY from JSON)
      if (process.env.MCP_LOCK_SERVERS === '1') {
        localStorage.setItem('mcp:locked', '1');
      }
    } catch (err) {
      console.error('[MCPProvider] Failed to process config servers:', err);
    } finally {
      setBootstrapped(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapped, mcpServers]);

  const [selectedMcpServers, setSelectedMcpServersInternal] = useLocalStorage<string[]>(
    STORAGE_KEYS.SELECTED_MCP_SERVERS,
    []
  );

  // Wrapper function that checks lock status before allowing changes
  const setMcpServers = (servers: MCPServer[] | ((prev: MCPServer[]) => MCPServer[])) => {
    if (isServerLocked()) {
      console.warn("Cannot modify MCP servers - demo is locked to preset servers");
      return;
    }
    setMcpServersInternal(servers);
  };

  // Wrapper function that checks lock status before allowing changes
  const setSelectedMcpServers = (serverIds: string[] | ((prev: string[]) => string[])) => {
    if (isServerLocked()) {
      console.warn("Cannot modify selected MCP servers - demo is locked to preset servers");
      return;
    }
    setSelectedMcpServersInternal(serverIds);
  };

  // Create a ref to track active servers and avoid unnecessary re-renders
  const activeServersRef = useRef<Record<string, boolean>>({});
  const promptSubscriptionsRef = useRef(new Map<string, () => Promise<void> | void>());
  const loadingPromptsRef = useRef(new Set<string>());
  const clientPromisesRef = useRef(new Map<string, Promise<Client | null>>());
  const clientInstancesRef = useRef(new Map<string, Client>());
  const promptFailureRef = useRef(new Set<string>());
  const healthFailureRef = useRef(new Set<string>());
  const promptsLoadedRef = useRef(new Set<string>());

  // Helper to get a server by ID
  const getServerById = useCallback((serverId: string): MCPServer | undefined => {
    return mcpServers.find((server) => server.id === serverId);
  }, [mcpServers]);

  // Update server status
  const updateServerStatus = useCallback((
    serverId: string,
    status: ServerStatus,
    errorMessage?: string
  ) => {
    setMcpServersInternal((currentServers) =>
      currentServers.map((server) =>
        server.id === serverId
          ? { ...server, status, errorMessage: errorMessage || undefined }
          : server
      )
    );
  }, [setMcpServersInternal]);

  // Update server with tools
  const updateServerWithTools = useCallback((
    serverId: string,
    tools: MCPTool[],
    status: ServerStatus = "connected",
    prompts?: MCPPromptDef[],
    capabilities?: MCPServer["capabilities"]
  ) => {
    setMcpServersInternal((currentServers) =>
      currentServers.map((server) =>
        server.id === serverId
          ? { ...server, tools, prompts, status, capabilities: capabilities ?? server.capabilities, errorMessage: undefined }
          : server
      )
    );
  }, [setMcpServersInternal]);

  const getOrCreateClient = useCallback(async (server: MCPServer): Promise<Client | null> => {
    if (!server || !server.url) return null;
    if (clientInstancesRef.current.has(server.id)) {
      return clientInstancesRef.current.get(server.id)!;
    }
    const existing = clientPromisesRef.current.get(server.id);
    if (existing) return existing;

    const connectPromise = (async () => {
      try {
        const client = new Client({ name: 'bio-mcp-client', version: '0.2.0' });
        const baseUrl = new URL(server.url);
        const headers = headerPairsToRecord(server.headers);
        if (server.type === 'http') {
          const transport = new StreamableHTTPClientTransport(baseUrl, {
            requestInit: { headers, credentials: 'include', mode: 'cors' },
            reconnectionOptions: {
              initialReconnectionDelay: 1000,
              reconnectionDelayGrowFactor: 1.5,
              maxReconnectionDelay: 15000,
              maxRetries: 4,
            },
          });
          await client.connect(transport);
        } else {
          const transport = new SSEClientTransport(baseUrl, {
            requestInit: { headers },
          });
          await client.connect(transport);
        }

        const capabilities = client.getServerCapabilities();
        const instructions = client.getInstructions();
        setMcpServersInternal((current) =>
          current.map((s) =>
            s.id === server.id
              ? {
                  ...s,
                  capabilities: {
                    prompts: capabilities?.prompts ?? null,
                    completions: !!capabilities?.completions,
                  },
                  instructions: instructions ?? (s as any).instructions,
                }
              : s
          )
        );

        client.onclose = () => {
          clientInstancesRef.current.delete(server.id);
          clientPromisesRef.current.delete(server.id);
        };

        clientInstancesRef.current.set(server.id, client);
        return client;
      } catch (error) {
        console.warn(`[MCP] Client connection failed for ${server.name || server.url}:`, error);
        clientPromisesRef.current.delete(server.id);
        return null;
      }
    })();

    clientPromisesRef.current.set(server.id, connectPromise);
    return connectPromise;
  }, [setMcpServersInternal]);

  const fetchServerPrompts = useCallback(async (serverId: string, options?: { force?: boolean }) => {
    if (!options?.force) {
      if (promptsLoadedRef.current.has(serverId)) return;
      if (promptFailureRef.current.has(serverId)) return;
    }
    if (loadingPromptsRef.current.has(serverId)) return;
    const server = getServerById(serverId);
    if (!server) return;
    loadingPromptsRef.current.add(serverId);
    try {
      const client = await getOrCreateClient(server);
      if (!client) {
        if (server.type === 'sse') {
          // Fallback to API-based listing for SSE transports when direct connection fails in browser.
          let cursor: string | null = null;
          const collected: MCPPromptDef[] = [];
          do {
            const response = await fetch('/api/mcp-prompts/list', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url: server.url,
                type: server.type,
                headers: server.headers,
                cursor,
              }),
            });
            if (!response.ok) {
              console.warn(`[MCP] prompts/list fallback failed (${response.status}) for ${server.url}`);
              promptFailureRef.current.add(serverId);
              updateServerStatus(serverId, 'error', `Prompt list failed (${response.status})`);
              setMcpServersInternal((current) =>
                current.map((existing) =>
                  existing.id === serverId ? { ...existing, prompts: [] } : existing
                )
              );
              break;
            }
          const data = await response.json().catch(() => ({})) as { prompts?: any[]; nextCursor?: string | null };
          const prompts = Array.isArray(data?.prompts) ? data.prompts : [];
            for (const prompt of prompts) {
              collected.push({
                name: prompt?.name ?? 'unknown',
                title: prompt?.title ?? prompt?.name ?? 'Prompt',
                description: prompt?.description,
                arguments: Array.isArray(prompt?.arguments)
                  ? prompt.arguments.map((arg: any) => ({
                      name: arg?.name ?? '',
                      description: arg?.description,
                      required: !!arg?.required,
                    }))
                  : [],
              });
            }
            cursor = data?.nextCursor ?? null;
          } while (cursor);

          setMcpServersInternal((currentServers) =>
            currentServers.map((existing) => {
              if (existing.id !== serverId) return existing;
              const prevSignature = JSON.stringify(existing.prompts ?? []);
              const nextSignature = JSON.stringify(collected);
              if (prevSignature === nextSignature) return existing;
              return { ...existing, prompts: collected };
            })
          );
        } else {
          console.warn(`[MCP] No client available for prompt listing on ${server.name || server.url}`);
        }
        promptsLoadedRef.current.add(serverId);
        return;
      }

      const capabilities = client.getServerCapabilities();
      if (!capabilities?.prompts) {
        setMcpServersInternal((currentServers) =>
          currentServers.map((existing) =>
            existing.id === serverId ? { ...existing, prompts: [] } : existing
          )
        );
        return;
      }

      promptFailureRef.current.delete(serverId);

      let cursor: string | undefined = undefined;
      const collected: MCPPromptDef[] = [];
      do {
        const result = await client.listPrompts({ cursor });
        const prompts = Array.isArray(result?.prompts) ? result.prompts : [];
        for (const prompt of prompts) {
          collected.push({
            name: prompt?.name ?? 'unknown',
            title: prompt?.title ?? prompt?.name ?? 'Prompt',
            description: prompt?.description,
            arguments: Array.isArray(prompt?.arguments)
              ? prompt.arguments.map((arg: any) => ({
                  name: arg?.name ?? '',
                  description: arg?.description,
                  required: !!arg?.required,
                }))
              : [],
          });
        }
        cursor = result?.nextCursor ?? undefined;
      } while (cursor);

      setMcpServersInternal((currentServers) =>
        currentServers.map((existing) => {
          if (existing.id !== serverId) return existing;
          const prevSignature = JSON.stringify(existing.prompts ?? []);
          const nextSignature = JSON.stringify(collected);
          if (prevSignature === nextSignature) return existing;
          return { ...existing, prompts: collected };
        })
      );
      promptsLoadedRef.current.add(serverId);
    } catch (error) {
      console.error(`[MCP] Failed to load prompts for server ${serverId}:`, error);
      promptFailureRef.current.add(serverId);
      updateServerStatus(serverId, 'error', error instanceof Error ? error.message : 'Prompt listing failed');
    } finally {
      loadingPromptsRef.current.delete(serverId);
    }
  }, [getServerById, getOrCreateClient, setMcpServersInternal, updateServerStatus]);

  const fetchPromptMessages = useCallback(async (
    serverId: string,
    promptName: string,
    args: Record<string, string>
  ): Promise<{ messages: PromptMessage[]; description?: string } | null> => {
    if (promptFailureRef.current.has(serverId)) return null;
    const server = getServerById(serverId);
    if (!server) return null;
    try {
      if (server.type === 'http') {
        const client = await getOrCreateClient(server);
        if (client) {
          const response = await client.getPrompt({ name: promptName, arguments: args });
          const messages = Array.isArray(response?.messages) ? (response.messages as unknown as PromptMessage[]) : [];
          const description = typeof response?.description === 'string' ? response.description : undefined;
          return { messages, description };
        }
      }

      const fallback = await fetch('/api/mcp-prompts/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: server.url,
          type: server.type,
          headers: server.headers,
          name: promptName,
          args,
        }),
      });
      if (!fallback.ok) {
        console.warn(`[MCP] prompts/get fallback failed (${fallback.status}) for ${server.url}`);
        promptFailureRef.current.add(serverId);
        updateServerStatus(serverId, 'error', `Prompt fetch failed (${fallback.status})`);
        return null;
      }
      const data = await fallback.json().catch(() => ({}));
      const messages = Array.isArray(data?.messages) ? (data.messages as unknown as PromptMessage[]) : [];
      const description = typeof data?.description === 'string' ? data.description : undefined;
      return { messages, description };
    } catch (error) {
      console.error(`[MCP] prompts/get failed for ${promptName}@${server.name || server.url}:`, error);
      promptFailureRef.current.add(serverId);
      updateServerStatus(serverId, 'error', error instanceof Error ? error.message : 'Prompt fetch failed');
      return null;
    }
  }, [getOrCreateClient, getServerById, updateServerStatus]);

  const completePromptArgument = useCallback(async (input: {
    serverId: string;
    promptName: string;
    argumentName: string;
    value: string;
    contextArgs: Record<string, string>;
  }): Promise<{ values: string[]; hasMore?: boolean; total?: number } | null> => {
    if (promptFailureRef.current.has(input.serverId)) return null;
    const server = getServerById(input.serverId);
    if (!server) return null;
    try {
      if (server.type === 'http') {
        const client = await getOrCreateClient(server);
        if (client) {
          const result = await client.complete({
            ref: { type: 'ref/prompt', name: input.promptName },
            argument: { name: input.argumentName, value: input.value },
            context: { arguments: input.contextArgs },
          });
          const completion = result?.completion;
          return {
            values: Array.isArray(completion?.values) ? completion.values : [],
            hasMore: completion?.hasMore,
            total: completion?.total,
          };
        }
      }

      const fallback = await fetch('/api/mcp-prompts/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: server.url,
          type: server.type,
          headers: server.headers,
          promptName: input.promptName,
          argumentName: input.argumentName,
          value: input.value,
          contextArgs: input.contextArgs,
        }),
      });
      if (!fallback.ok) {
        console.warn(`[MCP] completion/complete fallback failed (${fallback.status}) for ${server.url}`);
        promptFailureRef.current.add(server.id);
        updateServerStatus(server.id, 'error', `Completion failed (${fallback.status})`);
        return null;
      }
      const data = await fallback.json().catch(() => ({}));
      const values = Array.isArray(data?.values) ? data.values : [];
      return {
        values,
        hasMore: data?.hasMore,
        total: data?.total,
      };
    } catch (error) {
      console.error(`[MCP] completion/complete failed for ${input.promptName}.${input.argumentName}:`, error);
      promptFailureRef.current.add(input.serverId);
      updateServerStatus(input.serverId, 'error', error instanceof Error ? error.message : 'Completion failed');
      return null;
    }
  }, [getOrCreateClient, getServerById, updateServerStatus]);

  const getPromptClient = useCallback(async (serverId: string): Promise<Client | null> => {
    const server = getServerById(serverId);
    if (!server) return null;
    return await getOrCreateClient(server);
  }, [getOrCreateClient, getServerById]);

  const subscribeToPromptNotifications = useCallback(async (server: MCPServer | undefined) => {
    if (!server || !server.url) return;
    if (promptSubscriptionsRef.current.has(server.id)) return;
    try {
      const client = await getOrCreateClient(server);
      if (!client) return;
      const capabilities = client.getServerCapabilities();
      if (!capabilities?.prompts?.listChanged) {
        // Server does not support list_changed notifications; store no-op cleanup
        promptSubscriptionsRef.current.set(server.id, () => {
          promptSubscriptionsRef.current.delete(server.id);
        });
        return;
      }

      const previousHandler = client.fallbackNotificationHandler;
      client.fallbackNotificationHandler = async (notification: any) => {
        if (notification?.method === 'notifications/prompts/list_changed') {
          promptsLoadedRef.current.delete(server.id);
          await fetchServerPrompts(server.id, { force: true });
        }
        if (typeof previousHandler === 'function') {
          await previousHandler(notification);
        }
      };

      const cleanup = () => {
        if (typeof previousHandler === 'function') {
          client.fallbackNotificationHandler = previousHandler;
        } else {
          client.fallbackNotificationHandler = undefined;
        }
        promptSubscriptionsRef.current.delete(server.id);
      };

      promptSubscriptionsRef.current.set(server.id, cleanup);
    } catch (error) {
      console.error(`[MCP] Failed to subscribe to prompt updates for ${server?.id}:`, error);
    }
  }, [fetchServerPrompts, getOrCreateClient]);

  const ensureAllPromptsLoaded = useCallback(async (options?: { force?: boolean }) => {
    const connectedServers = mcpServers.filter((server) => server.status === 'connected');
    for (const server of connectedServers) {
      await fetchServerPrompts(server.id, options);
      if (!promptFailureRef.current.has(server.id)) {
        await subscribeToPromptNotifications(server);
      }
    }
  }, [mcpServers, fetchServerPrompts, subscribeToPromptNotifications]);

  // Get active servers formatted for API usage
  const getActiveServersForApi = (): MCPServerApi[] => {
    return selectedMcpServers
      .map((id) => getServerById(id))
      .filter(
        (server): server is MCPServer =>
          !!server && server.status === "connected"
      )
      .map((server) => ({
        type: server.type,
        url: server.url,
        headers: server.headers,
      }));
  };

  // Start a server with isolated error handling and fast failure
  const startServer = useCallback(async (serverId: string): Promise<boolean> => {
    healthFailureRef.current.delete(serverId);
    promptFailureRef.current.delete(serverId);
    promptsLoadedRef.current.delete(serverId);
    const server = getServerById(serverId);
    if (!server) {
      console.error(`[startServer] Server not found for ID: ${serverId}`);
      return false;
    }

    // Skip if already connecting or connected
    if (server.status === "connecting" || server.status === "connected") {
      return server.status === "connected";
    }

    // Check allowlist if in locked mode
    if (isServerLocked()) {
      try {
        const presetServers = JSON.parse(localStorage.getItem(STORAGE_KEYS.MCP_SERVERS) || "[]");
        const allowedUrls = new Set(presetServers.map((s: MCPServer) => s.url));
        if (!allowedUrls.has(server.url)) {
          console.error(`[startServer] Server URL not in allowlist: ${server.url}`);
          updateServerStatus(serverId, "error", "This demo is locked to preset MCP servers.");
          return false;
        }
      } catch (error) {
        console.error(`[startServer] Error checking allowlist:`, error);
        updateServerStatus(serverId, "error", "Error validating server allowlist");
        return false;
      }
    }

  // logging suppressed

    // Mark server as connecting
    updateServerStatus(serverId, "connecting");

    try {
      if (!server.url) {
        console.error(`[startServer] No URL provided for ${server.type} server`);
        updateServerStatus(serverId, "error", "No URL provided");
        return false;
      }

      // Use very aggressive timeout - fail extremely fast for broken servers
      const healthResult = await checkServerHealth(
        server.url,
        server.headers,
        server.type === 'sse' ? 9000 : 7000,
        server.type
      );
      
      if (healthResult.ready) {
        // Allow empty tool list (store empty array) so connection still counts
        updateServerWithTools(serverId, healthResult.tools || [], "connected", healthResult.prompts || [], undefined);
        activeServersRef.current[serverId] = true;
        // logging suppressed
        fetchServerPrompts(serverId);
        subscribeToPromptNotifications(server);
        return true;
      } else {
        updateServerStatus(
          serverId,
          "error",
          healthResult.error || "Could not connect to server"
        );
        // logging suppressed
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // logging suppressed
      updateServerStatus(serverId, "error", `Error: ${errorMessage}`);
      return false;
    }
  }, [fetchServerPrompts, getServerById, subscribeToPromptNotifications, updateServerStatus, updateServerWithTools]);

  // Stop a server
  const stopServer = async (serverId: string): Promise<boolean> => {
    const server = getServerById(serverId);
    if (!server) return false;

    try {
      // Mark as not active
      delete activeServersRef.current[serverId];

      // Update server status and clear tools
      setMcpServersInternal((currentServers) =>
        currentServers.map((s) =>
          s.id === serverId
            ? { ...s, status: "disconnected", tools: undefined, errorMessage: undefined }
            : s
        )
      );
      const cleanup = promptSubscriptionsRef.current.get(serverId);
      if (cleanup) {
        await cleanup();
        promptSubscriptionsRef.current.delete(serverId);
      }
      const client = clientInstancesRef.current.get(serverId);
      if (client) {
        try { await client.close(); } catch {}
        clientInstancesRef.current.delete(serverId);
        clientPromisesRef.current.delete(serverId);
      }
      promptFailureRef.current.delete(serverId);
      healthFailureRef.current.delete(serverId);
      promptsLoadedRef.current.delete(serverId);
      return true;
    } catch (error) {
      console.error(`Error stopping server ${serverId}:`, error);
      return false;
    }
  };

  // Calculate mcpServersForApi based on current state
  const mcpServersForApi = getActiveServersForApi();

  // Track servers currently undergoing a health check to prevent duplicate calls
  const connectingSetRef = useRef<Set<string>>(new Set());

  // Batched, single-attempt connection manager (one /api/mcp-health per server)
  useEffect(() => {
    if (!bootstrapped) return;
    if (mcpServers.length === 0 || selectedMcpServers.length === 0) return;

    // Determine which servers we need to connect now
    const serversToConnect = selectedMcpServers
      .map(id => mcpServers.find(s => s.id === id))
      .filter((s): s is MCPServer => !!s && s.status === 'disconnected' && !connectingSetRef.current.has(s.id) && !healthFailureRef.current.has(s.id));

    if (serversToConnect.length === 0) return;

    // Mark them all as connecting in a single state update to avoid effect thrash
    const idsToConnect = new Set(serversToConnect.map(s => s.id));
    setMcpServersInternal(current => current.map(s => idsToConnect.has(s.id) ? { ...s, status: 'connecting' } : s));

    // Launch connection attempts
    serversToConnect.forEach(server => {
      connectingSetRef.current.add(server.id);
      (async () => {
        const health = await checkServerHealth(
          server.url,
            server.headers,
            server.type === 'sse' ? 9000 : 7000,
            server.type
        );
        if (health.ready) {
          updateServerWithTools(server.id, health.tools || [], 'connected', health.prompts || [], undefined);
        } else {
          updateServerStatus(server.id, 'error', health.error || 'Could not connect');
          healthFailureRef.current.add(server.id);
        }
        connectingSetRef.current.delete(server.id);
      })();
    });
  }, [bootstrapped, mcpServers, selectedMcpServers, setMcpServersInternal, updateServerStatus, updateServerWithTools, fetchServerPrompts, subscribeToPromptNotifications]);

  useEffect(() => {
    const connectedServerIds = new Set(mcpServers.filter((server) => server.status === 'connected').map((server) => server.id));
    for (const [serverId, cleanup] of promptSubscriptionsRef.current.entries()) {
      if (!connectedServerIds.has(serverId)) {
        cleanup?.();
        promptSubscriptionsRef.current.delete(serverId);
      }
    }
  }, [mcpServers]);

  useEffect(() => {
    const subscriptions = promptSubscriptionsRef.current;
    const clientsRef = clientInstancesRef.current;
    const clientPromisesRefSnapshot = clientPromisesRef.current;
    return () => {
      for (const cleanup of subscriptions.values()) {
        cleanup?.();
      }
      subscriptions.clear();
      for (const client of clientsRef.values()) {
        client.close().catch(() => {});
      }
      clientsRef.clear();
      clientPromisesRefSnapshot.clear();
    };
  }, []);

  // Reflect connected server prompts into the slash-prompt registry
  useEffect(() => {
    (async () => {
      try {
        if (!isPromptsLoaded()) await ensurePromptsLoaded();
        const base = promptRegistry.getAll();
        const serverDefs: SlashPromptDef[] = [];
        for (const s of mcpServers) {
          if (s.status !== 'connected' || !s.prompts?.length) continue;
          const displayName = s.name || (() => {
            try {
              return new URL(s.url).hostname;
            } catch {
              return s.url;
            }
          })();
          for (const p of s.prompts) {
            const segments = getPromptSegments(s, p);
            const id = `${segments.serverSlug}/${segments.promptSlug}`;
            serverDefs.push({
              id,
              trigger: segments.trigger,
              namespace: segments.namespace,
              name: p.name,
              title: p.title || p.name,
              description: p.description,
              origin: 'server-import',
              sourceServerId: s.id,
              sourceServerName: displayName,
              sourceServerSlug: segments.serverSlug,
              mode: 'server',
              args: p.arguments?.map(a => ({ name: a.name, description: a.description, required: a.required })) || []
            });
          }
        }
        // Deduplicate by trigger so the freshest definition wins
        const map = new Map(base.map(d => [d.trigger, d] as const));
        for (const d of serverDefs) map.set(d.trigger, d);
        promptRegistry.load(Array.from(map.values()));
      } catch {
        // ignore
      }
    })();
  }, [mcpServers]);

  return (
    <MCPContext.Provider
      value={{
        mcpServers,
        setMcpServers,
        selectedMcpServers,
        setSelectedMcpServers,
        mcpServersForApi,
        startServer,
        stopServer,
        updateServerStatus,
        getActiveServersForApi,
        fetchPromptMessages,
        completePromptArgument,
        getPromptClient,
        ensureAllPromptsLoaded,
      }}
    >
      {children}
    </MCPContext.Provider>
  );
}

export function useMCP() {
  const context = useContext(MCPContext);
  if (context === undefined) {
    throw new Error("useMCP must be used within a MCPProvider");
  }
  return context;
}
