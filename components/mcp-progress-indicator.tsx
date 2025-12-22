/**
 * MCP Progress Indicator Component
 * Displays real-time progress for long-running MCP operations
 */

'use client';

import { useProgressWithCancellation } from '@/lib/hooks/use-mcp-progress';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MCPProgressIndicatorProps {
  progressToken?: string;
  requestId?: string;
  className?: string;
  showCancelButton?: boolean;
  onComplete?: () => void;
}

export function MCPProgressIndicator({
  progressToken,
  requestId,
  className,
  showCancelButton = true,
  onComplete,
}: MCPProgressIndicatorProps) {
  const {
    latestUpdate,
    cancelRequest,
    isCancelling,
    cancelError,
  } = useProgressWithCancellation(progressToken);

  // Check if complete
  const isComplete = latestUpdate?.total && latestUpdate.progress >= latestUpdate.total;

  // Call onComplete callback when progress is done
  if (isComplete && onComplete) {
    setTimeout(onComplete, 100);
  }

  if (!latestUpdate && !progressToken) {
    return null;
  }

  const handleCancel = async () => {
    if (!requestId) return;
    try {
      await cancelRequest(requestId, 'User requested cancellation');
    } catch (err) {
      console.error('Failed to cancel:', err);
    }
  };

  const progressPercent = latestUpdate?.total
    ? (latestUpdate.progress / latestUpdate.total) * 100
    : undefined;

  return (
    <div className={cn('space-y-2', className)}>
      {latestUpdate && (
        <>
          {/* Progress bar */}
          {progressPercent !== undefined ? (
            <Progress value={progressPercent} className="h-2" />
          ) : (
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full w-1/3 bg-primary animate-pulse" />
            </div>
          )}

          {/* Progress info */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {!isComplete && <Loader2 className="h-3 w-3 animate-spin" />}
              <span className="text-muted-foreground">
                {latestUpdate.message || 'Processing...'}
              </span>
            </div>

            {progressPercent !== undefined && (
              <span className="text-muted-foreground font-mono text-xs">
                {Math.round(progressPercent)}%
              </span>
            )}
          </div>

          {/* Progress details */}
          {latestUpdate.total !== undefined && (
            <div className="text-xs text-muted-foreground font-mono">
              {latestUpdate.progress.toFixed(0)} / {latestUpdate.total.toFixed(0)}
            </div>
          )}

          {/* Cancel button */}
          {showCancelButton && requestId && !isComplete && (
            <div className="pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                disabled={isCancelling}
                className="h-7 text-xs"
              >
                {isCancelling ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <XCircle className="h-3 w-3 mr-1" />
                )}
                Cancel
              </Button>
            </div>
          )}

          {/* Cancel error */}
          {cancelError && (
            <p className="text-xs text-red-500">{cancelError.message}</p>
          )}
        </>
      )}
    </div>
  );
}
