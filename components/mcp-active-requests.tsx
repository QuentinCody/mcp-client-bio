/**
 * MCP Active Requests Component
 * Displays all active MCP requests with cancellation controls
 */

'use client';

import { useActiveRequests, useMCPCancellation } from '@/lib/hooks/use-mcp-progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, XCircle, Clock } from 'lucide-react';
// Simple time ago formatting without external dependencies
function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function MCPActiveRequests() {
  const { activeRequests, isLoading } = useActiveRequests();
  const { cancelRequest, isCancelling } = useMCPCancellation();

  const handleCancel = async (requestId: string) => {
    try {
      await cancelRequest(requestId, 'User requested cancellation');
    } catch (err) {
      console.error('Failed to cancel:', err);
    }
  };

  if (isLoading) {
    return null;
  }

  if (activeRequests.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Active MCP Requests
        </CardTitle>
        <CardDescription>
          {activeRequests.length} {activeRequests.length === 1 ? 'request' : 'requests'}{' '}
          in progress
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {activeRequests.map((request) => (
          <div
            key={request.id}
            className="flex items-center justify-between p-3 border rounded-lg"
          >
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs font-mono">
                  {request.server}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  <Activity className="h-3 w-3 mr-1 animate-pulse" />
                  Running
                </Badge>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Started {timeAgo(request.timestamp)}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCancel(request.id)}
              disabled={isCancelling}
            >
              <XCircle className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
