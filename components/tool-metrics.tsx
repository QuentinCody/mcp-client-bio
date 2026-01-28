"use client";
import { useEffect, useState } from 'react';
import type { TokenUsage } from '@/lib/token-usage';

// Re-export the new Observatory component as the main panel
export { ToolMetricsObservatory as ToolMetricsPanel } from './tool-metrics-observatory';

interface ToolMetricEntry {
  name: string;
  count: number;
  success: number;
  error: number;
  timeout: number;
  totalMs: number;
  lastMs?: number;
  lastStatus?: string;
  lastError?: string;
  lastInvokedAt?: number;
  avgMs: number;
  successRate: number;
}

interface MetricsPayload {
  metrics: ToolMetricEntry[];
  invocations?: Array<{
    tool: string;
    startedAt: number;
    durationMs?: number;
    status?: string;
    error?: string;
  }>;
}

interface TokenUsageStats {
  lastUsage: TokenUsage | null;
  sessionTotal: TokenUsage;
  messageCount: number;
  recentHistory: Array<{ timestamp: number; usage: TokenUsage; model?: string }>;
}

// Legacy compact panel - kept for backward compatibility
// Access the global (window) functions exported via MCP client through a bridge
// We'll attach them on first render if available
export function ToolMetricsPanelLegacy() {
  const [data, setData] = useState<MetricsPayload | null>(null);
  const [tokenStats, setTokenStats] = useState<TokenUsageStats | null>(null);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'tools' | 'tokens'>('tools');

  useEffect(() => {
    // Dynamically import to avoid SSR issues
    (async () => {
      try {
        const mod = await import('@/lib/mcp-client');
        if (mod.getMCPMetrics) {
          const payload = mod.getMCPMetrics({ includeInvocations: true });
          setData(payload);
        }
      } catch (e) {
        // swallow
      }
    })();
    const id = setInterval(() => {
      import('@/lib/mcp-client').then(mod => {
        if (mod.getMCPMetrics) {
          setData(mod.getMCPMetrics({ includeInvocations: true }));
        }
      });
    }, 4000);
    return () => clearInterval(id);
  }, []);

  // Fetch token usage stats
  useEffect(() => {
    const fetchTokenStats = async () => {
      try {
        const res = await fetch('/api/token-usage');
        if (res.ok) {
          const stats = await res.json();
          setTokenStats(stats);
        }
      } catch (e) {
        // swallow
      }
    };

    fetchTokenStats();
    const id = setInterval(fetchTokenStats, 4000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const toggle = () => setOpen((prev) => !prev);
    const openHandler = () => setOpen(true);
    const closeHandler = () => setOpen(false);

    window.addEventListener('tool-metrics:toggle', toggle);
    window.addEventListener('tool-metrics:open', openHandler);
    window.addEventListener('tool-metrics:close', closeHandler);

    return () => {
      window.removeEventListener('tool-metrics:toggle', toggle);
      window.removeEventListener('tool-metrics:open', openHandler);
      window.removeEventListener('tool-metrics:close', closeHandler);
    };
  }, []);

  const hasToolMetrics = data && data.metrics.length > 0;
  const hasTokenStats = tokenStats && tokenStats.sessionTotal.totalTokens > 0;

  if (!hasToolMetrics && !hasTokenStats) return null;

  const formatNumber = (n: number) => n.toLocaleString();

  return (
    <div className="fixed bottom-3 right-3 z-40 text-xs">
      <button
        onClick={() => setOpen(o => !o)}
        style={{ backgroundColor: 'hsl(var(--card))' }}
        className="px-2.5 py-1.5 rounded-lg bg-card hover:bg-muted text-foreground shadow-sm border border-border transition-colors"
      >
        {open ? 'Hide metrics' : 'Metrics'}
        {hasTokenStats && !open && (
          <span className="ml-1.5 text-muted-foreground">
            {tokenStats.lastUsage ? (
              <>last: {formatNumber(tokenStats.lastUsage.totalTokens)}</>
            ) : (
              <>{tokenStats.messageCount} msgs</>
            )}
          </span>
        )}
      </button>
      {open && (
        <div style={{ backgroundColor: 'hsl(var(--background))' }} className="mt-2 w-[320px] max-h-[400px] overflow-auto rounded-xl border border-border bg-background p-3 shadow-lg">
          {/* Tabs */}
          <div className="flex gap-1 mb-3 border-b border-border pb-2">
            <button
              onClick={() => setActiveTab('tokens')}
              className={`px-2.5 py-1 rounded-md transition-colors ${activeTab === 'tokens' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
            >
              Tokens
            </button>
            <button
              onClick={() => setActiveTab('tools')}
              className={`px-2.5 py-1 rounded-md transition-colors ${activeTab === 'tools' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
            >
              Tools
            </button>
          </div>

          {/* Token Usage Tab */}
          {activeTab === 'tokens' && (
            <div className="space-y-3">
              <div className="text-sm font-medium text-foreground">Token Usage</div>
              {tokenStats && tokenStats.sessionTotal.totalTokens > 0 ? (
                <>
                  {/* Session Total & Last Message - Side by Side */}
                  <div className="flex gap-2">
                    {/* Session Total */}
                    <div className="flex-1 rounded-lg border border-border p-2 bg-primary/5">
                      <div className="text-[10px] text-muted-foreground mb-1">Session ({tokenStats.messageCount} msgs)</div>
                      <div className="space-y-0.5 text-[10px]">
                        <div className="text-blue-600 dark:text-blue-400">In: {formatNumber(tokenStats.sessionTotal.inputTokens)}</div>
                        <div className="text-green-600 dark:text-green-400">Out: {formatNumber(tokenStats.sessionTotal.outputTokens)}</div>
                      </div>
                      <div className="mt-1 text-foreground font-medium text-xs">
                        {formatNumber(tokenStats.sessionTotal.totalTokens)}
                      </div>
                      {tokenStats.sessionTotal.cacheReadTokens > 0 && (
                        <div className="text-purple-600 dark:text-purple-400 text-[9px]">
                          Cache: {formatNumber(tokenStats.sessionTotal.cacheReadTokens)}
                        </div>
                      )}
                    </div>

                    {/* Last Message */}
                    {tokenStats.lastUsage && (
                      <div className="flex-1 rounded-lg border border-border p-2">
                        <div className="text-[10px] text-muted-foreground mb-1">Last Message</div>
                        <div className="space-y-0.5 text-[10px]">
                          <div className="text-blue-600 dark:text-blue-400">In: {formatNumber(tokenStats.lastUsage.inputTokens)}</div>
                          <div className="text-green-600 dark:text-green-400">Out: {formatNumber(tokenStats.lastUsage.outputTokens)}</div>
                        </div>
                        <div className="mt-1 text-foreground font-medium text-xs">
                          {formatNumber(tokenStats.lastUsage.totalTokens)}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Recent History */}
                  {tokenStats.recentHistory.length > 1 && (
                    <div className="rounded-lg border border-border p-2.5">
                      <div className="text-[10px] text-muted-foreground mb-1">Recent ({tokenStats.recentHistory.length})</div>
                      <div className="space-y-1 max-h-[100px] overflow-auto">
                        {tokenStats.recentHistory.slice().reverse().map((h, i) => (
                          <div key={h.timestamp} className="flex justify-between text-[10px]">
                            <span className="text-muted-foreground">
                              #{tokenStats.recentHistory.length - i}
                              {h.model && <span className="ml-1 text-primary/60">{h.model.slice(0, 15)}</span>}
                            </span>
                            <span>{formatNumber(h.usage.totalTokens)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-muted-foreground text-center py-4">
                  No token usage recorded yet
                </div>
              )}
            </div>
          )}

          {/* Tools Tab */}
          {activeTab === 'tools' && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Tool Metrics</div>
              {hasToolMetrics ? (
                data.metrics.slice(0,25).map(m => (
                  <div key={m.name} className="rounded-lg border border-border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-foreground/90 truncate max-w-[180px]" title={m.name}>{m.name}</span>
                      <span className="text-[10px] text-muted-foreground">{m.count} calls</span>
                    </div>
                    <div className="mt-1 grid grid-cols-4 gap-1 text-[10px]">
                      <div className="text-green-600">ok {m.success}</div>
                      <div className="text-red-500">err {m.error}</div>
                      <div className="text-amber-500">to {m.timeout}</div>
                      <div className="text-muted-foreground">avg {m.avgMs}ms</div>
                    </div>
                    {m.lastStatus && (
                      <div className="mt-0.5 text-[10px] flex justify-between text-muted-foreground">
                        <span>{m.lastStatus}{m.lastStatus==='error' && m.lastError ? ':' : ''}</span>
                        {m.lastMs && <span>{m.lastMs}ms</span>}
                      </div>
                    )}
                    {m.lastStatus==='error' && m.lastError && (
                      <div className="mt-0.5 text-[10px] text-red-500 line-clamp-2" title={m.lastError}>{m.lastError}</div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-muted-foreground text-center py-4">
                  No tool metrics recorded yet
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
