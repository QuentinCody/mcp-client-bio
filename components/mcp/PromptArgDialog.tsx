"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PromptSummary } from "@/lib/mcp/transport/http";
import type { SlashPromptDef } from "@/lib/mcp/prompts/types";

export function PromptArgDialog({
  open,
  onOpenChange,
  serverId,
  prompt,
  onResolve,
  onCompleteArgument,
  promptDef,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  serverId: string;
  prompt: PromptSummary;
  onResolve: (values: Record<string, string>) => Promise<void>;
  onCompleteArgument?: (
    argumentName: string,
    value: string,
    context: Record<string, string>
  ) => Promise<string[]>;
  promptDef?: SlashPromptDef;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const timers = useRef<Record<string, number>>({});
  const requestVersions = useRef<Record<string, number>>({});
  const hydratingPromptId = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const args = useMemo(() => prompt.arguments ?? [], [prompt.arguments]);
  const totalArgs = args.length;
  const currentArg = totalArgs > 0 ? args[Math.min(activeIndex, totalArgs - 1)] : undefined;
  const completedCount = useMemo(
    () => args.filter((arg) => (values[arg.name] ?? "").trim().length > 0).length,
    [args, values]
  );

  useEffect(() => {
    if (!open) {
      setValues({});
      setErrors({});
      setSuggestions({});
      setSubmitting(false);
      requestVersions.current = {};
      for (const timer of Object.values(timers.current)) {
        window.clearTimeout(timer);
      }
      timers.current = {};
      setActiveIndex(0);
      setSelectedSuggestionIndex(-1);
      hydratingPromptId.current = null;
    }
  }, [open]);

  useEffect(() => {
    return () => {
      for (const timer of Object.values(timers.current)) {
        window.clearTimeout(timer);
      }
      timers.current = {};
    };
  }, []);

  useEffect(() => {
    if (!open || !promptDef?.id) return;
    if (hydratingPromptId.current === promptDef.id) return;
    hydratingPromptId.current = promptDef.id;
    try {
      const raw = window.localStorage.getItem(`prompt:${promptDef.id}:args`);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string>;
        if (parsed && typeof parsed === "object") {
          setValues((prev) => ({ ...parsed, ...prev }));
        }
      }
    } catch {
      // ignore hydration issues
    }
  }, [open, promptDef?.id]);

  const requiredMissing = useMemo(() => {
    return args.some((arg) => {
      if (!arg.required) return false;
      const value = values[arg.name];
      return !value || !value.trim();
    });
  }, [args, values]);

  const canAdvanceCurrent = useMemo(() => {
    if (!currentArg) return true;
    if (!currentArg.required) return true;
    const value = values[currentArg.name];
    return Boolean(value && value.trim());
  }, [currentArg, values]);

  const clearFormError = useCallback(() => {
    setErrors((prev) => {
      if (!prev.__form) return prev;
      const next = { ...prev };
      delete next.__form;
      return next;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    const missing = args
      .filter((arg) => arg.required)
      .filter((arg) => !(values[arg.name] ?? "").trim())
      .map((arg) => arg.name);
    if (missing.length > 0) {
      setErrors({ __form: `Missing required ${missing.join(", ")}` });
      return;
    }
    setSubmitting(true);
    setErrors({});
    try {
      await onResolve(values);
      if (promptDef?.id) {
        try {
          window.localStorage.setItem(`prompt:${promptDef.id}:args`, JSON.stringify(values));
        } catch {
          // ignore persistence errors
        }
      }
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to resolve prompt";
      setErrors({ __form: message });
    } finally {
      setSubmitting(false);
    }
  }, [args, values, onResolve, promptDef?.id, onOpenChange]);

  function scheduleCompletion(argName: string, nextValues: Record<string, string>, delay = 250) {
    if (!onCompleteArgument) return;
    if (timers.current[argName]) {
      window.clearTimeout(timers.current[argName]);
    }
    const nextVersion = (requestVersions.current[argName] ?? 0) + 1;
    requestVersions.current[argName] = nextVersion;
    timers.current[argName] = window.setTimeout(async () => {
      try {
        const results = await onCompleteArgument(argName, nextValues[argName] ?? "", nextValues);
        if (requestVersions.current[argName] !== nextVersion) return;
        setSuggestions((prev) => ({
          ...prev,
          [argName]: Array.from(new Set(results ?? [])).slice(0, 100),
        }));
      } catch {
        if (requestVersions.current[argName] !== nextVersion) return;
        setSuggestions((prev) => ({
          ...prev,
          [argName]: [],
        }));
      }
    }, Math.max(0, delay));
  }

  useEffect(() => {
    if (!open || !currentArg) return;
    scheduleCompletion(currentArg.name, values, 0);
    // Focus the input immediately when dialog opens or parameter changes
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentArg?.name]);

  const handleNext = useCallback(() => {
    if (!currentArg) return;
    if (currentArg.required && !canAdvanceCurrent) {
      setErrors({ __form: `Please enter a value for ${currentArg.name}` });
      return;
    }
    clearFormError();
    setActiveIndex((index) => Math.min(index + 1, totalArgs - 1));
    setSelectedSuggestionIndex(-1);
    // Focus next input
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, [currentArg, canAdvanceCurrent, totalArgs, clearFormError]);

  const handleBack = useCallback(() => {
    clearFormError();
    setActiveIndex((index) => Math.max(index - 1, 0));
    setSelectedSuggestionIndex(-1);
    // Focus previous input
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, [clearFormError]);

  const suggestionsForCurrent = currentArg ? suggestions[currentArg.name] ?? [] : [];
  const completedPercent = totalArgs === 0 ? 0 : Math.round((completedCount / totalArgs) * 100);


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg max-h-[85vh] overflow-auto border-2 border-blue-200/60 dark:border-blue-700/40 bg-gradient-to-br from-white via-blue-50/30 to-white dark:from-zinc-950 dark:via-blue-950/20 dark:to-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.25)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.7)] ring-4 ring-blue-500/20 dark:ring-blue-400/30 backdrop-blur-xl animate-in fade-in-0 zoom-in-95 duration-200"
        aria-describedby={undefined}
      >
        <DialogHeader className="space-y-3">
          <DialogTitle className="flex flex-wrap items-center gap-2.5">
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent font-bold">
              Configure Prompt
            </span>
            <Badge className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-0 shadow-lg shadow-blue-500/30 font-mono text-[11px] px-2.5 py-1">
              /mcp.{serverId}.{prompt.name}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {prompt.description ? (
          <p className="mb-3 text-sm text-muted-foreground">{prompt.description}</p>
        ) : null}

        {totalArgs > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-blue-600 dark:text-blue-400">
                Parameter {Math.min(activeIndex + 1, totalArgs)} of {totalArgs}
              </span>
              <span className="text-green-600 dark:text-green-400">
                {completedCount}/{totalArgs} completed
              </span>
            </div>
            <div className="relative h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden shadow-inner">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 transition-all duration-700 ease-out shadow-lg"
                style={{ width: `${completedPercent}%` }}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
            </div>
            {currentArg ? (
              <div className="space-y-3 p-5 rounded-xl border-2 border-blue-200/60 dark:border-blue-700/40 bg-gradient-to-br from-blue-50/60 to-white dark:from-blue-950/30 dark:to-zinc-900 shadow-lg backdrop-blur-sm animate-in fade-in-0 slide-in-from-right-2 duration-300" key={currentArg.name}>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-bold text-blue-700 dark:text-blue-300">
                      {currentArg.name}
                    </div>
                    {currentArg.required && (
                      <Badge className="bg-gradient-to-r from-red-500 to-orange-500 text-white border-0 text-[10px] px-2 py-0.5 shadow-md">
                        Required
                      </Badge>
                    )}
                  </div>
                  {currentArg.description && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{currentArg.description}</p>
                  )}
                </div>
                <div className="relative">
                  <Input
                    ref={inputRef}
                    aria-label={`Argument ${currentArg.name}`}
                    value={values[currentArg.name] ?? ""}
                    placeholder="Type value…"
                    className="transition-all duration-200 focus:ring-4 focus:ring-blue-500/50 dark:focus:ring-blue-400/50 focus:border-blue-500 dark:focus:border-blue-400 focus:bg-white dark:focus:bg-zinc-900 focus:scale-[1.01] focus:shadow-xl border-2 border-blue-200 dark:border-blue-800 bg-white dark:bg-zinc-900 text-base font-medium pl-4 pr-10 py-2.5"
                    onChange={(event) => {
                      const next = {
                        ...values,
                        [currentArg.name]: event.target.value,
                      };
                      setValues(next);
                      setSelectedSuggestionIndex(-1); // Reset suggestion selection when typing
                      scheduleCompletion(currentArg.name, next);
                    }}
                    onKeyDown={(event) => {
                      const hasSuggestions = suggestionsForCurrent.length > 0;

                      // Handle suggestion navigation
                      if (event.key === "ArrowDown" && hasSuggestions) {
                        event.preventDefault();
                        setSelectedSuggestionIndex((prev) =>
                          prev < suggestionsForCurrent.length - 1 ? prev + 1 : 0
                        );
                        return;
                      }

                      if (event.key === "ArrowUp" && hasSuggestions) {
                        event.preventDefault();
                        setSelectedSuggestionIndex((prev) =>
                          prev > 0 ? prev - 1 : suggestionsForCurrent.length - 1
                        );
                        return;
                      }

                      // Enter handling
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();

                        // If there's a selected suggestion, use it first
                        if (hasSuggestions && selectedSuggestionIndex >= 0) {
                          const selectedSuggestion = suggestionsForCurrent[selectedSuggestionIndex];
                          const next = { ...values, [currentArg.name]: selectedSuggestion };
                          setValues(next);
                          setSelectedSuggestionIndex(-1);
                          scheduleCompletion(currentArg.name, next);
                          return;
                        }

                        // If we're on the last parameter and all required fields are filled, submit
                        if (activeIndex === totalArgs - 1 && !requiredMissing) {
                          handleSubmit();
                        } else if (canAdvanceCurrent) {
                          // Otherwise, move to next parameter if current one is valid
                          handleNext();
                        } else {
                          // Show error if current field is required but empty
                          setErrors({ __form: `Please enter a value for ${currentArg.name}` });
                        }
                      }

                      // Tab with selected suggestion applies it
                      if (event.key === "Tab" && hasSuggestions && selectedSuggestionIndex >= 0) {
                        event.preventDefault();
                        const selectedSuggestion = suggestionsForCurrent[selectedSuggestionIndex];
                        const next = { ...values, [currentArg.name]: selectedSuggestion };
                        setValues(next);
                        setSelectedSuggestionIndex(-1);
                        scheduleCompletion(currentArg.name, next);
                        return;
                      }

                      // Escape clears suggestion selection
                      if (event.key === "Escape") {
                        setSelectedSuggestionIndex(-1);
                      }
                    }}
                    autoFocus
                  />
                  <Terminal className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-blue-400/60 dark:text-blue-500/40" />
                </div>
                {suggestionsForCurrent.length > 0 ? (
                  <div className="max-h-36 overflow-y-auto scrollbar-thin scrollbar-thumb-blue-300 dark:scrollbar-thumb-blue-700 scrollbar-track-transparent rounded-lg border-2 border-blue-200 dark:border-blue-800 bg-white dark:bg-zinc-900 p-1.5 shadow-xl">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-2 py-1 mb-1">
                      Suggestions ({suggestionsForCurrent.length})
                    </div>
                    {suggestionsForCurrent.map((suggestion, index) => (
                      <button
                        key={suggestion}
                        type="button"
                        className={cn(
                          "block w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-all duration-150",
                          index === selectedSuggestionIndex
                            ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg scale-[1.02] ring-2 ring-blue-400/50 dark:ring-blue-300/50"
                            : "hover:bg-blue-50 dark:hover:bg-blue-950/50 text-gray-700 dark:text-gray-300"
                        )}
                        onClick={() => {
                          const next = { ...values, [currentArg.name]: suggestion };
                          setValues(next);
                          setSelectedSuggestionIndex(-1);
                          scheduleCompletion(currentArg.name, next);
                        }}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">This prompt does not require parameters.</p>
        )}

        {errors.__form ? (
          <p className="text-sm text-red-600">{errors.__form}</p>
        ) : null}

        {totalArgs > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs border-t-2 border-blue-100 dark:border-blue-900/50 pt-4 bg-gradient-to-r from-blue-50/40 via-white/40 to-blue-50/40 dark:from-blue-950/20 dark:via-zinc-900/20 dark:to-blue-950/20 rounded-lg p-3">
            <span className="inline-flex items-center gap-1.5">
              <kbd className="rounded-md border-2 border-blue-300 dark:border-blue-700 bg-white dark:bg-zinc-900 px-2 py-1 font-bold text-blue-700 dark:text-blue-300 shadow-sm">Enter</kbd>
              <span className="font-semibold text-gray-700 dark:text-gray-300">{activeIndex === totalArgs - 1 ? "Insert prompt" : "Next parameter"}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <kbd className="rounded-md border-2 border-blue-300 dark:border-blue-700 bg-white dark:bg-zinc-900 px-2 py-1 font-bold text-blue-700 dark:text-blue-300 shadow-sm">Tab</kbd>
              <span className="font-semibold text-gray-700 dark:text-gray-300">Navigate</span>
            </span>
            {suggestionsForCurrent.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <kbd className="rounded-md border-2 border-blue-300 dark:border-blue-700 bg-white dark:bg-zinc-900 px-2 py-1 font-bold text-blue-700 dark:text-blue-300 shadow-sm">↑↓</kbd>
                <span className="font-semibold text-gray-700 dark:text-gray-300">Browse suggestions</span>
              </span>
            )}
          </div>
        )}

        <DialogFooter className="flex justify-between items-center gap-3 pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="transition-all duration-200 focus:ring-4 focus:ring-red-500/50 dark:focus:ring-red-400/50 focus:bg-red-50 dark:focus:bg-red-950/30 focus:text-red-700 dark:focus:text-red-400 focus:scale-105 focus:shadow-xl hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-700 dark:hover:text-red-400 border-2 border-transparent hover:border-red-200 dark:hover:border-red-800 font-semibold"
          >
            Cancel
          </Button>

          <div className="flex gap-2.5">
            {totalArgs > 0 && activeIndex > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                disabled={submitting}
                className="transition-all duration-200 focus:ring-4 focus:ring-gray-500/50 dark:focus:ring-gray-400/50 focus:bg-gray-100 dark:focus:bg-gray-800 focus:scale-105 focus:shadow-xl hover:bg-gray-100 dark:hover:bg-gray-800 border-2 border-gray-300 dark:border-gray-700 font-semibold"
              >
                ← Back
              </Button>
            )}

            {totalArgs > 0 && activeIndex < totalArgs - 1 ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={submitting || !canAdvanceCurrent}
                className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white border-0 shadow-lg shadow-blue-500/30 transition-all duration-200 focus:ring-4 focus:ring-blue-500/50 dark:focus:ring-blue-400/50 focus:scale-105 focus:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
              >
                Next →
              </Button>
            ) : totalArgs > 0 ? (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || requiredMissing}
                className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white border-0 shadow-lg shadow-green-500/30 transition-all duration-200 focus:ring-4 focus:ring-green-500/50 dark:focus:ring-green-400/50 focus:scale-105 focus:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
              >
                {submitting ? "Resolving…" : "✓ Insert prompt"}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
