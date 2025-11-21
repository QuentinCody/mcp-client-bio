"use client";

import { useState, useEffect } from "react";
import { Code2, Settings, Info } from "lucide-react";
import { Button } from "./ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";

interface CodeModeToggleProps {
  className?: string;
}

export function CodeModeToggle({ className }: CodeModeToggleProps) {
  const [isCodeModeAvailable, setIsCodeModeAvailable] = useState(false);
  const [isCodeModeEnabled, setIsCodeModeEnabled] = useState(false);
  const [workerStatus, setWorkerStatus] = useState<'unknown' | 'available' | 'unavailable'>('unknown');

  // Check if Code Mode is available (requires CODEMODE_WORKER_URL)
  useEffect(() => {
    const checkCodeModeAvailability = async () => {
      try {
        const response = await fetch('/api/code-mode/status');
        const data = await response.json();
        setIsCodeModeAvailable(data.available || false);
        setWorkerStatus(data.available ? 'available' : 'unavailable');
      } catch (error) {
        setIsCodeModeAvailable(false);
        setWorkerStatus('unavailable');
      }
    };

    checkCodeModeAvailability();
  }, []);

  // Load saved preference from localStorage
  useEffect(() => {
    if (isCodeModeAvailable) {
      const savedPreference = localStorage.getItem('codeMode');
      setIsCodeModeEnabled(savedPreference === 'true');
    }
  }, [isCodeModeAvailable]);

  const handleToggle = (enabled: boolean) => {
    setIsCodeModeEnabled(enabled);
    localStorage.setItem('codeMode', enabled.toString());

    // Reload the page to apply the change
    // (In a real implementation, you might want to update the app state instead)
    window.location.reload();
  };

  if (!isCodeModeAvailable) {
    return null; // Don't show the toggle if Code Mode is not available
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={className}
        >
          <Code2 className="h-4 w-4" />
          <span className="ml-2 hidden sm:inline">Code Mode</span>
          {isCodeModeEnabled && (
            <Badge variant="default" className="ml-2">ON</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 className="h-5 w-5" />
              <h3 className="font-semibold">Code Mode</h3>
            </div>
            <Switch
              checked={isCodeModeEnabled}
              onCheckedChange={handleToggle}
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div className="text-sm text-muted-foreground space-y-2">
                <p>
                  When enabled, the AI writes and executes JavaScript code to interact with MCP tools instead of calling them directly.
                </p>
                <p className="font-medium text-foreground">Benefits:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>98% reduction in token usage</li>
                  <li>Handle complex multi-step operations</li>
                  <li>Filter large datasets efficiently</li>
                  <li>Better control flow and error handling</li>
                </ul>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-sm font-medium">Status</Label>
              <div className="flex items-center gap-2">
                <Badge variant={workerStatus === 'available' ? 'default' : 'destructive'}>
                  {workerStatus === 'available' ? 'Available' : 'Unavailable'}
                </Badge>
                {workerStatus === 'available' && (
                  <span className="text-xs text-muted-foreground">
                    Sandboxed execution ready
                  </span>
                )}
              </div>
            </div>

            {isCodeModeEnabled && (
              <>
                <Separator />
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium mb-1">How it works:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>AI generates JavaScript code</li>
                    <li>Code executes in isolated sandbox</li>
                    <li>MCP tools accessed via helpers API</li>
                    <li>Results returned to AI for response</li>
                  </ol>
                </div>
              </>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
