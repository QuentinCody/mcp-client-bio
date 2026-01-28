"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  MessageSquare,
  PlusCircle,
  Trash2,
  ServerIcon,
  Settings,
  Sparkles,
  ChevronsUpDown,
  Copy,
  Pencil,
  Github,
  Key,
  Star,
  StarOff,
  Search,
  Download,
  MoreHorizontal,
  Calendar,
  Clock,
  ChevronRight,
  Activity,
  Circle,
  Zap,
  X,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
  useSidebar,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import Image from "next/image";
import { MCPServerManager } from "./mcp-server-manager";
import { ApiKeyManager } from "./api-key-manager";
import { ThemeToggle } from "./theme-toggle";
import { getUserId, updateUserId } from "@/lib/user-id";
import { useChats } from "@/lib/hooks/use-chats";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMCP } from "@/lib/context/mcp-context";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatePresence, motion } from "motion/react";
import { isServerLocked } from "@/lib/utils";
import { setSlashRuntimeActions } from "@/lib/slash/runtime";
import Fuse from "fuse.js";

// Types for grouped chats
interface ChatItem {
  id: string;
  title: string;
  createdAt: string | Date;
  updatedAt?: string | Date;
  preview?: string;
  isPinned?: boolean;
}

interface ChatGroup {
  label: string;
  icon: React.ElementType;
  chats: ChatItem[];
}

// Helper to group chats by date
function groupChatsByDate(chats: ChatItem[]): ChatGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thisMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const groups: Record<string, ChatItem[]> = {
    pinned: [],
    today: [],
    yesterday: [],
    thisWeek: [],
    thisMonth: [],
    older: [],
  };

  chats.forEach((chat) => {
    if (chat.isPinned) {
      groups.pinned.push(chat);
      return;
    }

    const chatDate = new Date(chat.updatedAt || chat.createdAt);

    if (chatDate >= today) {
      groups.today.push(chat);
    } else if (chatDate >= yesterday) {
      groups.yesterday.push(chat);
    } else if (chatDate >= thisWeek) {
      groups.thisWeek.push(chat);
    } else if (chatDate >= thisMonth) {
      groups.thisMonth.push(chat);
    } else {
      groups.older.push(chat);
    }
  });

  const result: ChatGroup[] = [];

  if (groups.pinned.length > 0) {
    result.push({ label: "Pinned", icon: Star, chats: groups.pinned });
  }
  if (groups.today.length > 0) {
    result.push({ label: "Today", icon: Clock, chats: groups.today });
  }
  if (groups.yesterday.length > 0) {
    result.push({ label: "Yesterday", icon: Calendar, chats: groups.yesterday });
  }
  if (groups.thisWeek.length > 0) {
    result.push({ label: "This Week", icon: Calendar, chats: groups.thisWeek });
  }
  if (groups.thisMonth.length > 0) {
    result.push({ label: "This Month", icon: Calendar, chats: groups.thisMonth });
  }
  if (groups.older.length > 0) {
    result.push({ label: "Older", icon: Calendar, chats: groups.older });
  }

  return result;
}

// Pinned chats storage
const PINNED_CHATS_KEY = "bio-mcp-pinned-chats";

function getPinnedChats(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = localStorage.getItem(PINNED_CHATS_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function savePinnedChats(pinned: Set<string>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PINNED_CHATS_KEY, JSON.stringify([...pinned]));
}

// Chat item component with hover actions
function ChatListItem({
  chat,
  isActive,
  isCollapsed,
  isPinned,
  onDelete,
  onTogglePin,
  onExport,
  onRename,
  onNavigationPrefetch,
}: {
  chat: ChatItem;
  isActive: boolean;
  isCollapsed: boolean;
  isPinned: boolean;
  onDelete: (e: React.MouseEvent) => void;
  onTogglePin: () => void;
  onExport: () => void;
  onRename: () => void;
  onNavigationPrefetch: () => void;
}) {
  const [showActions, setShowActions] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.2 }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      className="group relative"
    >
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          tooltip={isCollapsed ? chat.title : undefined}
          data-active={isActive}
          className={cn(
            "transition-all text-[#e5e7eb] hover:bg-[#343541] data-[active=true]:bg-[#2c2d32]",
            "group-hover:pr-20"
          )}
        >
          <Link
            href={`/chat/${chat.id}`}
            className="flex items-center justify-between w-full gap-1"
            onPointerEnter={onNavigationPrefetch}
            onFocus={onNavigationPrefetch}
            onTouchStart={onNavigationPrefetch}
          >
            <div className="flex items-center min-w-0 overflow-hidden flex-1 pr-2">
              <div className="relative flex-shrink-0">
                <MessageSquare
                  className={cn(
                    "h-4 w-4",
                    isActive ? "text-[#f5f5f5]" : "text-[#9ca3af]"
                  )}
                />
                {isPinned && (
                  <Star className="absolute -top-1 -right-1 h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                )}
              </div>
              {!isCollapsed && (
                <div className="ml-2 flex-1 min-w-0">
                  <span
                    className={cn(
                      "block truncate text-sm leading-snug",
                      isActive
                        ? "font-medium text-[#f7f7f8]"
                        : "text-[#d1d5db]"
                    )}
                    title={chat.title}
                  >
                    {chat.title.length > 24
                      ? `${chat.title.slice(0, 24)}...`
                      : chat.title}
                  </span>
                  {chat.preview && (
                    <span className="block truncate text-[10px] text-[#6b7280] mt-0.5">
                      {chat.preview}
                    </span>
                  )}
                </div>
              )}
            </div>
          </Link>
        </SidebarMenuButton>

        {/* Hover actions */}
        {!isCollapsed && (
          <AnimatePresence>
            {showActions && (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.15 }}
                className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-[#2c2d32] rounded-md px-1 py-0.5 border border-[#3f4046] shadow-lg"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-[#9ca3af] hover:text-amber-400 hover:bg-[#3f4046]"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onTogglePin();
                  }}
                  title={isPinned ? "Unpin" : "Pin"}
                >
                  {isPinned ? (
                    <StarOff className="h-3.5 w-3.5" />
                  ) : (
                    <Star className="h-3.5 w-3.5" />
                  )}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-[#9ca3af] hover:text-[#f7f7f8] hover:bg-[#3f4046]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-40 bg-[#1f1f23] border-[#2c2c2d]"
                  >
                    <DropdownMenuItem
                      className="text-[#e5e7eb] focus:bg-[#343541]"
                      onSelect={onRename}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-2" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-[#e5e7eb] focus:bg-[#343541]"
                      onSelect={onExport}
                    >
                      <Download className="h-3.5 w-3.5 mr-2" />
                      Export
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-red-400 focus:bg-red-500/10 focus:text-red-400"
                      onSelect={(e) => onDelete(e as unknown as React.MouseEvent)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* Collapsed state delete button */}
        {isCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 text-[#9ca3af] hover:text-red-400 hover:bg-[#2f2f2f]"
            onClick={onDelete}
            title="Delete chat"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </SidebarMenuItem>
    </motion.div>
  );
}

// Mini server card component
function MiniServerCard({
  server,
  health,
  isSelected,
  onToggle,
}: {
  server: { id: string; name: string; url: string };
  health: { status: "online" | "connecting" | "error" | "unknown"; latency?: number };
  isSelected: boolean;
  onToggle: () => void;
}) {
  const statusColors = {
    online: "bg-green-500",
    connecting: "bg-amber-500 animate-pulse",
    error: "bg-red-500",
    unknown: "bg-gray-500",
  };

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onToggle}
      className={cn(
        "w-full flex items-center gap-2 p-2 rounded-lg transition-all",
        "border text-left",
        isSelected
          ? "bg-[#2c2d32] border-primary/30 shadow-[0_0_10px_rgba(96,165,250,0.1)]"
          : "bg-[#1f1f23] border-[#2c2c2d] hover:border-[#3f4046]"
      )}
    >
      <div className="relative">
        <ServerIcon className={cn(
          "h-4 w-4 transition-colors",
          isSelected ? "text-primary" : "text-[#9ca3af]"
        )} />
        <div className={cn(
          "absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full",
          statusColors[health.status]
        )} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className={cn(
            "text-xs font-medium truncate",
            isSelected ? "text-[#f7f7f8]" : "text-[#d1d5db]"
          )}>
            {server.name}
          </span>
          {health.latency && health.status === "online" && (
            <span className="text-[10px] text-[#6b7280] ml-1">
              {health.latency}ms
            </span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

export function NavigationOasis() {
  const router = useRouter();
  const pathname = usePathname();
  const [userId, setUserId] = useState<string>("");
  const [mcpSettingsOpen, setMcpSettingsOpen] = useState(false);
  const [apiKeySettingsOpen, setApiKeySettingsOpen] = useState(false);
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [editUserIdOpen, setEditUserIdOpen] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [locked, setLocked] = useState(false);
  const queryClient = useQueryClient();
  const prefetchedChatKeys = useRef<Set<string>>(new Set());

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Pinned chats state
  const [pinnedChats, setPinnedChats] = useState<Set<string>>(new Set());

  // Check if servers are locked
  useEffect(() => {
    setLocked(isServerLocked());
  }, []);

  // Load pinned chats
  useEffect(() => {
    setPinnedChats(getPinnedChats());
  }, []);

  useEffect(() => {
    setSlashRuntimeActions({ openServerManager: () => setMcpSettingsOpen(true) });
    return () => {
      setSlashRuntimeActions({ openServerManager: undefined });
    };
  }, [setMcpSettingsOpen]);

  // Get MCP server data from context
  const {
    mcpServers,
    setMcpServers,
    selectedMcpServers,
    setSelectedMcpServers,
  } = useMCP();

  const prefetchChatData = useCallback(
    async (chatId: string) => {
      if (!userId || !chatId) return;
      const queryKey = ["chat", chatId, userId] as const;

      const existingQueryState = queryClient.getQueryState(queryKey);
      if (existingQueryState) {
        const dataAge = Date.now() - (existingQueryState.dataUpdatedAt || 0);
        if (dataAge < 60000) {
          return;
        }
      }

      try {
        await queryClient.prefetchQuery({
          queryKey,
          queryFn: async () => {
            const response = await fetch(`/api/chats/${chatId}`, {
              headers: {
                "x-user-id": userId,
              },
            });

            if (!response.ok) {
              if (response.status === 404) {
                return {
                  id: chatId,
                  messages: [],
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };
              }
              throw new Error("Failed to fetch chat");
            }

            return response.json();
          },
          staleTime: 1000 * 60 * 5,
        });
      } catch (error) {
        console.debug("Prefetch chat failed", { chatId, error });
      }
    },
    [queryClient, userId]
  );

  const debouncedPrefetchTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const handleNavigationPrefetch = useCallback(
    (chatId: string) => {
      if (!chatId || !userId) return;
      const cacheKey = `${userId}:${chatId}`;
      if (prefetchedChatKeys.current.has(cacheKey)) return;

      const existingTimeout = debouncedPrefetchTimeouts.current.get(cacheKey);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      const timeoutId = setTimeout(() => {
        prefetchedChatKeys.current.add(cacheKey);
        prefetchChatData(chatId);
        router.prefetch(`/chat/${chatId}`);
        debouncedPrefetchTimeouts.current.delete(cacheKey);
      }, 300);

      debouncedPrefetchTimeouts.current.set(cacheKey, timeoutId);
    },
    [prefetchedChatKeys, prefetchChatData, router, userId]
  );

  useEffect(() => {
    prefetchedChatKeys.current.clear();
  }, [userId]);

  useEffect(() => {
    const timeouts = debouncedPrefetchTimeouts.current;
    return () => {
      timeouts.forEach((timeout) => clearTimeout(timeout));
      timeouts.clear();
    };
  }, []);

  useEffect(() => {
    setUserId(getUserId());
  }, []);

  const { chats, isLoading, deleteChat, refreshChats } = useChats(userId);

  useEffect(() => {
    if (isLoading || chats.length === 0 || !userId) return;
    handleNavigationPrefetch(chats[0].id);
  }, [chats, handleNavigationPrefetch, isLoading, userId]);

  // Fuzzy search setup
  const fuse = useMemo(() => {
    return new Fuse(chats, {
      keys: ["title"],
      threshold: 0.4,
      includeScore: true,
    });
  }, [chats]);

  // Filter chats based on search
  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return chats;
    const results = fuse.search(searchQuery);
    return results.map((result) => result.item);
  }, [chats, searchQuery, fuse]);

  // Add pinned status to chats
  const chatsWithPinStatus = useMemo(() => {
    return filteredChats.map((chat) => ({
      ...chat,
      isPinned: pinnedChats.has(chat.id),
    }));
  }, [filteredChats, pinnedChats]);

  // Group chats by date
  const groupedChats = useMemo(() => {
    return groupChatsByDate(chatsWithPinStatus);
  }, [chatsWithPinStatus]);

  const handleNewChat = () => {
    router.push("/");
  };

  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    deleteChat(chatId);

    if (pathname === `/chat/${chatId}`) {
      router.push("/");
    }
  };

  const handleTogglePin = (chatId: string) => {
    const newPinned = new Set(pinnedChats);
    if (newPinned.has(chatId)) {
      newPinned.delete(chatId);
      toast.success("Chat unpinned");
    } else {
      newPinned.add(chatId);
      toast.success("Chat pinned");
    }
    setPinnedChats(newPinned);
    savePinnedChats(newPinned);
  };

  const handleExportChat = (chatId: string) => {
    // TODO: Implement export functionality
    toast.info("Export feature coming soon");
  };

  const handleRenameChat = (chatId: string) => {
    // TODO: Implement rename functionality
    toast.info("Rename feature coming soon");
  };

  const handleToggleServer = (serverId: string) => {
    if (selectedMcpServers.includes(serverId)) {
      setSelectedMcpServers(selectedMcpServers.filter((id) => id !== serverId));
    } else {
      setSelectedMcpServers([...selectedMcpServers, serverId]);
    }
  };

  const activeServersCount = selectedMcpServers.length;

  const handleUpdateUserId = () => {
    if (!newUserId.trim()) {
      toast.error("User ID cannot be empty");
      return;
    }

    updateUserId(newUserId.trim());
    setUserId(newUserId.trim());
    setEditUserIdOpen(false);
    toast.success("User ID updated successfully");
    window.location.reload();
  };

  if (!userId) {
    return null;
  }

  const renderChatSkeletons = () => {
    return Array(3)
      .fill(0)
      .map((_, index) => (
        <SidebarMenuItem key={`skeleton-${index}`}>
          <div
            className={`flex items-center gap-2 px-3 py-2 ${
              isCollapsed ? "justify-center" : ""
            }`}
          >
            <Skeleton className="h-4 w-4 rounded-full" />
            {!isCollapsed && (
              <>
                <Skeleton className="h-4 w-full max-w-[180px] bg-[#2c2f36]" />
                <Skeleton className="ml-auto h-5 w-5 flex-shrink-0 rounded-md bg-[#2c2f36]" />
              </>
            )}
          </div>
        </SidebarMenuItem>
      ));
  };

  // Get server health status from mcpServers
  const getServerHealth = (serverId: string) => {
    const server = mcpServers.find((s) => s.id === serverId);
    if (!server) return { status: "unknown" as const };
    const statusMap: Record<string, "online" | "connecting" | "error" | "unknown"> = {
      connected: "online",
      connecting: "connecting",
      error: "error",
      disconnected: "error",
    };
    return {
      status: statusMap[server.status || ""] || "unknown",
      latency: undefined, // Latency not available in current context
    };
  };

  return (
    <Sidebar
      className="border-r border-[#2c2c2d] bg-gradient-to-b from-[#202123] to-[#1a1a1c] text-[#ececec]"
      collapsible="icon"
    >
      {/* Subtle star pattern for dark mode */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30 dark:opacity-20">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-0.5 h-0.5 bg-white/20 rounded-full"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
            }}
          />
        ))}
      </div>

      <SidebarHeader className="relative border-b border-[#2f2f2f] p-4">
        <div className="flex items-center justify-between">
          <div
            className={`flex items-center gap-2 ${
              isCollapsed ? "justify-center w-full" : ""
            }`}
          >
            <motion.div
              whileHover={{ scale: 1.05, rotate: 5 }}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "relative rounded-full flex items-center justify-center",
                "bg-gradient-to-br from-primary/80 to-purple-500/60",
                "shadow-[0_0_20px_rgba(96,165,250,0.3)]",
                isCollapsed ? "size-8 p-3" : "size-8"
              )}
            >
              <Image
                src="/scira.png"
                alt="Bio MCP Chat Logo"
                width={24}
                height={24}
                className="absolute transform scale-75"
                priority
                quality={90}
              />
            </motion.div>
            {!isCollapsed && (
              <div className="flex flex-col">
                <span className="text-lg font-bold bg-gradient-to-r from-[#f7f7f8] to-[#9ca3af] bg-clip-text text-transparent">
                  Bio MCP
                </span>
                <span className="text-[10px] text-[#6b7280] -mt-0.5">
                  Navigation Oasis
                </span>
              </div>
            )}
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="relative flex flex-col h-[calc(100vh-8rem)]">
        {/* Search Bar */}
        {!isCollapsed && (
          <div className="px-3 pt-3 pb-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#6b7280]" />
              <Input
                ref={searchInputRef}
                type="text"
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(
                  "h-8 pl-8 pr-8 text-xs",
                  "bg-[#2c2d32] border-[#3f4046] text-[#e5e7eb]",
                  "placeholder:text-[#6b7280]",
                  "focus:ring-1 focus:ring-primary/30 focus:border-primary/30",
                  "transition-all"
                )}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6b7280] hover:text-[#9ca3af]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Chat Groups */}
        <SidebarGroup className="flex-1 min-h-0">
          <SidebarGroupLabel
            className={cn(
              "px-4 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[#6b7280]",
              isCollapsed ? "sr-only" : ""
            )}
          >
            {searchQuery ? `Results (${filteredChats.length})` : "Conversations"}
          </SidebarGroupLabel>
          <SidebarGroupContent
            className={cn(
              "overflow-y-auto pt-1 scrollbar-thin scrollbar-thumb-[#3f4046] scrollbar-track-transparent",
              isCollapsed ? "overflow-x-hidden" : ""
            )}
          >
            <SidebarMenu>
              {isLoading ? (
                renderChatSkeletons()
              ) : groupedChats.length === 0 ? (
                <div
                  className={`flex items-center justify-center py-3 ${
                    isCollapsed ? "" : "px-4"
                  }`}
                >
                  {isCollapsed ? (
                    <div className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background">
                      <MessageSquare className="h-3 w-3 text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 w-full px-3 py-4 rounded-lg border border-dashed border-[#3f4046] bg-[#1f1f23]">
                      <MessageSquare className="h-6 w-6 text-[#6b7280]" />
                      <span className="text-xs text-[#6b7280] text-center">
                        {searchQuery ? "No matching chats" : "No conversations yet"}
                      </span>
                      {!searchQuery && (
                        <span className="text-[10px] text-[#4b5563]">
                          Start a new chat below
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {groupedChats.map((group) => (
                    <div key={group.label} className="mb-2">
                      {!isCollapsed && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5">
                          <group.icon className={cn(
                            "h-3 w-3",
                            group.label === "Pinned" ? "text-amber-400" : "text-[#6b7280]"
                          )} />
                          <span className="text-[10px] font-medium text-[#6b7280] uppercase tracking-wide">
                            {group.label}
                          </span>
                          <div className="flex-1 h-px bg-gradient-to-r from-[#3f4046] to-transparent ml-2" />
                        </div>
                      )}
                      {group.chats.map((chat) => (
                        <ChatListItem
                          key={chat.id}
                          chat={chat}
                          isActive={pathname === `/chat/${chat.id}`}
                          isCollapsed={isCollapsed}
                          isPinned={chat.isPinned || false}
                          onDelete={(e) => handleDeleteChat(chat.id, e)}
                          onTogglePin={() => handleTogglePin(chat.id)}
                          onExport={() => handleExportChat(chat.id)}
                          onRename={() => handleRenameChat(chat.id)}
                          onNavigationPrefetch={() => handleNavigationPrefetch(chat.id)}
                        />
                      ))}
                    </div>
                  ))}
                </AnimatePresence>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="relative my-1">
          <div className="absolute inset-x-3">
            <Separator className="h-px bg-gradient-to-r from-transparent via-[#3f4046] to-transparent" />
          </div>
        </div>

        {/* MCP Servers Section */}
        <SidebarGroup className="flex-shrink-0 px-1">
          <SidebarGroupLabel
            className={cn(
              "px-3 pt-0 text-[10px] font-semibold text-[#6b7280] uppercase tracking-wider flex items-center justify-between",
              isCollapsed ? "sr-only" : ""
            )}
          >
            <span className="flex items-center gap-1.5">
              <Zap className="h-3 w-3 text-primary" />
              MCP Servers
            </span>
            {activeServersCount > 0 && (
              <Badge className="h-4 px-1.5 text-[9px] bg-primary/20 text-primary border-0">
                {activeServersCount} active
              </Badge>
            )}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {!isCollapsed ? (
              <div className="px-2 pb-2 space-y-1.5 max-h-32 overflow-y-auto">
                {mcpServers.slice(0, 4).map((server) => (
                  <MiniServerCard
                    key={server.id}
                    server={server}
                    health={getServerHealth(server.id)}
                    isSelected={selectedMcpServers.includes(server.id)}
                    onToggle={() => handleToggleServer(server.id)}
                  />
                ))}
                {mcpServers.length > 4 && (
                  <button
                    onClick={() => setMcpSettingsOpen(true)}
                    className="w-full text-center text-[10px] text-[#6b7280] hover:text-primary py-1"
                  >
                    +{mcpServers.length - 4} more servers
                  </button>
                )}
                {mcpServers.length === 0 && (
                  <button
                    onClick={() => setMcpSettingsOpen(true)}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-[#3f4046] hover:border-primary/30 text-[#6b7280] hover:text-primary transition-colors"
                  >
                    <ServerIcon className="h-4 w-4" />
                    <span className="text-xs">Add Server</span>
                  </button>
                )}
              </div>
            ) : (
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setMcpSettingsOpen(true)}
                    className="flex w-full items-center gap-2 transition-all text-[#e5e7eb] hover:bg-[#343541]"
                    tooltip="MCP Servers"
                  >
                    <ServerIcon
                      className={cn(
                        "h-4 w-4 flex-shrink-0 transition-colors",
                        activeServersCount > 0 ? "text-success" : "text-muted-foreground"
                      )}
                    />
                    {activeServersCount > 0 && (
                      <SidebarMenuBadge className="bg-gradient-to-r from-success/20 to-success/10 text-success border border-success/30">
                        {activeServersCount}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            )}
            {!locked && !isCollapsed && mcpServers.length > 0 && (
              <button
                onClick={() => setMcpSettingsOpen(true)}
                className="w-full flex items-center justify-center gap-1 text-[10px] text-[#6b7280] hover:text-primary py-1 transition-colors"
              >
                <Settings className="h-3 w-3" />
                Manage Servers
              </button>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="relative mt-auto border-t border-[#2c2c2d] p-3">
        <div className={`flex flex-col ${isCollapsed ? "items-center" : ""} gap-2`}>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              variant="default"
              className={cn(
                "w-full bg-gradient-to-r from-primary to-primary/80 text-primary-foreground",
                "hover:from-primary/90 hover:to-primary/70",
                "shadow-md hover:shadow-lg transition-all duration-200 border-0",
                "dark:shadow-[0_0_25px_rgba(96,165,250,0.4)] dark:hover:shadow-[0_0_35px_rgba(96,165,250,0.6)]",
                isCollapsed ? "h-10 w-10 p-0" : "min-h-[44px]"
              )}
              onClick={handleNewChat}
              title={isCollapsed ? "New Chat" : undefined}
            >
              <PlusCircle className={cn(
                "h-4 w-4 flex-shrink-0",
                !isCollapsed && "mr-2",
                "dark:drop-shadow-[0_0_4px_rgba(255,255,255,0.8)]"
              )} />
              {!isCollapsed && <span className="text-sm font-semibold">New Chat</span>}
            </Button>
          </motion.div>

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              {isCollapsed ? (
                <Button
                  variant="ghost"
                  className="flex h-8 w-8 items-center justify-center p-0 text-[#e5e7eb] hover:bg-[#343541]"
                >
                  <Avatar className="h-6 w-6 rounded-lg bg-gradient-to-br from-primary/40 to-purple-500/40">
                    <AvatarFallback className="rounded-lg text-xs font-medium text-[#f5f5f5] bg-transparent">
                      {userId.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="h-12 w-full justify-between border border-[#2c2c2d] bg-[#1f1f23] px-2 font-normal text-[#e5e7eb] shadow-none hover:bg-[#343541] hover:border-[#3f4046]"
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/40 to-purple-500/40 ring-2 ring-primary/20">
                      <AvatarFallback className="rounded-lg text-sm font-semibold text-[#f5f5f5] bg-transparent">
                        {userId.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid text-left text-sm leading-tight">
                      <span className="truncate font-medium text-[#f7f7f8]">
                        Profile
                      </span>
                      <span className="truncate text-[10px] text-[#6b7280]">
                        {userId.substring(0, 12)}...
                      </span>
                    </div>
                  </div>
                  <ChevronsUpDown className="h-4 w-4 text-[#6b7280]" />
                </Button>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-56 rounded-lg border border-[#2c2c2d] bg-[#1f1f23] text-[#e5e7eb]"
              side="top"
              align={isCollapsed ? "start" : "end"}
              sideOffset={8}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-2 py-2 text-left text-sm">
                  <Avatar className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary/40 to-purple-500/40 ring-2 ring-primary/20">
                    <AvatarFallback className="rounded-lg text-sm font-semibold text-[#f5f5f5] bg-transparent">
                      {userId.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold text-[#f7f7f8]">
                      User Profile
                    </span>
                    <span className="truncate text-[10px] text-[#6b7280]">
                      {userId}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-[#2c2c2d]" />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="focus:bg-[#343541] focus:text-[#f7f7f8]"
                  onSelect={(e) => {
                    e.preventDefault();
                    navigator.clipboard.writeText(userId);
                    toast.success("User ID copied to clipboard");
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy User ID
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="focus:bg-[#343541] focus:text-[#f7f7f8]"
                  onSelect={(e) => {
                    e.preventDefault();
                    setEditUserIdOpen(true);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit User ID
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator className="bg-[#2c2c2d]" />
              <DropdownMenuGroup>
                {!locked && (
                  <DropdownMenuItem
                    className="focus:bg-[#343541] focus:text-[#f7f7f8]"
                    onSelect={(e) => {
                      e.preventDefault();
                      setMcpSettingsOpen(true);
                    }}
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    MCP Settings
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="focus:bg-[#343541] focus:text-[#f7f7f8]"
                  onSelect={(e) => {
                    e.preventDefault();
                    setApiKeySettingsOpen(true);
                  }}
                >
                  <Key className="mr-2 h-4 w-4" />
                  API Keys
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="focus:bg-[#343541] focus:text-[#f7f7f8]"
                  onSelect={(e) => {
                    e.preventDefault();
                    window.open("https://git.new/s-mcp", "_blank");
                  }}
                >
                  <Github className="mr-2 h-4 w-4" />
                  GitHub
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="focus:bg-[#343541] focus:text-[#f7f7f8]"
                  onSelect={(e) => e.preventDefault()}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center">
                      <Sparkles className="mr-2 h-4 w-4" />
                      Theme
                    </div>
                    <ThemeToggle className="h-6 w-6" />
                  </div>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <MCPServerManager
          servers={mcpServers}
          onServersChange={setMcpServers}
          selectedServers={selectedMcpServers}
          onSelectedServersChange={setSelectedMcpServers}
          open={mcpSettingsOpen}
          onOpenChange={setMcpSettingsOpen}
        />

        <ApiKeyManager
          open={apiKeySettingsOpen}
          onOpenChange={setApiKeySettingsOpen}
        />
      </SidebarFooter>

      <Dialog
        open={editUserIdOpen}
        onOpenChange={(open) => {
          setEditUserIdOpen(open);
          if (open) {
            setNewUserId(userId);
          }
        }}
      >
        <DialogContent className="sm:max-w-[400px] bg-[#1f1f23] border-[#2c2c2d]">
          <DialogHeader>
            <DialogTitle className="text-[#f7f7f8]">Edit User ID</DialogTitle>
            <DialogDescription className="text-[#9ca3af]">
              Update your user ID for chat synchronization. This will affect
              which chats are visible to you.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="userId" className="text-[#e5e7eb]">User ID</Label>
              <Input
                id="userId"
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                placeholder="Enter your user ID"
                className="bg-[#2c2d32] border-[#3f4046] text-[#e5e7eb]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUserIdOpen(false)} className="border-[#3f4046] text-[#e5e7eb] hover:bg-[#343541]">
              Cancel
            </Button>
            <Button onClick={handleUpdateUserId} className="bg-primary hover:bg-primary/90">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}
