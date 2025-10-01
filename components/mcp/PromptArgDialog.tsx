"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Terminal } from "lucide-react";
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
        className="sm:max-w-md max-h-[80vh] overflow-auto border-2 border-border/40 bg-background/95 backdrop-blur-xl shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Configure prompt
            <Badge variant="secondary">/mcp.{serverId}.{prompt.name}</Badge>
          </DialogTitle>
        </DialogHeader>

        {prompt.description ? (
          <p className="mb-3 text-sm text-muted-foreground">{prompt.description}</p>
        ) : null}

        {totalArgs > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Parameter {Math.min(activeIndex + 1, totalArgs)} of {totalArgs}
              </span>
              <span>
                Completed {completedCount}/{totalArgs}
              </span>
            </div>
            <div className="h-1 w-full rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-green-500 to-blue-500 transition-all duration-500 ease-out"
                style={{ width: `${completedPercent}%` }}
              />
            </div>
            {currentArg ? (
              <div className="space-y-3 p-4 rounded-lg border-2 border-border bg-muted/50 shadow-sm animate-in fade-in-0 slide-in-from-right-2 duration-300" key={currentArg.name}>
                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    {currentArg.name}
                    {currentArg.required ? <span className="text-destructive">*</span> : null}
                  </div>
                  {currentArg.required ? (
                    <p className="text-xs text-muted-foreground">Required parameter</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Optional parameter</p>
                  )}
                  {currentArg.description ? (
                    <p className="text-xs text-muted-foreground">{currentArg.description}</p>
                  ) : null}
                </div>
                <div className="relative">
                  <Input
                    ref={inputRef}
                    aria-label={`Argument ${currentArg.name}`}
                    value={values[currentArg.name] ?? ""}
                    placeholder="Type value…"
                    className="transition-all duration-200 focus:ring-4 focus:ring-ring focus:border-ring focus:bg-accent/20 focus:scale-[1.02] focus:shadow-lg border-2"
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
                  <Terminal className="absolute right-2 top-2 h-4 w-4 text-muted-foreground/70" />
                </div>
                {suggestionsForCurrent.length > 0 ? (
                  <div className="max-h-32 overflow-auto rounded border p-1 text-sm">
                    {suggestionsForCurrent.map((suggestion, index) => (
                      <button
                        key={suggestion}
                        type="button"
                        className={`block w-full rounded px-2 py-1 text-left transition-all duration-200 hover:bg-muted ${
                          index === selectedSuggestionIndex
                            ? "bg-accent border-2 border-ring shadow-lg scale-[1.02] text-accent-foreground font-medium"
                            : "border border-transparent"
                        }`}
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
          <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-muted-foreground/80 border-t pt-3">
            <span className="inline-flex items-center gap-1">
              <span className="rounded-md border border-border/60 bg-background/80 px-1.5 py-0.5 font-semibold">Enter</span>
              {activeIndex === totalArgs - 1 ? "Insert prompt" : "Next parameter"}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="rounded-md border border-border/60 bg-background/80 px-1.5 py-0.5 font-semibold">Tab</span>
              Navigate to buttons
            </span>
            {suggestionsForCurrent.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="rounded-md border border-border/60 bg-background/80 px-1.5 py-0.5 font-semibold">↑↓</span>
                Browse suggestions
              </span>
            )}
          </div>
        )}

        <DialogFooter className="flex justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="transition-all duration-200 focus:ring-4 focus:ring-destructive/50 focus:bg-destructive/10 focus:text-destructive focus:border-destructive focus:scale-105 focus:shadow-xl hover:bg-destructive/5 border-2 border-transparent"
          >
            Cancel
          </Button>

          <div className="flex gap-2">
            {totalArgs > 0 && activeIndex > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                disabled={submitting}
                className="transition-all duration-200 focus:ring-4 focus:ring-ring focus:bg-accent focus:text-accent-foreground focus:border-2 focus:border-ring focus:scale-105 focus:shadow-xl hover:bg-accent/80 border-0"
              >
                Back
              </Button>
            )}

            {totalArgs > 0 && activeIndex < totalArgs - 1 ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={submitting || !canAdvanceCurrent}
                className="transition-all duration-200 focus:ring-4 focus:ring-primary/50 focus:bg-primary focus:text-primary-foreground focus:border-primary focus:scale-105 focus:shadow-xl hover:bg-primary/90 border-0"
              >
                Next
              </Button>
            ) : totalArgs > 0 ? (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || requiredMissing}
                className="transition-all duration-200 focus:ring-4 focus:ring-primary/50 focus:bg-primary focus:text-primary-foreground focus:border-primary focus:scale-105 focus:shadow-xl hover:bg-primary/90 border-0"
              >
                {submitting ? "Resolving…" : "Insert prompt"}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
