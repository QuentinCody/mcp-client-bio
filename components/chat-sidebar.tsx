"use client";

import { useState, useEffect } from "react";
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

export function ChatSidebar() {
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

  // Check if servers are locked
  useEffect(() => {
    setLocked(isServerLocked());
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

  // Initialize userId
  useEffect(() => {
    setUserId(getUserId());
  }, []);

  // Use TanStack Query to fetch chats
  const { chats, isLoading, deleteChat, refreshChats } = useChats(userId);

  // Start a new chat
  const handleNewChat = () => {
    router.push("/");
  };

  // Delete a chat
  const handleDeleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    deleteChat(chatId);

    // If we're currently on the deleted chat's page, navigate to home
    if (pathname === `/chat/${chatId}`) {
      router.push("/");
    }
  };

  // Get active MCP servers status
  const activeServersCount = selectedMcpServers.length;

  // Handle user ID update
  const handleUpdateUserId = () => {
    if (!newUserId.trim()) {
      toast.error("User ID cannot be empty");
      return;
    }

    updateUserId(newUserId.trim());
    setUserId(newUserId.trim());
    setEditUserIdOpen(false);
    toast.success("User ID updated successfully");

    // Refresh the page to reload chats with new user ID
    window.location.reload();
  };

  // Show loading state if user ID is not yet initialized
  if (!userId) {
    return null; // Or a loading spinner
  }

  // Create chat loading skeletons
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

  return (
    <Sidebar
      className="border-r border-[#2c2c2d] bg-[#202123] text-[#ececec]"
      collapsible="icon"
    >
      <SidebarHeader className="border-b border-[#2f2f2f] p-4">
        <div className="flex items-center justify-start">
          <div
            className={`flex items-center gap-2 ${
              isCollapsed ? "justify-center w-full" : ""
            }`}
          >
            <div
              className={`relative rounded-full bg-primary/70 flex items-center justify-center ${
                isCollapsed ? "size-5 p-3" : "size-6"
              }`}
            >
              <Image
                src="/scira.png"
                alt="Bio MCP Chat Logo"
                width={24}
                height={24}
                className="absolute transform scale-75"
                unoptimized
                quality={100}
              />
            </div>
            {!isCollapsed && (
              <div className="text-lg font-semibold text-[#f7f7f8]">
                Bio MCP
              </div>
            )}
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="flex flex-col h-[calc(100vh-8rem)]">
        <SidebarGroup className="flex-1 min-h-0">
          <SidebarGroupLabel
            className={cn(
              "px-4 text-xs font-semibold uppercase tracking-wider text-[#8b8f98]",
              isCollapsed ? "sr-only" : ""
            )}
          >
            Chats
          </SidebarGroupLabel>
          <SidebarGroupContent
            className={cn(
              "overflow-y-auto pt-1",
              isCollapsed ? "overflow-x-hidden" : ""
            )}
          >
            <SidebarMenu>
              {isLoading ? (
                renderChatSkeletons()
              ) : chats.length === 0 ? (
                <div
                  className={`flex items-center justify-center py-3 ${
                    isCollapsed ? "" : "px-4"
                  }`}
                >
                  {isCollapsed ? (
                    <div className="flex h-6 w-6 items-center justify-center rounded-md border border-border/50 bg-background/50">
                      <MessageSquare className="h-3 w-3 text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 w-full px-3 py-2 rounded-md border border-dashed border-border/50 bg-background/50">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground font-normal">
                        No conversations yet
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {chats.map((chat) => (
                    <motion.div
                      key={chat.id}
                      initial={{ opacity: 0, height: 0, y: -10 }}
                      animate={{ opacity: 1, height: "auto", y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <SidebarMenuItem>
                      <SidebarMenuButton
                          asChild
                          tooltip={isCollapsed ? chat.title : undefined}
                          data-active={pathname === `/chat/${chat.id}`}
                          className={cn(
                            "transition-all text-[#e5e7eb] hover:bg-[#343541] data-[active=true]:bg-[#2c2d32]"
                          )}
                        >
                          <Link
                            href={`/chat/${chat.id}`}
                            className="flex items-center justify-between w-full gap-1"
                          >
                            <div className="flex items-center min-w-0 overflow-hidden flex-1 pr-2">
                              <MessageSquare
                                className={cn(
                                  "h-4 w-4 flex-shrink-0",
                                  pathname === `/chat/${chat.id}`
                                    ? "text-[#f5f5f5]"
                                    : "text-[#9ca3af]"
                                )}
                              />
                              {!isCollapsed && (
                                <span
                                  className={cn(
                                    "ml-2 truncate text-sm",
                                    pathname === `/chat/${chat.id}`
                                      ? "font-medium text-[#f7f7f8]"
                                      : "text-[#d1d5db]"
                                  )}
                                  title={chat.title}
                                >
                                  {chat.title.length > 18
                                    ? `${chat.title.slice(0, 18)}...`
                                    : chat.title}
                                </span>
                              )}
                            </div>
                            {!isCollapsed && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 flex-shrink-0 text-[#9ca3af] hover:text-[#f7f7f8]"
                                onClick={(e) => handleDeleteChat(chat.id, e)}
                                title="Delete chat"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="relative my-0">
          <div className="absolute inset-x-0">
            <Separator className="w-full h-px bg-border/40" />
          </div>
        </div>

        <SidebarGroup className="flex-shrink-0">
          <SidebarGroupLabel
            className={cn(
              "px-4 pt-0 text-xs font-medium text-muted-foreground/80 uppercase tracking-wider",
              isCollapsed ? "sr-only" : ""
            )}
          >
            MCP Servers
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {!locked && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setMcpSettingsOpen(true)}
                    className={cn(
                      "flex w-full items-center gap-2 transition-all text-[#e5e7eb] hover:bg-[#343541]"
                    )}
                    tooltip={isCollapsed ? "MCP Servers" : undefined}
                  >
                    <ServerIcon
                      className={cn(
                        "h-4 w-4 flex-shrink-0",
                        activeServersCount > 0
                          ? "text-[#34d399]"
                          : "text-[#9ca3af]"
                      )}
                    />
                    {!isCollapsed && (
                      <span className="flex-grow text-sm text-[#d1d5db]">
                        MCP Servers
                      </span>
                    )}
                    {activeServersCount > 0 && !isCollapsed ? (
                      <Badge
                        variant="secondary"
                        className="ml-auto h-5 px-1.5 py-0 text-[10px] bg-[#343541] text-[#e5e7eb]"
                      >
                        {activeServersCount}
                      </Badge>
                    ) : activeServersCount > 0 && isCollapsed ? (
                      <SidebarMenuBadge className="bg-[#343541] text-[#e5e7eb]">
                        {activeServersCount}
                      </SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {locked && (
                <SidebarMenuItem>
                  <div className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-[#d1d5db]",
                    isCollapsed ? "justify-center" : ""
                  )}>
                    <ServerIcon
                      className={cn(
                        "h-4 w-4 flex-shrink-0",
                        activeServersCount > 0
                          ? "text-[#34d399]"
                          : "text-[#9ca3af]"
                      )}
                    />
                    {!isCollapsed && (
                      <span className="flex-grow text-sm text-[#d1d5db]">
                        MCP Servers
                      </span>
                    )}
                    {activeServersCount > 0 && !isCollapsed ? (
                      <Badge
                        variant="secondary"
                        className="ml-auto h-5 px-1.5 py-0 text-[10px] bg-[#343541] text-[#e5e7eb]"
                      >
                        {activeServersCount}
                      </Badge>
                    ) : activeServersCount > 0 && isCollapsed ? (
                      <SidebarMenuBadge className="bg-[#343541] text-[#e5e7eb]">
                        {activeServersCount}
                      </SidebarMenuBadge>
                    ) : null}
                  </div>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="mt-auto border-t border-[#2c2c2d] p-4">
        <div
          className={`flex flex-col ${isCollapsed ? "items-center" : ""} gap-3`}
        >
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              variant="default"
              className={cn(
                "w-full bg-[#343541] text-[#f7f7f8] hover:bg-[#3f414a]",
                isCollapsed ? "h-8 w-8 p-0" : ""
              )}
              onClick={handleNewChat}
              title={isCollapsed ? "New Chat" : undefined}
            >
              <PlusCircle className={`${isCollapsed ? "" : "mr-2"} h-4 w-4`} />
              {!isCollapsed && <span>New Chat</span>}
            </Button>
          </motion.div>

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              {isCollapsed ? (
                <Button
                  variant="ghost"
                  className="flex h-8 w-8 items-center justify-center p-0 text-[#e5e7eb] hover:bg-[#343541]"
                >
                  <Avatar className="h-6 w-6 rounded-lg bg-[#3a3c44]">
                    <AvatarFallback className="rounded-lg text-xs font-medium text-[#f5f5f5]">
                      {userId.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="h-10 w-full justify-between border border-[#2c2c2d] bg-transparent px-2 font-normal text-[#e5e7eb] shadow-none hover:bg-[#343541]"
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-7 w-7 rounded-lg bg-[#3a3c44]">
                      <AvatarFallback className="rounded-lg text-sm font-medium text-[#f5f5f5]">
                        {userId.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid text-left text-sm leading-tight text-[#e5e7eb]">
                      <span className="truncate font-medium text-[#f7f7f8]">
                        User ID
                      </span>
                      <span className="truncate text-xs text-[#9ca3af]">
                        {userId.substring(0, 16)}...
                      </span>
                    </div>
                  </div>
                  <ChevronsUpDown className="h-4 w-4 text-[#9ca3af]" />
                </Button>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-56 rounded-lg border border-[#2c2c2d] bg-[#1f1f23] text-[#e5e7eb]"
              side={isCollapsed ? "top" : "top"}
              align={isCollapsed ? "start" : "end"}
              sideOffset={8}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="h-8 w-8 rounded-lg bg-[#3a3c44]">
                    <AvatarFallback className="rounded-lg text-sm font-medium text-[#f5f5f5]">
                      {userId.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold text-[#f7f7f8]">
                      User ID
                    </span>
                    <span className="truncate text-xs text-[#9ca3af]">
                      {userId}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="focus:bg-[#343541] focus:text-[#f7f7f8]"
                  onSelect={(e) => {
                    e.preventDefault();
                    navigator.clipboard.writeText(userId);
                    toast.success("User ID copied to clipboard");
                  }}
                >
                  <Copy className="mr-2 h-4 w-4 hover:text-sidebar-accent" />
                  Copy User ID
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="focus:bg-[#343541] focus:text-[#f7f7f8]"
                  onSelect={(e) => {
                    e.preventDefault();
                    setEditUserIdOpen(true);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4 hover:text-sidebar-accent" />
                  Edit User ID
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {!locked && (
                  <DropdownMenuItem
                    className="focus:bg-[#343541] focus:text-[#f7f7f8]"
                    onSelect={(e) => {
                      e.preventDefault();
                      setMcpSettingsOpen(true);
                    }}
                  >
                    <Settings className="mr-2 h-4 w-4 hover:text-sidebar-accent" />
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
                  <Key className="mr-2 h-4 w-4 hover:text-sidebar-accent" />
                  API Keys
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="focus:bg-[#343541] focus:text-[#f7f7f8]"
                  onSelect={(e) => {
                    e.preventDefault();
                    window.open("https://git.new/s-mcp", "_blank");
                  }}
                >
                  <Github className="mr-2 h-4 w-4 hover:text-sidebar-accent" />
                  GitHub
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="focus:bg-[#343541] focus:text-[#f7f7f8]"
                  onSelect={(e) => e.preventDefault()}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center">
                      <Sparkles className="mr-2 h-4 w-4 hover:text-sidebar-accent" />
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
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Edit User ID</DialogTitle>
            <DialogDescription>
              Update your user ID for chat synchronization. This will affect
              which chats are visible to you.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="userId">User ID</Label>
              <Input
                id="userId"
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                placeholder="Enter your user ID"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUserIdOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateUserId}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sidebar>
  );
}
