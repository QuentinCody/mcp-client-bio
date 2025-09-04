"use client";

import { ReactNode, useEffect, useState } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLocalStorage } from "@/lib/hooks/use-local-storage";
import { STORAGE_KEYS } from "@/lib/constants";
import { MCPProvider } from "@/lib/context/mcp-context";

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
  type: "streamable-http" | "sse" | "http"; 
  url: string; 
  headers?: Array<{ key: string; value: string }>; 
};

export function Providers({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useLocalStorage<boolean>(
    STORAGE_KEYS.SIDEBAR_STATE,
    true
  );

  // Bootstrap MCP servers from environment variables on first load
  useEffect(() => {
    try {
      const raw = process.env.NEXT_PUBLIC_MCP_SERVERS;
      const lockSetting = process.env.MCP_LOCK_SERVERS;
      
      if (!raw) return;
      
      const preset = JSON.parse(raw) as Array<{ name: string; type: "streamable-http" | "sse" | "http"; url: string }>;
      
      // Convert to the format expected by the MCP context
      const servers: McpServer[] = preset.map((server, index) => ({
        id: `preset-${index}`,
        name: server.name,
        type: server.type,
        url: server.url,
        headers: [],
      }));
      
      // Check if we should lock servers (only if MCP_LOCK_SERVERS=1)
      const shouldLock = lockSetting === "1";
      
      if (shouldLock) {
        // Only seed if not already seeded and we want to lock
        const existingServers = localStorage.getItem(STORAGE_KEYS.MCP_SERVERS);
        const existingLock = localStorage.getItem("mcp:locked");
        
        if (!existingServers || !existingLock) {
          // Persist the preset servers and lock state
          localStorage.setItem("mcp:locked", "1");
          localStorage.setItem(STORAGE_KEYS.MCP_SERVERS, JSON.stringify(servers));
          
          // Auto-select all preset servers
          const serverIds = servers.map(s => s.id);
          localStorage.setItem(STORAGE_KEYS.SELECTED_MCP_SERVERS, JSON.stringify(serverIds));
        }
      } else {
        // If MCP_LOCK_SERVERS is not 1, ensure we're unlocked
        localStorage.removeItem("mcp:locked");
        
        // Still seed the servers if they don't exist
        const existingServers = localStorage.getItem(STORAGE_KEYS.MCP_SERVERS);
        if (!existingServers) {
          localStorage.setItem(STORAGE_KEYS.MCP_SERVERS, JSON.stringify(servers));
          
          // Auto-select all preset servers
          const serverIds = servers.map(s => s.id);
          localStorage.setItem(STORAGE_KEYS.SELECTED_MCP_SERVERS, JSON.stringify(serverIds));
        }
      }
    } catch (error) {
      console.error("Failed to bootstrap MCP servers:", error);
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