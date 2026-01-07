/**
 * Tests for Enhanced MCP Client Features
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  setMCPRoots,
  addMCPRoot,
  removeMCPRoot,
  getMCPRoots,
  recordProgressUpdate,
  getProgressUpdatesForToken,
  clearProgressUpdates,
  trackRequest,
  untrackRequest,
  getActiveRequests,
  MCP_PROTOCOL_VERSION,
} from '../lib/mcp-client-enhanced';

describe('MCP Enhanced Features', () => {
  beforeEach(() => {
    // Reset state before each test
    setMCPRoots([]);
    clearProgressUpdates('test-token');
  });

  describe('Protocol Version', () => {
    it('should export correct protocol version', () => {
      expect(MCP_PROTOCOL_VERSION).toBe('2025-11-25');
    });
  });

  describe('Roots Management', () => {
    it('should add a root', () => {
      addMCPRoot('file:///home/user/project', 'My Project');
      const roots = getMCPRoots();

      expect(roots).toHaveLength(1);
      expect(roots[0]).toEqual({
        uri: 'file:///home/user/project',
        name: 'My Project',
      });
    });

    it('should not add duplicate roots', () => {
      addMCPRoot('file:///home/user/project', 'My Project');
      addMCPRoot('file:///home/user/project', 'My Project');
      const roots = getMCPRoots();

      expect(roots).toHaveLength(1);
    });

    it('should reject non-file:// URIs', () => {
      expect(() => {
        addMCPRoot('http://example.com', 'Invalid');
      }).toThrow('Root URI must start with file://');
    });

    it('should remove a root', () => {
      addMCPRoot('file:///home/user/project1', 'Project 1');
      addMCPRoot('file:///home/user/project2', 'Project 2');

      removeMCPRoot('file:///home/user/project1');
      const roots = getMCPRoots();

      expect(roots).toHaveLength(1);
      expect(roots[0].uri).toBe('file:///home/user/project2');
    });

    it('should set all roots at once', () => {
      const newRoots = [
        { uri: 'file:///home/user/project1', name: 'Project 1' },
        { uri: 'file:///home/user/project2', name: 'Project 2' },
      ];

      setMCPRoots(newRoots);
      const roots = getMCPRoots();

      expect(roots).toEqual(newRoots);
    });

    it('should validate all roots when setting', () => {
      expect(() => {
        setMCPRoots([
          { uri: 'file:///valid', name: 'Valid' },
          { uri: 'http://invalid', name: 'Invalid' },
        ]);
      }).toThrow('Root URI must start with file://');
    });
  });

  describe('Progress Tracking', () => {
    it('should record progress updates', () => {
      const update = {
        progressToken: 'test-token',
        progress: 50,
        total: 100,
        message: 'Processing...',
        timestamp: Date.now(),
      };

      recordProgressUpdate(update);
      const updates = getProgressUpdatesForToken('test-token');

      expect(updates).toHaveLength(1);
      expect(updates[0]).toEqual(update);
    });

    it('should accumulate multiple updates for same token', () => {
      const baseTime = Date.now();

      recordProgressUpdate({
        progressToken: 'test-token',
        progress: 25,
        total: 100,
        timestamp: baseTime,
      });

      recordProgressUpdate({
        progressToken: 'test-token',
        progress: 50,
        total: 100,
        timestamp: baseTime + 1000,
      });

      const updates = getProgressUpdatesForToken('test-token');
      expect(updates).toHaveLength(2);
      expect(updates[0].progress).toBe(25);
      expect(updates[1].progress).toBe(50);
    });

    it('should clear progress updates', () => {
      recordProgressUpdate({
        progressToken: 'test-token',
        progress: 100,
        total: 100,
        timestamp: Date.now(),
      });

      clearProgressUpdates('test-token');
      const updates = getProgressUpdatesForToken('test-token');

      expect(updates).toHaveLength(0);
    });

    it('should return empty array for unknown token', () => {
      const updates = getProgressUpdatesForToken('unknown-token');
      expect(updates).toEqual([]);
    });
  });

  describe('Request Tracking', () => {
    it('should track active requests', () => {
      trackRequest('req-123', 'pubmed-server');
      const active = getActiveRequests();

      expect(active.has('req-123')).toBe(true);
      expect(active.get('req-123')?.server).toBe('pubmed-server');
    });

    it('should untrack completed requests', () => {
      trackRequest('req-123', 'pubmed-server');
      untrackRequest('req-123');
      const active = getActiveRequests();

      expect(active.has('req-123')).toBe(false);
    });

    it('should track multiple requests', () => {
      trackRequest('req-1', 'server-1');
      trackRequest('req-2', 'server-2');
      const active = getActiveRequests();

      expect(active.size).toBe(2);
      expect(active.has('req-1')).toBe(true);
      expect(active.has('req-2')).toBe(true);
    });

    it('should include timestamp in tracked requests', () => {
      const before = Date.now();
      trackRequest('req-123', 'server');
      const after = Date.now();

      const active = getActiveRequests();
      const request = active.get('req-123');

      expect(request?.timestamp).toBeGreaterThanOrEqual(before);
      expect(request?.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('Integration', () => {
    it('should handle complete request lifecycle', () => {
      // 1. Configure roots
      addMCPRoot('file:///workspace', 'Workspace');

      // 2. Track request
      trackRequest('req-123', 'test-server');

      // 3. Record progress
      recordProgressUpdate({
        progressToken: 'progress-123',
        progress: 50,
        total: 100,
        message: 'Processing...',
        timestamp: Date.now(),
      });

      // 4. Verify state
      expect(getMCPRoots()).toHaveLength(1);
      expect(getActiveRequests().has('req-123')).toBe(true);
      expect(getProgressUpdatesForToken('progress-123')).toHaveLength(1);

      // 5. Complete request
      recordProgressUpdate({
        progressToken: 'progress-123',
        progress: 100,
        total: 100,
        message: 'Complete',
        timestamp: Date.now(),
      });
      untrackRequest('req-123');
      clearProgressUpdates('progress-123');

      // 6. Verify cleanup
      expect(getActiveRequests().has('req-123')).toBe(false);
      expect(getProgressUpdatesForToken('progress-123')).toHaveLength(0);
    });
  });
});
