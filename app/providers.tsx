"use client";

import { ReactNode, useEffect, useState } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLocalStorage } from "@/lib/hooks/use-local-storage";
import { STORAGE_KEYS } from "@/lib/constants";
import { MCPProvider } from "@/lib/context/mcp-context";
import mcpServersConfig from "@/config/mcp-servers.json";

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: true,
    },
  },
});

type McpServer = { 
  id: string; 
  name: string; 
  type: "sse" | "http"; 
  url: string; 
  headers?: Array<{ key: string; value: string }>; 
  description?: string;
};

export function Providers({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useLocalStorage<boolean>(
    STORAGE_KEYS.SIDEBAR_STATE,
    true
  );

  // Bootstrap MCP servers from configuration file on first load
  useEffect(() => {
    try {
      const lockSetting = process.env.MCP_LOCK_SERVERS;
      
      // Get servers from the imported JSON configuration
      const preset = mcpServersConfig.servers;
      
      if (!preset || preset.length === 0) return;
      
      // Convert to the format expected by the MCP context
      const servers: McpServer[] = preset.map((server, index) => ({
        id: `config-${index}`,
        name: server.name,
        type: server.type === "streamable-http" ? "http" : server.type,
        url: server.url,
        headers: [],
        description: server.description,
      }));
      
      // Check if we should lock servers (only if MCP_LOCK_SERVERS=1)
      const shouldLock = lockSetting === "1";
      
      // Always load the configuration servers, but handle locking separately
      const existingServers = localStorage.getItem(STORAGE_KEYS.MCP_SERVERS);
      const hasExistingServers = existingServers && JSON.parse(existingServers).length > 0;
      
      if (!hasExistingServers) {
        // Load the preset servers
        localStorage.setItem(STORAGE_KEYS.MCP_SERVERS, JSON.stringify(servers));
        
        // Auto-select all preset servers
        const serverIds = servers.map(s => s.id);
        localStorage.setItem(STORAGE_KEYS.SELECTED_MCP_SERVERS, JSON.stringify(serverIds));
        
        console.log("[Providers] Loaded MCP servers from config file:", servers.map(s => s.name));
      }
      
      // Handle locking state separately
      if (shouldLock) {
        localStorage.setItem("mcp:locked", "1");
      } else {
        localStorage.removeItem("mcp:locked");
      }
    } catch (error) {
      console.error("Failed to bootstrap MCP servers from config:", error);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem={true}
        disableTransitionOnChange
        themes={["light", "dark", "sunset", "black"]}
      >
        <MCPProvider>
          <SidebarProvider defaultOpen={sidebarOpen} open={sidebarOpen} onOpenChange={setSidebarOpen}>
            {children}
            <Toaster position="top-center" richColors />
          </SidebarProvider>
        </MCPProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
} 