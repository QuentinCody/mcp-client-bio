"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal, ChevronRight, X, Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ArgInputProps {
  args: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
  onCompleteArgument?: (
    argumentName: string,
    value: string,
    context: Record<string, string>
  ) => Promise<string[]>;
  promptName: string;
  className?: string;
}

/**
 * Inline argument input - Luminous Terminal aesthetic.
 * Precision data entry with visual feedback.
 */
export function ArgInput({
  args,
  onSubmit,
  onCancel,
  onCompleteArgument,
  promptName,
  className,
}: ArgInputProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(-1);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | undefined>(undefined);

  const currentArg = args[activeIndex];
  const isLast = activeIndex === args.length - 1;
  const completedCount = args.filter((a) => values[a.name]?.trim()).length;

  // Focus input on mount and arg change
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeIndex]);

  // Fetch completions
  const fetchCompletions = useCallback(
    async (name: string, value: string) => {
      if (!onCompleteArgument) return;
      try {
        const results = await onCompleteArgument(name, value, values);
        setSuggestions(results?.slice(0, 6) ?? []);
        setSuggestionIndex(-1);
      } catch {
        setSuggestions([]);
      }
    },
    [onCompleteArgument, values]
  );

  // Debounced completion fetch
  useEffect(() => {
    if (!currentArg) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      fetchCompletions(currentArg.name, values[currentArg.name] ?? "");
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [currentArg, values, fetchCompletions]);

  const handleAdvance = () => {
    if (isLast) {
      // Submit
      const missing = args
        .filter((a) => a.required)
        .filter((a) => !values[a.name]?.trim());
      if (missing.length > 0) return;
      setSubmitting(true);
      onSubmit(values);
    } else {
      setActiveIndex((i) => i + 1);
      setSuggestions([]);
      setSuggestionIndex(-1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }

    if (e.key === "ArrowDown" && suggestions.length > 0) {
      e.preventDefault();
      setSuggestionIndex((i) => (i < suggestions.length - 1 ? i + 1 : 0));
      return;
    }

    if (e.key === "ArrowUp" && suggestions.length > 0) {
      e.preventDefault();
      setSuggestionIndex((i) => (i > 0 ? i - 1 : suggestions.length - 1));
      return;
    }

    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      if (suggestionIndex >= 0 && suggestions[suggestionIndex]) {
        setValues((v) => ({ ...v, [currentArg.name]: suggestions[suggestionIndex] }));
        setSuggestions([]);
        setSuggestionIndex(-1);
      } else {
        handleAdvance();
      }
      return;
    }

    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      if (activeIndex > 0) {
        setActiveIndex((i) => i - 1);
        setSuggestions([]);
        setSuggestionIndex(-1);
      }
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (suggestionIndex >= 0 && suggestions[suggestionIndex]) {
        setValues((v) => ({ ...v, [currentArg.name]: suggestions[suggestionIndex] }));
        setSuggestions([]);
        setSuggestionIndex(-1);
      } else {
        handleAdvance();
      }
      return;
    }
  };

  if (!currentArg) return null;

  const canAdvance = !currentArg.required || values[currentArg.name]?.trim();
  const currentValue = values[currentArg.name] ?? "";
  const isFilled = currentValue.trim().length > 0;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/50 bg-popover/95 backdrop-blur-xl shadow-2xl",
        "noise-texture animate-menu-enter",
        className
      )}
    >
      {/* Header - command context */}
      <div className="relative border-b border-border/30 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Terminal className="h-5 w-5 text-primary icon-glow" />
            </div>
            <div>
              <code className="font-mono text-sm font-semibold text-foreground">
                /{promptName}
              </code>
              <div className="mt-1 flex items-center gap-3">
                {/* Step indicator */}
                <div className="flex items-center gap-1.5">
                  {args.map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-1.5 w-6 rounded-full transition-all duration-300",
                        i < activeIndex
                          ? "bg-emerald-500"
                          : i === activeIndex
                          ? "bg-primary animate-subtle-pulse"
                          : "bg-muted-foreground/20"
                      )}
                    />
                  ))}
                </div>
                <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                  Step {activeIndex + 1}/{args.length}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-150"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Current argument */}
      <div className="p-5 space-y-4">
        {/* Argument label and status */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-sm font-semibold text-foreground">
                {currentArg.name}
              </span>
              {currentArg.required ? (
                <span className="rounded-full px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  required
                </span>
              ) : (
                <span className="rounded-full px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider bg-muted text-muted-foreground">
                  optional
                </span>
              )}
            </div>
            {currentArg.description && (
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed max-w-md">
                {currentArg.description}
              </p>
            )}
          </div>
          {/* Filled indicator */}
          {isFilled && (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10">
              <Check className="h-3.5 w-3.5 text-emerald-500 animate-success-pulse" />
            </div>
          )}
        </div>

        {/* Input field */}
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={currentValue}
            onChange={(e) => setValues((v) => ({ ...v, [currentArg.name]: e.target.value }))}
            onKeyDown={handleKeyDown}
            placeholder={`Enter ${currentArg.name}...`}
            className={cn(
              "w-full rounded-xl border-2 bg-background/50 px-4 py-3 font-mono text-sm transition-all duration-200",
              "placeholder:text-muted-foreground/50",
              "focus:outline-none focus:bg-background",
              isFilled
                ? "border-emerald-500/30 focus:border-emerald-500/50"
                : canAdvance
                ? "border-border/50 focus:border-primary/50"
                : "border-amber-500/30 focus:border-amber-500/50",
              "animate-input-glow"
            )}
            disabled={submitting}
          />
          {/* Cursor indicator when focused */}
          <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
            <Circle
              className={cn(
                "h-2 w-2 transition-all duration-300",
                isFilled ? "text-emerald-500 fill-emerald-500" : "text-muted-foreground/30"
              )}
            />
          </div>
        </div>

        {/* Suggestions dropdown */}
        {suggestions.length > 0 && (
          <div className="rounded-xl border border-border/30 bg-background/80 backdrop-blur-sm overflow-hidden">
            {suggestions.map((s, i) => (
              <button
                key={s}
                type="button"
                className={cn(
                  "w-full px-4 py-2.5 text-left font-mono text-sm transition-all duration-100",
                  i === suggestionIndex
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/80 hover:bg-muted/50"
                )}
                onClick={() => {
                  setValues((v) => ({ ...v, [currentArg.name]: s }));
                  setSuggestions([]);
                  setSuggestionIndex(-1);
                  inputRef.current?.focus();
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer - actions and hints */}
      <div className="border-t border-border/30 px-5 py-3 bg-muted/20">
        <div className="flex items-center justify-between">
          {/* Keyboard hints */}
          <div className="flex items-center gap-5 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/50 bg-background/50 px-1.5 font-mono text-[10px]">
                Tab
              </kbd>
              <span>{isLast ? "submit" : "next"}</span>
            </span>
            {activeIndex > 0 && (
              <span className="flex items-center gap-1.5">
                <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/50 bg-background/50 px-1.5 font-mono text-[10px]">
                  ⇧Tab
                </kbd>
                <span>back</span>
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/50 bg-background/50 px-1.5 font-mono text-[10px]">
                Esc
              </kbd>
              <span>cancel</span>
            </span>
          </div>

          {/* Submit button on last step */}
          {isLast && canAdvance && (
            <button
              type="button"
              onClick={handleAdvance}
              disabled={submitting}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-xs font-medium transition-all duration-200",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "shadow-sm hover:shadow-md"
              )}
            >
              {submitting ? (
                <>
                  <Circle className="h-3 w-3 animate-spin" />
                  <span>Running...</span>
                </>
              ) : (
                <>
                  <span>Execute</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
