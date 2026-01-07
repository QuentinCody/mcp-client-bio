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
  SelectSeparator,
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
} from "lucide-react";
import { useState, useEffect } from "react";

type ModelPickerVariant = "floating" | "inline";

interface ModelPickerProps {
  selectedModel: modelID;
  setSelectedModel: (model: modelID) => void;
  variant?: ModelPickerVariant;
  className?: string;
}

export const ModelPicker = ({
  selectedModel,
  setSelectedModel,
  variant = "floating",
  className,
}: ModelPickerProps) => {
  const [hoveredModel, setHoveredModel] = useState<modelID | null>(null);
  const [isMounted, setIsMounted] = useState(false);

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

  // Function to get the appropriate icon for each provider
  const getProviderIcon = (provider: string) => {
    switch (provider.toLowerCase()) {
      case "anthropic":
        return <Sparkles className="h-3 w-3 text-orange-600" />;
      case "openai":
        return <Zap className="h-3 w-3 text-green-500" />;
      case "google":
        return <Zap className="h-3 w-3 text-red-500" />;
      case "groq":
        return <Sparkles className="h-3 w-3 text-blue-500" />;
      case "xai":
        return <Sparkles className="h-3 w-3 text-yellow-500" />;
      default:
        return <Info className="h-3 w-3 text-blue-500" />;
    }
  };

  // Function to get capability icon
  const getCapabilityIcon = (capability: string) => {
    switch (capability.toLowerCase()) {
      case "code":
        return <Code className="h-2.5 w-2.5" />;
      case "reasoning":
        return <Brain className="h-2.5 w-2.5" />;
      case "analysis":
        return <ChartBar className="h-2.5 w-2.5" />;
      case "thinking":
        return <Brain className="h-2.5 w-2.5" />;
      case "writing":
        return <PenLine className="h-2.5 w-2.5" />;
      case "tools":
        return <Wrench className="h-2.5 w-2.5" />;
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
      case "research":
        return <Lightbulb className="h-2.5 w-2.5" />;
      case "vision":
        return <Image className="h-2.5 w-2.5" />; {/* eslint-disable-line jsx-a11y/alt-text */}
      case "fast":
      case "rapid":
        return <Bolt className="h-2.5 w-2.5" />;
      case "efficient":
      case "compact":
        return <Gauge className="h-2.5 w-2.5" />;
      case "creative":
        return <Rocket className="h-2.5 w-2.5" />;
      case "balance":
      case "balanced":
        return <Scale className="h-2.5 w-2.5" />;
      case "agentic":
        return <Bot className="h-2.5 w-2.5" />;
      default:
        return <Info className="h-2.5 w-2.5" />;
    }
  };

  // Get capability badge color
  const getCapabilityColor = (capability: string) => {
    switch (capability.toLowerCase()) {
      case "code":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "reasoning":
      case "analysis":
      case "thinking":
      case "research":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
      case "vision":
      case "audio":
        return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300";
      case "fast":
      case "rapid":
      case "summarization":
      case "classification":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
      case "efficient":
      case "compact":
      case "health":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
      case "creative":
      case "writing":
      case "balance":
      case "balanced":
        return "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300";
      case "agentic":
      case "tools":
        return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300";
      case "math":
      case "stem":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "long context":
        return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  // Get current model details to display
  const displayModelId = hoveredModel || validModelId;
  const currentModelDetails = modelDetails[displayModelId];
  const selectedModelDetails = modelDetails[validModelId];
  const groupedModels = (() => {
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
  })();

  // Handle model change
  const handleModelChange = (modelId: string) => {
    if (MODELS.includes(modelId)) {
      const typedModelId = modelId as modelID;
      setSelectedModel(typedModelId);
    }
  };

  const isInline = variant === "inline";

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
        defaultValue={validModelId}
      >
        <SelectTrigger
          className={cn(
            "px-2 sm:px-3 h-8 sm:h-9 rounded-full group border border-primary/20 bg-primary/5 hover:bg-primary/10 dark:bg-primary/10 dark:hover:bg-primary/20 transition-all duration-200 ring-offset-background focus:ring-2 focus:ring-primary/30 focus:ring-offset-2",
            "max-w-[200px] sm:max-w-fit sm:w-56",
            isInline &&
              "w-full max-w-none rounded-xl border-border bg-card text-foreground shadow-sm hover:bg-muted"
          )}
        >
          <SelectValue
            placeholder="Select model"
            className={cn(
              "text-xs font-medium flex items-center gap-1 sm:gap-2",
              isInline ? "text-foreground" : "text-primary dark:text-primary-foreground"
            )}
          >
            <div className="flex items-center gap-1 sm:gap-2 min-w-0">
              {getProviderIcon(modelDetails[validModelId].provider)}
              <span className="font-medium truncate">
                {modelDetails[validModelId].name}
              </span>
              {selectedModelDetails.capabilities.length > 0 && (
                <span className="hidden md:inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary dark:border-primary/30 dark:text-primary-foreground">
                  {selectedModelDetails.capabilities[0]}
                </span>
              )}
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          align="start"
          className={cn(
            "bg-card text-foreground border border-border rounded-2xl overflow-hidden p-0 shadow-lg w-[280px] sm:w-[350px] md:w-[515px]",
            isInline && "w-[300px] sm:w-[380px] md:w-[520px]"
          )}
        >
          <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] md:grid-cols-[200px_1fr] items-start max-h-[70vh]">
            {/* Model selector column */}
            <div className="sm:border-r border-border bg-card p-0 pr-1 overflow-y-auto max-h-[70vh]">
              <div className="p-1 sm:p-2 space-y-2">
                {groupedModels.map((group, groupIndex) => (
                  <SelectGroup key={group.provider} className="space-y-1">
                    <SelectLabel className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      {group.provider}
                    </SelectLabel>
                    {group.models.map((modelId) => (
                      <SelectItem
                        key={modelId}
                        value={modelId}
                        onMouseEnter={() => setHoveredModel(modelId)}
                        onMouseLeave={() => setHoveredModel(null)}
                        className={cn(
                        "!px-2 sm:!px-3 py-2 cursor-pointer rounded-lg text-xs transition-colors duration-150",
                        "hover:bg-primary/5 hover:text-primary",
                          "focus:bg-primary/10 focus:text-primary focus:outline-none",
                          "data-[highlighted]:bg-primary/10 data-[highlighted]:text-primary",
                          validModelId === modelId &&
                            "!bg-primary/15 !text-primary font-medium"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {getProviderIcon(modelDetails[modelId].provider)}
                            <span className="font-medium truncate">
                              {modelDetails[modelId].name}
                            </span>
                          </div>
                          <div className="hidden md:flex items-center gap-1">
                            {modelDetails[modelId].capabilities
                              .slice(0, 2)
                              .map((capability) => (
                                <span
                                  key={`${modelId}-${capability}`}
                                  className={cn(
                                    "inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium",
                                    getCapabilityColor(capability)
                                  )}
                                >
                                  {getCapabilityIcon(capability)}
                                  <span>{capability}</span>
                                </span>
                              ))}
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                    {groupIndex < groupedModels.length - 1 && (
                      <SelectSeparator className="my-1 opacity-60" />
                    )}
                  </SelectGroup>
                ))}
              </div>
            </div>

            {/* Model details column - hidden on smallest screens, visible on sm+ */}
            <div className="sm:block hidden p-2 sm:p-3 md:p-4 flex-col">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {getProviderIcon(currentModelDetails.provider)}
                  <h3 className="text-sm font-semibold">
                    {currentModelDetails.name}
                  </h3>
                </div>
                <div className="text-xs text-muted-foreground mb-1">
                  Provider:{" "}
                  <span className="font-medium">
                    {currentModelDetails.provider}
                  </span>
                </div>

                {/* Capability badges */}
                <div className="flex flex-wrap gap-1 mt-2 mb-3">
                  {currentModelDetails.capabilities.map((capability) => (
                    <span
                      key={capability}
                      className={cn(
                        "inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium",
                        getCapabilityColor(capability)
                      )}
                    >
                      {getCapabilityIcon(capability)}
                      <span>{capability}</span>
                    </span>
                  ))}
                </div>

                <div className="text-xs text-foreground/90 leading-relaxed mb-3 hidden md:block">
                  {currentModelDetails.description}
                </div>
              </div>

              <div className="bg-muted rounded-lg p-2 hidden md:block">
                <div className="text-[10px] text-muted-foreground flex justify-between items-center">
                  <span>API Version:</span>
                  <code className="bg-background px-2 py-0.5 rounded text-[10px] font-mono">
                    {currentModelDetails.apiVersion}
                  </code>
                </div>
              </div>
            </div>

            {/* Condensed model details for mobile only */}
            <div className="p-3 sm:hidden border-t border-border">
              <div className="flex flex-wrap gap-1 mb-2">
                {currentModelDetails.capabilities
                  .slice(0, 4)
                  .map((capability) => (
                    <span
                      key={capability}
                      className={cn(
                        "inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium",
                        getCapabilityColor(capability)
                      )}
                    >
                      {getCapabilityIcon(capability)}
                      <span>{capability}</span>
                    </span>
                  ))}
                {currentModelDetails.capabilities.length > 4 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{currentModelDetails.capabilities.length - 4} more
                  </span>
                )}
              </div>
            </div>
          </div>
        </SelectContent>
      </Select>
    </div>
  );
};
