"use client";

import {
  MODELS,
  modelDetails,
  type modelID,
  defaultModel,
} from "@/ai/providers";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Zap,
  Info,
  Bolt,
  Code,
  Brain,
  Lightbulb,
  Image,
  Gauge,
  Rocket,
  Bot,
  ChartBar,
  PenLine,
  Wrench,
  Headphones,
  HeartPulse,
  Sigma,
  FlaskConical,
  ScrollText,
  ListChecks,
  Tag,
  Scale,
  Activity,
  Clock,
  TrendingUp,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";

type NeuralPaletteVariant = "floating" | "inline";

interface NeuralPalettePickerProps {
  selectedModel: modelID;
  setSelectedModel: (model: modelID) => void;
  variant?: NeuralPaletteVariant;
  className?: string;
  /** Optional performance stats for models */
  modelStats?: Record<string, { avgResponseTime?: number; totalCalls?: number; successRate?: number }>;
}

// Provider-specific gradient styles - "Neural Signatures"
const providerStyles: Record<string, {
  gradient: string;
  border: string;
  glow: string;
  icon: string;
  pattern: string;
}> = {
  OpenAI: {
    gradient: "from-emerald-500/20 via-emerald-400/10 to-teal-500/20",
    border: "border-emerald-500/30 hover:border-emerald-400/50",
    glow: "shadow-emerald-500/20",
    icon: "text-emerald-500",
    pattern: "bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.1)_1px,transparent_1px)] bg-[length:8px_8px]",
  },
  Anthropic: {
    gradient: "from-amber-500/20 via-orange-400/10 to-rose-500/20",
    border: "border-amber-500/30 hover:border-amber-400/50",
    glow: "shadow-amber-500/20",
    icon: "text-amber-500",
    pattern: "bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(245,158,11,0.05)_3px,rgba(245,158,11,0.05)_6px)]",
  },
  Google: {
    gradient: "from-blue-500/20 via-purple-400/10 to-pink-500/20",
    border: "border-blue-500/30 hover:border-purple-400/50",
    glow: "shadow-blue-500/20",
    icon: "text-blue-500",
    pattern: "bg-[conic-gradient(from_0deg,rgba(59,130,246,0.05),rgba(168,85,247,0.05),rgba(236,72,153,0.05),rgba(59,130,246,0.05))]",
  },
  Groq: {
    gradient: "from-cyan-500/20 via-blue-400/10 to-indigo-500/20",
    border: "border-cyan-500/30 hover:border-cyan-400/50",
    glow: "shadow-cyan-500/20",
    icon: "text-cyan-500",
    pattern: "bg-[linear-gradient(90deg,transparent_0%,rgba(6,182,212,0.1)_25%,transparent_50%,rgba(6,182,212,0.1)_75%,transparent_100%)] animate-shimmer",
  },
  XAI: {
    gradient: "from-violet-500/20 via-purple-400/10 to-fuchsia-500/20",
    border: "border-violet-500/30 hover:border-violet-400/50",
    glow: "shadow-violet-500/20",
    icon: "text-violet-500",
    pattern: "bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.1)_0%,transparent_70%)]",
  },
};

// Animated capability badge component
const CapabilityBadge = ({
  capability,
  animated = false
}: {
  capability: string;
  animated?: boolean;
}) => {
  const getCapabilityStyle = (cap: string) => {
    switch (cap.toLowerCase()) {
      case "reasoning":
      case "thinking":
        return {
          bg: "bg-purple-500/10 border-purple-500/20",
          text: "text-purple-400",
          animation: animated ? "animate-pulse" : "",
        };
      case "fast":
      case "rapid":
      case "efficient":
        return {
          bg: "bg-amber-500/10 border-amber-500/20",
          text: "text-amber-400",
          animation: animated ? "animate-[shimmer_2s_ease-in-out_infinite]" : "",
        };
      case "vision":
        return {
          bg: "bg-indigo-500/10 border-indigo-500/20",
          text: "text-indigo-400",
          animation: animated ? "animate-[pulse_3s_ease-in-out_infinite]" : "",
        };
      case "coding":
      case "code":
        return {
          bg: "bg-blue-500/10 border-blue-500/20",
          text: "text-blue-400",
          animation: "",
        };
      case "tools":
      case "agentic":
        return {
          bg: "bg-cyan-500/10 border-cyan-500/20",
          text: "text-cyan-400",
          animation: "",
        };
      default:
        return {
          bg: "bg-slate-500/10 border-slate-500/20",
          text: "text-slate-400",
          animation: "",
        };
    }
  };

  const getCapabilityIcon = (cap: string) => {
    switch (cap.toLowerCase()) {
      case "code":
      case "coding":
        return <Code className="h-2.5 w-2.5" />;
      case "reasoning":
      case "analysis":
      case "thinking":
        return <Brain className="h-2.5 w-2.5" />;
      case "research":
        return <Lightbulb className="h-2.5 w-2.5" />;
      case "vision":
        return <Image className="h-2.5 w-2.5" />;
      case "fast":
      case "rapid":
        return <Bolt className="h-2.5 w-2.5" />;
      case "efficient":
        return <Gauge className="h-2.5 w-2.5" />;
      case "agentic":
        return <Bot className="h-2.5 w-2.5" />;
      case "tools":
        return <Wrench className="h-2.5 w-2.5" />;
      case "writing":
        return <PenLine className="h-2.5 w-2.5" />;
      case "audio":
        return <Headphones className="h-2.5 w-2.5" />;
      case "health":
        return <HeartPulse className="h-2.5 w-2.5" />;
      case "math":
        return <Sigma className="h-2.5 w-2.5" />;
      case "stem":
        return <FlaskConical className="h-2.5 w-2.5" />;
      case "long context":
        return <ScrollText className="h-2.5 w-2.5" />;
      case "summarization":
        return <ListChecks className="h-2.5 w-2.5" />;
      case "classification":
        return <Tag className="h-2.5 w-2.5" />;
      case "balanced":
        return <Scale className="h-2.5 w-2.5" />;
      default:
        return <Info className="h-2.5 w-2.5" />;
    }
  };

  const style = getCapabilityStyle(capability);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium border transition-all duration-300",
        style.bg,
        style.text,
        style.animation
      )}
    >
      {getCapabilityIcon(capability)}
      <span className="capitalize">{capability}</span>
    </span>
  );
};

// Model card component with neural signature
const ModelCard = ({
  modelId,
  details,
  isSelected,
  isHovered,
  onHover,
  stats,
}: {
  modelId: modelID;
  details: typeof modelDetails[modelID];
  isSelected: boolean;
  isHovered: boolean;
  onHover: (id: modelID | null) => void;
  stats?: { avgResponseTime?: number; totalCalls?: number; successRate?: number };
}) => {
  const providerStyle = providerStyles[details.provider] || providerStyles.OpenAI;

  return (
    <div
      onMouseEnter={() => onHover(modelId)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        "relative group cursor-pointer rounded-xl p-3 transition-all duration-200 border",
        providerStyle.border,
        isSelected && `bg-gradient-to-br ${providerStyle.gradient} ${providerStyle.glow} shadow-lg`,
        isHovered && !isSelected && `bg-gradient-to-br ${providerStyle.gradient} opacity-70`,
        !isSelected && !isHovered && "bg-card/50 hover:bg-card"
      )}
    >
      {/* Pattern overlay */}
      <div className={cn("absolute inset-0 rounded-xl opacity-50", providerStyle.pattern)} />

      {/* Content */}
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className={cn("h-4 w-4", providerStyle.icon)} />
            <span className="font-semibold text-sm text-foreground">{details.name}</span>
          </div>
          {isSelected && (
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          )}
        </div>

        <div className="text-[10px] text-muted-foreground mb-2">
          {details.provider}
        </div>

        {/* Capability badges */}
        <div className="flex flex-wrap gap-1 mb-2">
          {details.capabilities.slice(0, 3).map((cap) => (
            <CapabilityBadge key={cap} capability={cap} animated={isSelected || isHovered} />
          ))}
          {details.capabilities.length > 3 && (
            <span className="text-[9px] text-muted-foreground px-1.5 py-0.5">
              +{details.capabilities.length - 3}
            </span>
          )}
        </div>

        {/* Stats row - shown on hover or selected */}
        {(isHovered || isSelected) && stats && (
          <div className="flex items-center gap-3 pt-2 border-t border-border/50 mt-2 animate-in fade-in duration-200">
            {stats.avgResponseTime !== undefined && (
              <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <Clock className="h-2.5 w-2.5" />
                <span>{stats.avgResponseTime.toFixed(0)}ms</span>
              </div>
            )}
            {stats.totalCalls !== undefined && (
              <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <Activity className="h-2.5 w-2.5" />
                <span>{stats.totalCalls} calls</span>
              </div>
            )}
            {stats.successRate !== undefined && (
              <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <TrendingUp className="h-2.5 w-2.5" />
                <span>{(stats.successRate * 100).toFixed(0)}%</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const NeuralPalettePicker = ({
  selectedModel,
  setSelectedModel,
  variant = "floating",
  className,
  modelStats,
}: NeuralPalettePickerProps) => {
  const [hoveredModel, setHoveredModel] = useState<modelID | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Ensure we always have a valid model ID
  const validModelId = MODELS.includes(selectedModel)
    ? selectedModel
    : defaultModel;

  // If the selected model is invalid, update it to the default
  useEffect(() => {
    if (selectedModel !== validModelId) {
      setSelectedModel(validModelId as modelID);
    }
  }, [selectedModel, validModelId, setSelectedModel]);

  // Group models by provider
  const groupedModels = useMemo(() => {
    const groups: Array<{ provider: string; models: modelID[] }> = [];
    const indexByProvider = new Map<string, number>();

    MODELS.forEach((id) => {
      const modelId = id as modelID;
      const provider = modelDetails[modelId]?.provider ?? "Other";
      const existingIndex = indexByProvider.get(provider);

      if (existingIndex === undefined) {
        indexByProvider.set(provider, groups.length);
        groups.push({ provider, models: [modelId] });
      } else {
        groups[existingIndex].models.push(modelId);
      }
    });

    return groups;
  }, []);

  // Get provider icon
  const getProviderIcon = (provider: string) => {
    const style = providerStyles[provider] || providerStyles.OpenAI;
    switch (provider.toLowerCase()) {
      case "anthropic":
        return <Sparkles className={cn("h-3.5 w-3.5", style.icon)} />;
      case "openai":
        return <Zap className={cn("h-3.5 w-3.5", style.icon)} />;
      case "google":
        return <Sparkles className={cn("h-3.5 w-3.5", style.icon)} />;
      case "groq":
        return <Bolt className={cn("h-3.5 w-3.5", style.icon)} />;
      case "xai":
        return <Rocket className={cn("h-3.5 w-3.5", style.icon)} />;
      default:
        return <Info className={cn("h-3.5 w-3.5", style.icon)} />;
    }
  };

  const handleModelChange = (modelId: string) => {
    if (MODELS.includes(modelId)) {
      setSelectedModel(modelId as modelID);
    }
  };

  const isInline = variant === "inline";
  const currentDetails = modelDetails[validModelId];
  const currentProviderStyle = providerStyles[currentDetails.provider] || providerStyles.OpenAI;

  if (!isMounted) {
    return (
      <div
        className={cn(
          isInline ? "relative" : "absolute bottom-2 left-2 z-10",
          className
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        isInline ? "relative" : "absolute bottom-2 left-2 z-10",
        className
      )}
    >
      <Select
        value={validModelId}
        onValueChange={handleModelChange}
        onOpenChange={setIsOpen}
        defaultValue={validModelId}
      >
        <SelectTrigger
          className={cn(
            "px-3 h-9 rounded-xl group border transition-all duration-300",
            "ring-offset-background focus:ring-2 focus:ring-offset-2",
            currentProviderStyle.border,
            `bg-gradient-to-r ${currentProviderStyle.gradient}`,
            "hover:shadow-md",
            currentProviderStyle.glow,
            "focus:ring-primary/30",
            isInline ? "w-full max-w-none" : "w-56"
          )}
        >
          <SelectValue placeholder="Select model">
            <div className="flex items-center gap-2 min-w-0">
              {getProviderIcon(currentDetails.provider)}
              <span className="font-medium text-sm truncate text-foreground">
                {currentDetails.name}
              </span>
              {currentDetails.capabilities.length > 0 && (
                <span className={cn(
                  "hidden md:inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border",
                  "bg-background/50 border-border/50 text-muted-foreground"
                )}>
                  {currentDetails.capabilities[0]}
                </span>
              )}
            </div>
          </SelectValue>
        </SelectTrigger>

        <SelectContent
          align="start"
          className={cn(
            "bg-card/95 backdrop-blur-xl text-foreground border border-border rounded-2xl overflow-hidden p-0 shadow-2xl",
            "w-[320px] sm:w-[420px] md:w-[600px]"
          )}
        >
          <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] max-h-[70vh]">
            {/* Model selector column */}
            <div className="md:border-r border-border bg-background/50 overflow-y-auto max-h-[70vh] p-2">
              {groupedModels.map((group, groupIdx) => (
                <SelectGroup key={group.provider} className="mb-3">
                  <SelectLabel className={cn(
                    "px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-2",
                    providerStyles[group.provider]?.icon || "text-muted-foreground"
                  )}>
                    {getProviderIcon(group.provider)}
                    {group.provider}
                  </SelectLabel>
                  <div className="space-y-1">
                    {group.models.map((modelId) => (
                      <SelectItem
                        key={modelId}
                        value={modelId}
                        onMouseEnter={() => setHoveredModel(modelId)}
                        onMouseLeave={() => setHoveredModel(null)}
                        className={cn(
                          "!p-0 cursor-pointer rounded-xl overflow-hidden",
                          "data-[highlighted]:bg-transparent focus:bg-transparent"
                        )}
                      >
                        <ModelCard
                          modelId={modelId}
                          details={modelDetails[modelId]}
                          isSelected={validModelId === modelId}
                          isHovered={hoveredModel === modelId}
                          onHover={setHoveredModel}
                          stats={modelStats?.[modelId]}
                        />
                      </SelectItem>
                    ))}
                  </div>
                </SelectGroup>
              ))}
            </div>

            {/* Model details column - hidden on mobile */}
            <div className="hidden md:flex flex-col p-4 bg-gradient-to-br from-background to-muted/30">
              {(() => {
                const displayModelId = hoveredModel || validModelId;
                const displayDetails = modelDetails[displayModelId];
                const displayProviderStyle = providerStyles[displayDetails.provider] || providerStyles.OpenAI;

                return (
                  <div className="animate-in fade-in duration-300">
                    {/* Header with neural signature */}
                    <div className={cn(
                      "rounded-xl p-4 mb-4 border relative overflow-hidden",
                      displayProviderStyle.border,
                      `bg-gradient-to-br ${displayProviderStyle.gradient}`
                    )}>
                      <div className={cn("absolute inset-0 opacity-30", displayProviderStyle.pattern)} />
                      <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-2">
                          <div className={cn(
                            "h-10 w-10 rounded-lg flex items-center justify-center",
                            "bg-background/80 border",
                            displayProviderStyle.border
                          )}>
                            {getProviderIcon(displayDetails.provider)}
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-foreground">
                              {displayDetails.name}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {displayDetails.provider}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-foreground/80 leading-relaxed mb-4">
                      {displayDetails.description}
                    </p>

                    {/* All capabilities */}
                    <div className="mb-4">
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                        Capabilities
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {displayDetails.capabilities.map((cap) => (
                          <CapabilityBadge key={cap} capability={cap} animated />
                        ))}
                      </div>
                    </div>

                    {/* API Version */}
                    <div className="rounded-lg bg-muted/50 p-3 border border-border/50">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">API Version</span>
                        <code className="font-mono text-[10px] bg-background px-2 py-0.5 rounded border border-border">
                          {displayDetails.apiVersion}
                        </code>
                      </div>
                    </div>

                    {/* Stats if available */}
                    {modelStats?.[displayModelId] && (
                      <div className="mt-4 rounded-lg bg-muted/50 p-3 border border-border/50">
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                          Performance Stats
                        </h4>
                        <div className="grid grid-cols-3 gap-2">
                          {modelStats[displayModelId].avgResponseTime !== undefined && (
                            <div className="text-center">
                              <div className="text-lg font-bold text-foreground">
                                {modelStats[displayModelId].avgResponseTime?.toFixed(0)}
                              </div>
                              <div className="text-[9px] text-muted-foreground">ms avg</div>
                            </div>
                          )}
                          {modelStats[displayModelId].totalCalls !== undefined && (
                            <div className="text-center">
                              <div className="text-lg font-bold text-foreground">
                                {modelStats[displayModelId].totalCalls}
                              </div>
                              <div className="text-[9px] text-muted-foreground">calls</div>
                            </div>
                          )}
                          {modelStats[displayModelId].successRate !== undefined && (
                            <div className="text-center">
                              <div className="text-lg font-bold text-foreground">
                                {((modelStats[displayModelId].successRate || 0) * 100).toFixed(0)}%
                              </div>
                              <div className="text-[9px] text-muted-foreground">success</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </SelectContent>
      </Select>
    </div>
  );
};
