"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  ServerIcon,
  Search,
  Dna,
  FlaskConical,
  PillBottle,
  Microscope,
  Database,
  Beaker,
  Brain,
  ArrowRight,
  Zap,
  Globe,
  Activity,
} from "lucide-react";
import { Button } from "./ui/button";
import type { modelID } from "@/ai/providers";
import { modelDetails } from "@/ai/providers";

interface ServerStatusCounts {
  total: number;
  online: number;
  connecting: number;
  error: number;
}

interface GuidedDiscoveryProps {
  selectedModel: modelID;
  serverStatusCounts: ServerStatusCounts;
  onOpenServerManager: () => void;
  onSendQuery: (query: string) => void;
}

// Quick start queries for bioinformatics
const quickStartQueries = [
  {
    icon: Dna,
    title: "Gene Expression",
    query: "What genes are associated with breast cancer and what are their expression patterns?",
    gradient: "from-blue-500/20 to-cyan-500/20",
    iconColor: "text-blue-500",
  },
  {
    icon: PillBottle,
    title: "Drug Targets",
    query: "Find drug targets for Type 2 Diabetes with high druggability scores",
    gradient: "from-purple-500/20 to-pink-500/20",
    iconColor: "text-purple-500",
  },
  {
    icon: FlaskConical,
    title: "Clinical Trials",
    query: "Search for active Phase 3 clinical trials for KRAS inhibitors in lung cancer",
    gradient: "from-amber-500/20 to-orange-500/20",
    iconColor: "text-amber-500",
  },
  {
    icon: Microscope,
    title: "Protein Structure",
    query: "Get the protein structure for human TP53 and analyze its functional domains",
    gradient: "from-emerald-500/20 to-teal-500/20",
    iconColor: "text-emerald-500",
  },
];

// MCP Server showcase
const serverShowcase = [
  {
    name: "OpenTargets",
    description: "Drug target associations",
    icon: Brain,
    color: "text-blue-500",
  },
  {
    name: "UniProt",
    description: "Protein sequences & function",
    icon: Dna,
    color: "text-purple-500",
  },
  {
    name: "ClinicalTrials",
    description: "Clinical trial data",
    icon: FlaskConical,
    color: "text-amber-500",
  },
  {
    name: "RCSB PDB",
    description: "Protein structures",
    icon: Database,
    color: "text-emerald-500",
  },
  {
    name: "CIViC",
    description: "Clinical variants",
    icon: Beaker,
    color: "text-rose-500",
  },
  {
    name: "Entrez",
    description: "NCBI databases",
    icon: Globe,
    color: "text-cyan-500",
  },
];

export function GuidedDiscovery({
  selectedModel,
  serverStatusCounts,
  onOpenServerManager,
  onSendQuery,
}: GuidedDiscoveryProps) {
  const modelInfo = modelDetails[selectedModel];
  const hasServers = serverStatusCounts.total > 0;
  const hasOnlineServers = serverStatusCounts.online > 0;

  return (
    <div className="flex h-full items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-3xl space-y-8"
      >
        {/* Hero Section */}
        <div className="text-center space-y-4">
          {/* Animated gradient background */}
          <div className="relative inline-flex">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary/30 via-purple-500/30 to-pink-500/30 blur-2xl animate-pulse" />
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 border border-primary/20"
            >
              <Sparkles className="h-8 w-8 text-primary" />
            </motion.div>
          </div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent"
          >
            Bio MCP Chat
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-sm text-muted-foreground max-w-md mx-auto"
          >
            {modelInfo && (
              <span className="inline-flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-primary" />
                <span>{modelInfo.name}</span>
                {hasServers && (
                  <>
                    <span className="text-border">·</span>
                    <Activity className="h-3.5 w-3.5 text-success" />
                    <span>{serverStatusCounts.online}/{serverStatusCounts.total} servers online</span>
                  </>
                )}
              </span>
            )}
          </motion.p>
        </div>

        {/* Quick Start Cards - Only show if we have servers */}
        {hasOnlineServers && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="space-y-3"
          >
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">
              Quick Start
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {quickStartQueries.map((item, index) => (
                <motion.button
                  key={item.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + index * 0.1 }}
                  onClick={() => onSendQuery(item.query)}
                  className={cn(
                    "group relative text-left p-4 rounded-xl border border-border",
                    "bg-gradient-to-br",
                    item.gradient,
                    "hover:border-primary/30 transition-all duration-300",
                    "hover:shadow-lg hover:shadow-primary/5"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center",
                      "bg-background/80 border border-border/50"
                    )}>
                      <item.icon className={cn("h-4 w-4", item.iconColor)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-foreground">
                          {item.title}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {item.query}
                      </p>
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* No Servers State */}
        {!hasServers && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="relative rounded-2xl border border-border bg-gradient-to-br from-muted/50 to-muted/30 p-6"
          >
            {/* Decorative elements */}
            <div className="absolute top-4 right-4 opacity-10">
              <ServerIcon className="h-24 w-24" />
            </div>

            <div className="relative space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <ServerIcon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Connect to MCP Servers</h3>
                  <p className="text-xs text-muted-foreground">Access bioinformatics databases</p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                MCP servers provide access to biological databases like UniProt, OpenTargets,
                ClinicalTrials.gov, and more. Connect servers to unlock powerful research capabilities.
              </p>

              <Button onClick={onOpenServerManager} className="gap-2">
                <ServerIcon className="h-4 w-4" />
                Connect Servers
              </Button>
            </div>
          </motion.div>
        )}

        {/* MCP Server Showcase */}
        {!hasServers && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="space-y-3"
          >
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">
              Available MCP Servers
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {serverShowcase.map((server, index) => (
                <motion.div
                  key={server.name}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6 + index * 0.05 }}
                  className="rounded-lg border border-border bg-card/50 p-3 text-center"
                >
                  <server.icon className={cn("h-5 w-5 mx-auto mb-1.5", server.color)} />
                  <div className="text-xs font-medium text-foreground">{server.name}</div>
                  <div className="text-[10px] text-muted-foreground">{server.description}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Servers Connecting State */}
        {hasServers && !hasOnlineServers && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="rounded-xl border border-border bg-muted/30 p-4 text-center"
          >
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              <span>Connecting to {serverStatusCounts.total} server{serverStatusCounts.total > 1 ? 's' : ''}...</span>
            </div>
          </motion.div>
        )}

        {/* Tip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="text-center"
        >
          <p className="text-xs text-muted-foreground">
            <span className="opacity-60">Tip:</span>{" "}
            <span>Type <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">/</kbd> to access slash commands</span>
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
