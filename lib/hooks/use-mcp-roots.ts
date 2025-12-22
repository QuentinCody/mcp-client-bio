/**
 * React hooks for managing MCP roots
 */

import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface Root {
  uri: string;
  name?: string;
}

/**
 * Hook to fetch and manage MCP roots
 */
export function useMCPRoots() {
  const queryClient = useQueryClient();

  // Fetch roots
  const {
    data: roots = [],
    isLoading,
    error,
  } = useQuery<Root[]>({
    queryKey: ['mcp-roots'],
    queryFn: async () => {
      const response = await fetch('/api/mcp-roots');
      if (!response.ok) {
        throw new Error('Failed to fetch roots');
      }
      const data = await response.json();
      return data.roots || [];
    },
  });

  // Add root mutation
  const addRootMutation = useMutation({
    mutationFn: async ({ uri, name }: { uri: string; name?: string }) => {
      const response = await fetch('/api/mcp-roots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', uri, name }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add root');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-roots'] });
    },
  });

  // Remove root mutation
  const removeRootMutation = useMutation({
    mutationFn: async (uri: string) => {
      const response = await fetch(`/api/mcp-roots?uri=${encodeURIComponent(uri)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to remove root');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-roots'] });
    },
  });

  // Set all roots mutation
  const setRootsMutation = useMutation({
    mutationFn: async (roots: Root[]) => {
      const response = await fetch('/api/mcp-roots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set', roots }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to set roots');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-roots'] });
    },
  });

  const addRoot = useCallback(
    (uri: string, name?: string) => {
      return addRootMutation.mutateAsync({ uri, name });
    },
    [addRootMutation]
  );

  const removeRoot = useCallback(
    (uri: string) => {
      return removeRootMutation.mutateAsync(uri);
    },
    [removeRootMutation]
  );

  const setRoots = useCallback(
    (roots: Root[]) => {
      return setRootsMutation.mutateAsync(roots);
    },
    [setRootsMutation]
  );

  return {
    roots,
    isLoading,
    error,
    addRoot,
    removeRoot,
    setRoots,
    isAdding: addRootMutation.isPending,
    isRemoving: removeRootMutation.isPending,
    isSetting: setRootsMutation.isPending,
  };
}
