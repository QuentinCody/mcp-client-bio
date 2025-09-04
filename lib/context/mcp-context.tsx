"use client";

import { createContext, useContext, useRef, useEffect, useCallback, useState } from "react";
import mcpServersConfig from "@/config/mcp-servers.json";
import { useLocalStorage } from "@/lib/hooks/use-local-storage";
import { isServerLocked } from "@/lib/utils";

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
}

const MCPContext = createContext<MCPContextType | undefined>(undefined);

// Helper function to check server health with aggressive timeout
async function checkServerHealth(
  url: string,
  headers?: KeyValuePair[],
  timeoutMs: number = 8000, // allow more time for cold starts
  preferredType?: 'sse' | 'http'
): Promise<{ ready: boolean; tools?: MCPTool[]; error?: string }> {
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
    if (mcpServers.length > 0) {
      setBootstrapped(true);
      return;
    }
    try {
      const preset = (mcpServersConfig as any).servers || [];
      if (!preset.length) {
        setBootstrapped(true);
        return;
      }
      const servers: MCPServer[] = preset.map((server: any, index: number) => ({
        id: `config-${index}`,
        name: server.name,
        type: server.type === 'streamable-http' || server.type === 'http' ? 'http' : 'sse',
        url: server.url,
        headers: [],
        description: server.description,
        status: 'disconnected'
      }));
      setMcpServersInternal(servers);
      setSelectedMcpServersInternal(servers.map(s => s.id));
      const lockSetting = process.env.MCP_LOCK_SERVERS;
      if (lockSetting === '1') {
        localStorage.setItem('mcp:locked', '1');
      }
      console.log('[MCPProvider] Bootstrapped servers from config:', servers.map(s => s.name));
    } catch (err) {
      console.error('[MCPProvider] Failed to bootstrap config servers:', err);
    } finally {
      setBootstrapped(true);
    }
  }, [bootstrapped, mcpServers.length]);

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
    status: ServerStatus = "connected"
  ) => {
    setMcpServersInternal((currentServers) =>
      currentServers.map((server) =>
        server.id === serverId
          ? { ...server, tools, status, errorMessage: undefined }
          : server
      )
    );
  }, [setMcpServersInternal]);

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
        updateServerWithTools(serverId, healthResult.tools || [], "connected");
        activeServersRef.current[serverId] = true;
        // logging suppressed
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
  }, [getServerById, updateServerStatus, updateServerWithTools]);

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
      .filter((s): s is MCPServer => !!s && s.status === 'disconnected' && !connectingSetRef.current.has(s.id));

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
          updateServerWithTools(server.id, health.tools || [], 'connected');
        } else {
          updateServerStatus(server.id, 'error', health.error || 'Could not connect');
        }
        connectingSetRef.current.delete(server.id);
      })();
    });
  }, [bootstrapped, mcpServers, selectedMcpServers, setMcpServersInternal, updateServerStatus, updateServerWithTools]);

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
