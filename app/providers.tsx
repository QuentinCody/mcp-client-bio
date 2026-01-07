"use client";

import { ReactNode, useState } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLocalStorage } from "@/lib/hooks/use-local-storage";
import { STORAGE_KEYS } from "@/lib/constants";
import { MCPProvider } from "@/lib/context/mcp-context";
import { TokenProvider } from "@/lib/context/token-context";

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

  // NOTE: Config bootstrap moved into MCPProvider to avoid race with initial localStorage read.

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
          <TokenProvider>
            <SidebarProvider defaultOpen={sidebarOpen} open={sidebarOpen} onOpenChange={setSidebarOpen}>
              {children}
              <Toaster position="top-center" richColors />
            </SidebarProvider>
          </TokenProvider>
        </MCPProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
} 