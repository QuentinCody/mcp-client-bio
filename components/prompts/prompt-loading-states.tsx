"use client";
import { Loader2, AlertCircle, RefreshCw, Search, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface PromptLoadingStatesProps {
  isLoading: boolean;
  error?: string;
  isEmpty?: boolean;
  onRetry?: () => void;
  className?: string;
}

export function PromptLoadingStates({ 
  isLoading, 
  error, 
  isEmpty, 
  onRetry, 
  className 
}: PromptLoadingStatesProps) {
  if (isLoading) {
    return (
      <div className={cn(
        "flex flex-col items-center justify-center py-12 px-6 text-center space-y-4",
        className
      )}>
        <div className="relative">
          <div className="w-12 h-12 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full flex items-center justify-center animate-pulse">
            <Sparkles className="w-6 h-6 text-white animate-pulse" />
          </div>
          <div className="absolute inset-0 w-12 h-12 border-2 border-blue-400 rounded-full animate-spin border-t-transparent" />
        </div>
        
        <div className="space-y-2">
          <div className="text-sm font-semibold text-gray-700">
            Loading prompts...
          </div>
          <div className="text-xs text-gray-500 animate-pulse">
            Fetching available MCP prompts from connected servers
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>This might take a moment</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn(
        "flex flex-col items-center justify-center py-12 px-6 text-center space-y-4 bg-red-50/50 rounded-lg border border-red-200/60",
        className
      )}>
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
          <AlertCircle className="w-6 h-6 text-red-500" />
        </div>
        
        <div className="space-y-2">
          <div className="text-sm font-semibold text-red-700">
            Failed to load prompts
          </div>
          <div className="text-xs text-red-600 max-w-sm">
            {error}
          </div>
        </div>
        
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium rounded-lg transition-colors duration-200"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Try again</span>
          </button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className={cn(
        "flex flex-col items-center justify-center py-12 px-6 text-center space-y-4",
        className
      )}>
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
          <Search className="w-6 h-6 text-gray-400" />
        </div>
        
        <div className="space-y-2">
          <div className="text-sm font-semibold text-gray-600">
            No prompts available
          </div>
          <div className="text-xs text-gray-500 max-w-sm">
            Connect MCP servers or ensure they support prompts to see available slash commands
          </div>
        </div>
        
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <div className="flex items-center gap-1">
            <Zap className="w-3 h-3" />
            <span>MCP Servers</span>
          </div>
          <span>·</span>
          <div className="flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            <span>Slash Commands</span>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// Inline loading state for prompt execution
export function PromptExecutionLoader({ 
  promptTitle, 
  step 
}: { 
  promptTitle: string; 
  step?: string; 
}) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg border border-blue-200/60">
      <div className="relative">
        <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse" />
        <div className="absolute inset-0 w-3 h-3 border border-blue-400 rounded-full animate-ping" />
      </div>
      <span>Executing {promptTitle}</span>
      {step && (
        <>
          <span>·</span>
          <span className="text-blue-600">{step}</span>
        </>
      )}
    </div>
  );
}

// Toast-style notification for prompt actions
export function PromptActionToast({ 
  type, 
  title, 
  message, 
  onClose 
}: { 
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
  onClose?: () => void;
}) {
  const styles = {
    success: {
      container: "bg-green-50 border-green-200 text-green-800",
      icon: <Sparkles className="w-4 h-4 text-green-600" />
    },
    error: {
      container: "bg-red-50 border-red-200 text-red-800", 
      icon: <AlertCircle className="w-4 h-4 text-red-600" />
    },
    info: {
      container: "bg-blue-50 border-blue-200 text-blue-800",
      icon: <Search className="w-4 h-4 text-blue-600" />
    }
  };

  return (
    <div className={cn(
      "flex items-start gap-3 p-3 rounded-lg border shadow-sm animate-in slide-in-from-top-2 duration-200",
      styles[type].container
    )}>
      <div className="flex-shrink-0 mt-0.5">
        {styles[type].icon}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        {message && (
          <div className="text-xs opacity-90 mt-0.5">{message}</div>
        )}
      </div>
      
      {onClose && (
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1 rounded-md hover:bg-black/5 transition-colors"
          aria-label="Close notification"
        >
          <AlertCircle className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}