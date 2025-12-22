/**
 * React hooks for MCP progress tracking and cancellation
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';

export interface ProgressUpdate {
  progressToken: string;
  progress: number;
  total?: number;
  message?: string;
  timestamp: number;
}

export interface ActiveRequest {
  id: string;
  timestamp: number;
  server: string;
}

/**
 * Hook to track progress for a specific token
 */
export function useProgressTracking(token?: string) {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<{ updates: ProgressUpdate[] }>({
    queryKey: ['mcp-progress', token],
    queryFn: async () => {
      const url = token
        ? `/api/mcp-progress?token=${encodeURIComponent(token)}`
        : '/api/mcp-progress';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch progress');
      }
      return response.json();
    },
    enabled: !!token,
    refetchInterval: token ? 1000 : false, // Poll every second when tracking
  });

  const updates = data?.updates || [];
  const latestUpdate = updates[updates.length - 1];

  return {
    updates,
    latestUpdate,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to get all active MCP requests
 */
export function useActiveRequests() {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<{ active: ActiveRequest[] }>({
    queryKey: ['mcp-active-requests'],
    queryFn: async () => {
      const response = await fetch('/api/mcp-progress');
      if (!response.ok) {
        throw new Error('Failed to fetch active requests');
      }
      return response.json();
    },
    refetchInterval: 2000, // Poll every 2 seconds
  });

  return {
    activeRequests: data?.active || [],
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to cancel MCP requests
 */
export function useMCPCancellation() {
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<Error | null>(null);

  const cancelRequest = useCallback(
    async (requestId: string, reason?: string) => {
      setIsCancelling(true);
      setCancelError(null);

      try {
        const response = await fetch('/api/mcp-cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId, reason }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to cancel request');
        }

        return await response.json();
      } catch (error) {
        setCancelError(error as Error);
        throw error;
      } finally {
        setIsCancelling(false);
      }
    },
    []
  );

  return {
    cancelRequest,
    isCancelling,
    cancelError,
  };
}

/**
 * Combined hook for progress tracking with cancellation
 */
export function useProgressWithCancellation(token?: string) {
  const progress = useProgressTracking(token);
  const cancellation = useMCPCancellation();

  return {
    ...progress,
    ...cancellation,
  };
}
