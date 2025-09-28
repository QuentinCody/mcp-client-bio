"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const timers = useRef<Record<string, number>>({});
  const requestVersions = useRef<Record<string, number>>({});
  const hydratingPromptId = useRef<string | null>(null);

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

  function clearFormError() {
    setErrors((prev) => {
      if (!prev.__form) return prev;
      const next = { ...prev };
      delete next.__form;
      return next;
    });
  }

  async function handleSubmit() {
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
  }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentArg?.name]);

  function handleNext() {
    if (!currentArg) return;
    if (currentArg.required && !canAdvanceCurrent) {
      setErrors({ __form: `Please enter a value for ${currentArg.name}` });
      return;
    }
    clearFormError();
    setActiveIndex((index) => Math.min(index + 1, totalArgs - 1));
  }

  function handleBack() {
    clearFormError();
    setActiveIndex((index) => Math.max(index - 1, 0));
  }

  const suggestionsForCurrent = currentArg ? suggestions[currentArg.name] ?? [] : [];
  const completedPercent = totalArgs === 0 ? 0 : Math.round((completedCount / totalArgs) * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md max-h-[80vh] overflow-auto border border-border/40 bg-white/95 backdrop-blur-xl shadow-2xl"
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
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${completedPercent}%` }}
              />
            </div>
            {currentArg ? (
              <div className="space-y-3" key={currentArg.name}>
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
                    aria-label={`Argument ${currentArg.name}`}
                    value={values[currentArg.name] ?? ""}
                    placeholder="Type value…"
                    onChange={(event) => {
                      const next = {
                        ...values,
                        [currentArg.name]: event.target.value,
                      };
                      setValues(next);
                      scheduleCompletion(currentArg.name, next);
                    }}
                  />
                  <Terminal className="absolute right-2 top-2 h-4 w-4 text-muted-foreground/70" />
                </div>
                {suggestionsForCurrent.length > 0 ? (
                  <div className="max-h-32 overflow-auto rounded border p-1 text-sm">
                    {suggestionsForCurrent.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="block w-full rounded px-2 py-1 text-left hover:bg-muted"
                        onClick={() => {
                          const next = { ...values, [currentArg.name]: suggestion };
                          setValues(next);
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

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          {totalArgs > 0 && activeIndex > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={submitting}
            >
              Back
            </Button>
          ) : null}
          {totalArgs > 0 && activeIndex < totalArgs - 1 ? (
            <Button
              type="button"
              onClick={handleNext}
              disabled={submitting || !canAdvanceCurrent}
            >
              Next
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || (totalArgs > 0 && requiredMissing)}
            >
              {submitting ? "Resolving…" : "Insert preview"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
