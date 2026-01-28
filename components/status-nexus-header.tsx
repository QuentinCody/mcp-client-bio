"use client";

import { type modelID, modelDetails } from "@/ai/providers";
import { NeuralPalettePicker } from "@/components/neural-palette-picker";
import { CodeModeToggle } from "@/components/code-mode-toggle";
import { TokenIndicator } from "@/components/token-indicator";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import {
  Loader2,
  Plus,
  ServerIcon,
  Download,
  FileJson,
  FileText,
  List,
  Activity,
  Zap,
  Code2,
  Bell,
  ChevronDown,
  Sparkles,
  Brain,
  Cpu,
  CircleDot,
  AlertCircle,
  CheckCircle2,
  Clock,
  Radio,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect } from "react";

interface ServerStatusCounts {
  total: number;
  online: number;
  connecting: number;
  error: number;
}

interface ChatHeaderProps {
  selectedModel: modelID;
  setSelectedModel: (model: modelID) => void;
  onNewChat: () => void;
  onOpenServerManager: () => void;
  serverStatusCounts: ServerStatusCounts;
  status: "error" | "submitted" | "streaming" | "ready";
  chatId?: string;
  onExportJSON?: () => void;
  onExportMarkdown?: () => void;
  onOpenBatchMode?: () => void;
}

// Status segment component
const StatusSegment = ({
  icon: Icon,
  label,
  value,
  status,
  onClick,
  className,
}: {
  icon: React.ElementType;
  label: string;
  value: string | React.ReactNode;
  status?: "active" | "warning" | "error" | "idle";
  onClick?: () => void;
  className?: string;
}) => {
  const statusStyles = {
    active: {
      bg: "bg-primary/10",
      border: "border-primary/30",
      text: "text-primary",
      icon: "text-primary",
      glow: "shadow-[0_0_10px_rgba(96,165,250,0.15)]",
    },
    warning: {
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      text: "text-amber-500",
      icon: "text-amber-500",
      glow: "shadow-[0_0_10px_rgba(245,158,11,0.15)]",
    },
    error: {
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      text: "text-red-500",
      icon: "text-red-500",
      glow: "shadow-[0_0_10px_rgba(239,68,68,0.15)]",
    },
    idle: {
      bg: "bg-muted/50",
      border: "border-border",
      text: "text-muted-foreground",
      icon: "text-muted-foreground",
      glow: "",
    },
  };

  const style = statusStyles[status || "idle"];

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-300",
        style.bg,
        style.border,
        style.glow,
        onClick && "cursor-pointer hover:brightness-110",
        !onClick && "cursor-default",
        className
      )}
    >
      <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", style.icon)} />
      <div className="flex flex-col items-start">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70">
          {label}
        </span>
        <span className={cn("text-xs font-medium leading-tight", style.text)}>
          {value}
        </span>
      </div>
    </motion.button>
  );
};

// Activity indicator with animated states
const ActivityIndicator = ({
  status,
}: {
  status: "error" | "submitted" | "streaming" | "ready";
}) => {
  const config = {
    streaming: {
      icon: Radio,
      label: "Streaming",
      color: "text-primary",
      bgColor: "bg-primary/20",
      animate: true,
    },
    submitted: {
      icon: Brain,
      label: "Thinking",
      color: "text-amber-500",
      bgColor: "bg-amber-500/20",
      animate: true,
    },
    error: {
      icon: AlertCircle,
      label: "Error",
      color: "text-red-500",
      bgColor: "bg-red-500/20",
      animate: false,
    },
    ready: {
      icon: CheckCircle2,
      label: "Ready",
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/20",
      animate: false,
    },
  };

  const { icon: Icon, label, color, bgColor, animate } = config[status];

  return (
    <div className="flex items-center gap-2">
      <div className={cn("relative p-1.5 rounded-full", bgColor)}>
        {animate && (
          <motion.div
            className={cn("absolute inset-0 rounded-full", bgColor)}
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        <Icon className={cn("h-3.5 w-3.5 relative z-10", color)} />
      </div>
      <span className={cn("text-xs font-medium", color)}>{label}</span>
    </div>
  );
};

// Server health mini indicator
const ServerHealthIndicator = ({
  counts,
  onClick,
}: {
  counts: ServerStatusCounts;
  onClick: () => void;
}) => {
  const { total, online, connecting, error } = counts;

  if (total === 0) {
    return (
      <StatusSegment
        icon={ServerIcon}
        label="Servers"
        value="None"
        status="idle"
        onClick={onClick}
      />
    );
  }

  const status = error > 0 ? "error" : connecting > 0 ? "warning" : online > 0 ? "active" : "idle";

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-300",
        status === "active" && "bg-emerald-500/10 border-emerald-500/30",
        status === "warning" && "bg-amber-500/10 border-amber-500/30",
        status === "error" && "bg-red-500/10 border-red-500/30",
        status === "idle" && "bg-muted/50 border-border"
      )}
    >
      <ServerIcon className={cn(
        "h-3.5 w-3.5",
        status === "active" && "text-emerald-500",
        status === "warning" && "text-amber-500",
        status === "error" && "text-red-500",
        status === "idle" && "text-muted-foreground"
      )} />
      <div className="flex items-center gap-1.5">
        {/* Online indicator */}
        <div className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="text-xs font-medium text-emerald-500">{online}</span>
        </div>

        {/* Connecting indicator */}
        {connecting > 0 && (
          <div className="flex items-center gap-1">
            <motion.span
              className="h-1.5 w-1.5 rounded-full bg-amber-500"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
            <span className="text-xs font-medium text-amber-500">{connecting}</span>
          </div>
        )}

        {/* Error indicator */}
        {error > 0 && (
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            <span className="text-xs font-medium text-red-500">{error}</span>
          </div>
        )}

        <span className="text-[10px] text-muted-foreground">/ {total}</span>
      </div>
    </motion.button>
  );
};

export function StatusNexusHeader({
  selectedModel,
  setSelectedModel,
  onNewChat,
  onOpenServerManager,
  serverStatusCounts,
  status,
  chatId,
  onExportJSON,
  onExportMarkdown,
  onOpenBatchMode,
}: ChatHeaderProps) {
  const [showNotification, setShowNotification] = useState(false);
  const modelInfo = modelDetails[selectedModel];

  // Show notification dot when there's an error
  useEffect(() => {
    if (serverStatusCounts.error > 0) {
      setShowNotification(true);
    }
  }, [serverStatusCounts.error]);

  return (
    <header className="sticky top-0 z-30">
      {/* Glassmorphic background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/95 via-background/90 to-background/80 backdrop-blur-xl border-b border-border/40" />

      {/* Subtle top highlight */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

      <div className="relative flex h-14 items-center justify-between gap-3 px-4">
        {/* Left section: Model picker and activity */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Model segment */}
          <NeuralPalettePicker
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            variant="inline"
            className="flex-shrink-0"
          />

          {/* Activity indicator */}
          <AnimatePresence mode="wait">
            <motion.div
              key={status}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              transition={{ duration: 0.2 }}
              className="hidden sm:flex"
            >
              <ActivityIndicator status={status} />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Center section: Segmented status bar (hidden on mobile) */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-xl bg-muted/30 border border-border/50">
          {/* Token usage */}
          <TokenIndicator variant="compact" chatId={chatId} />

          {/* Divider */}
          <div className="h-4 w-px bg-border/50" />

          {/* Code mode */}
          <CodeModeToggle />
        </div>

        {/* Right section: Actions */}
        <div className="flex items-center gap-2">
          {/* Mobile-only compact indicators */}
          <div className="flex sm:hidden items-center gap-1.5">
            <AnimatePresence mode="wait">
              <motion.div
                key={status}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className={cn(
                  "h-2 w-2 rounded-full",
                  status === "streaming" && "bg-primary animate-pulse",
                  status === "submitted" && "bg-amber-500 animate-pulse",
                  status === "error" && "bg-red-500",
                  status === "ready" && "bg-emerald-500"
                )}
              />
            </AnimatePresence>
          </div>

          {/* Server health indicator */}
          <ServerHealthIndicator
            counts={serverStatusCounts}
            onClick={onOpenServerManager}
          />

          {/* Quick actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="relative flex items-center justify-center h-8 w-8 rounded-lg border border-border bg-card/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Plus className="h-4 w-4" />
                {/* Notification dot */}
                {showNotification && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 border-2 border-background"
                  />
                )}
              </motion.button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onNewChat}>
                <Plus className="mr-2 h-4 w-4" />
                New Chat
              </DropdownMenuItem>

              {onOpenBatchMode && (
                <DropdownMenuItem onClick={onOpenBatchMode}>
                  <List className="mr-2 h-4 w-4" />
                  Batch Mode
                </DropdownMenuItem>
              )}

              {chatId && (onExportJSON || onExportMarkdown) && (
                <>
                  <DropdownMenuSeparator />
                  {onExportJSON && (
                    <DropdownMenuItem onClick={onExportJSON}>
                      <FileJson className="mr-2 h-4 w-4" />
                      Export JSON
                    </DropdownMenuItem>
                  )}
                  {onExportMarkdown && (
                    <DropdownMenuItem onClick={onExportMarkdown}>
                      <FileText className="mr-2 h-4 w-4" />
                      Export Markdown
                    </DropdownMenuItem>
                  )}
                </>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onOpenServerManager}>
                <ServerIcon className="mr-2 h-4 w-4" />
                Manage Servers
                {serverStatusCounts.error > 0 && (
                  <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                    {serverStatusCounts.error}
                  </span>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

// Export as ChatHeader for backward compatibility
export { StatusNexusHeader as ChatHeader };
