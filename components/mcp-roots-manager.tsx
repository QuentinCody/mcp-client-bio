/**
 * MCP Roots Manager Component
 * UI for managing filesystem roots exposed to MCP servers
 */

'use client';

import { useState } from 'react';
import { useMCPRoots } from '@/lib/hooks/use-mcp-roots';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FolderOpen, Plus, Trash2, Loader2 } from 'lucide-react';

export function MCPRootsManager() {
  const { roots, isLoading, addRoot, removeRoot, isAdding, isRemoving } = useMCPRoots();
  const [newRootUri, setNewRootUri] = useState('');
  const [newRootName, setNewRootName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAddRoot = async () => {
    if (!newRootUri) {
      setError('URI is required');
      return;
    }

    if (!newRootUri.startsWith('file://')) {
      setError('URI must start with file://');
      return;
    }

    try {
      setError(null);
      await addRoot(newRootUri, newRootName || undefined);
      setNewRootUri('');
      setNewRootName('');
    } catch (err: any) {
      setError(err.message || 'Failed to add root');
    }
  };

  const handleRemoveRoot = async (uri: string) => {
    try {
      setError(null);
      await removeRoot(uri);
    } catch (err: any) {
      setError(err.message || 'Failed to remove root');
    }
  };

  const handleBrowseDirectory = () => {
    // For browser-based selection, we'd need to use File System Access API
    // For now, show a hint to the user
    const cwd = typeof window !== 'undefined' && window.location.pathname;
    if (cwd) {
      setNewRootUri(`file://${cwd}`);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          MCP Filesystem Roots
        </CardTitle>
        <CardDescription>
          Configure directories that MCP servers can access. Roots define filesystem
          boundaries for security and access control.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new root */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="file:///path/to/directory"
              value={newRootUri}
              onChange={(e) => setNewRootUri(e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="Name (optional)"
              value={newRootName}
              onChange={(e) => setNewRootName(e.target.value)}
              className="w-40"
            />
            <Button
              onClick={handleAddRoot}
              disabled={isAdding || !newRootUri}
              size="sm"
            >
              {isAdding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </div>
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
        </div>

        {/* Roots list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : roots.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FolderOpen className="h-12 w-12 mx-auto mb-2 opacity-20" />
            <p>No roots configured</p>
            <p className="text-sm">
              Add a directory to expose it to MCP servers
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {roots.map((root) => (
              <div
                key={root.uri}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  {root.name && (
                    <div className="font-medium text-sm mb-1">{root.name}</div>
                  )}
                  <div className="text-xs text-muted-foreground truncate font-mono">
                    {root.uri}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveRoot(root.uri)}
                  disabled={isRemoving}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Info badge */}
        <div className="pt-2">
          <Badge variant="secondary" className="text-xs">
            {roots.length} {roots.length === 1 ? 'root' : 'roots'} configured
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
