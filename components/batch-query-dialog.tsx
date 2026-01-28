"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Play, X, List } from "lucide-react";

interface BatchQueryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (queries: string[]) => void;
  isProcessing?: boolean;
  currentQueryIndex?: number;
  totalQueries?: number;
}

export function BatchQueryDialog({
  open,
  onOpenChange,
  onSubmit,
  isProcessing = false,
  currentQueryIndex = 0,
  totalQueries = 0,
}: BatchQueryDialogProps) {
  const [input, setInput] = useState("");

  const parseQueries = useCallback((text: string): string[] => {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }, []);

  const queries = parseQueries(input);

  const handleSubmit = useCallback(() => {
    if (queries.length > 0) {
      onSubmit(queries);
    }
  }, [queries, onSubmit]);

  const handleClear = useCallback(() => {
    setInput("");
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <List className="h-5 w-5" />
            Batch Query Mode
          </DialogTitle>
          <DialogDescription>
            Enter multiple queries, one per line. They will be processed sequentially.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            placeholder="Enter your queries here, one per line...

Example:
What is TP53?
Find mutations in BRCA1
Search for lung cancer treatments"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="min-h-[200px] font-mono text-sm"
            disabled={isProcessing}
          />

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {queries.length} {queries.length === 1 ? "query" : "queries"} detected
            </span>
            {isProcessing && totalQueries > 0 && (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing {currentQueryIndex + 1} of {totalQueries}...
              </span>
            )}
          </div>

          {queries.length > 0 && !isProcessing && (
            <div className="rounded-md border bg-muted/50 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Preview:
              </p>
              <ul className="space-y-1 text-sm">
                {queries.slice(0, 5).map((q, i) => (
                  <li key={i} className="truncate">
                    {i + 1}. {q}
                  </li>
                ))}
                {queries.length > 5 && (
                  <li className="text-muted-foreground">
                    ... and {queries.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleClear}
            disabled={isProcessing || input.length === 0}
          >
            <X className="mr-2 h-4 w-4" />
            Clear
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isProcessing || queries.length === 0}
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Run {queries.length} {queries.length === 1 ? "Query" : "Queries"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
