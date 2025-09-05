"use client";
import { useEffect, useState } from 'react';

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

// Access the global (window) functions exported via MCP client through a bridge
// We'll attach them on first render if available
export function ToolMetricsPanel() {
  const [data, setData] = useState<MetricsPayload | null>(null);
  const [open, setOpen] = useState(false);

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

  if (!data || data.metrics.length === 0) return null;

  return (
    <div className="fixed bottom-3 right-3 z-40 text-xs">
      <button
        onClick={() => setOpen(o => !o)}
        className="px-2 py-1 rounded-md bg-muted/70 hover:bg-muted text-foreground shadow-sm border border-border/40"
      >{open ? 'Hide' : 'Tools'}</button>
      {open && (
        <div className="mt-2 w-[320px] max-h-[340px] overflow-auto rounded-md border border-border/50 bg-background/95 backdrop-blur p-2 shadow-lg space-y-3">
          <div className="font-medium text-foreground/90 mb-1">Tool Metrics</div>
          <div className="space-y-2">
            {data.metrics.slice(0,25).map(m => (
              <div key={m.name} className="border border-border/40 rounded p-1.5">
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
