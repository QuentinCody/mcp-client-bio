"use client";

import { useEffect, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { TokenUsage } from "@/lib/token-usage";
import {
  Activity,
  BarChart3,
  ChevronRight,
  Clock,
  Cpu,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";

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

// Mini ring chart component using SVG
function RingChart({
  value,
  max,
  size = 40,
  strokeWidth = 4,
  color = "var(--primary)",
  bgColor = "var(--muted)",
}: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  bgColor?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const percent = max > 0 ? Math.min(value / max, 1) : 0;
  const offset = circumference - percent * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={bgColor}
        strokeWidth={strokeWidth}
        className="opacity-30"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500 ease-out"
      />
    </svg>
  );
}

// Mini sparkline for response times
function Sparkline({
  data,
  width = 60,
  height = 20,
  color = "var(--primary)",
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="opacity-70"
      />
      {/* Last point indicator */}
      <circle
        cx={width}
        cy={
          height -
          ((data[data.length - 1] - min) / range) * (height - 4) -
          2
        }
        r={2}
        fill={color}
      />
    </svg>
  );
}

// Status indicator with pulse animation
function StatusDot({
  status,
}: {
  status: "success" | "error" | "timeout" | "active";
}) {
  const colors = {
    success: "bg-green-500",
    error: "bg-red-500",
    timeout: "bg-amber-500",
    active: "bg-blue-500",
  };

  return (
    <span className="relative flex h-2 w-2">
      {status === "active" && (
        <span
          className={cn(
            "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
            colors[status]
          )}
        />
      )}
      <span
        className={cn("relative inline-flex rounded-full h-2 w-2", colors[status])}
      />
    </span>
  );
}

// Format numbers with K/M suffixes
function formatCompact(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

// Format time ago
function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export function ToolMetricsObservatory() {
  const [data, setData] = useState<MetricsPayload | null>(null);
  const [tokenStats, setTokenStats] = useState<TokenUsageStats | null>(null);
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<"overview" | "tools" | "tokens" | "activity">(
    "overview"
  );

  // Fetch MCP metrics
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const mod = await import("@/lib/mcp-client");
        if (mod.getMCPMetrics) {
          setData(mod.getMCPMetrics({ includeInvocations: true }));
        }
      } catch {
        // swallow
      }
    };

    fetchMetrics();
    const id = setInterval(fetchMetrics, 4000);
    return () => clearInterval(id);
  }, []);

  // Fetch token usage
  useEffect(() => {
    const fetchTokenStats = async () => {
      try {
        const res = await fetch("/api/token-usage");
        if (res.ok) {
          setTokenStats(await res.json());
        }
      } catch {
        // swallow
      }
    };

    fetchTokenStats();
    const id = setInterval(fetchTokenStats, 4000);
    return () => clearInterval(id);
  }, []);

  // Event listeners for external control
  useEffect(() => {
    if (typeof window === "undefined") return;

    const toggle = () => setOpen((prev) => !prev);
    const openHandler = () => setOpen(true);
    const closeHandler = () => setOpen(false);

    window.addEventListener("tool-metrics:toggle", toggle);
    window.addEventListener("tool-metrics:open", openHandler);
    window.addEventListener("tool-metrics:close", closeHandler);

    return () => {
      window.removeEventListener("tool-metrics:toggle", toggle);
      window.removeEventListener("tool-metrics:open", openHandler);
      window.removeEventListener("tool-metrics:close", closeHandler);
    };
  }, []);

  // Computed stats
  const stats = useMemo(() => {
    if (!data?.metrics)
      return {
        totalCalls: 0,
        successRate: 0,
        avgResponseTime: 0,
        activeTools: 0,
        responseTimes: [] as number[],
      };

    const totalCalls = data.metrics.reduce((sum, m) => sum + m.count, 0);
    const totalSuccess = data.metrics.reduce((sum, m) => sum + m.success, 0);
    const successRate = totalCalls > 0 ? (totalSuccess / totalCalls) * 100 : 0;
    const avgResponseTime =
      totalCalls > 0
        ? Math.round(
            data.metrics.reduce((sum, m) => sum + m.totalMs, 0) / totalCalls
          )
        : 0;
    const activeTools = data.metrics.length;

    // Recent response times for sparkline
    const responseTimes = data.metrics
      .filter((m) => m.lastMs)
      .slice(0, 10)
      .map((m) => m.lastMs!);

    return { totalCalls, successRate, avgResponseTime, activeTools, responseTimes };
  }, [data]);

  const hasData =
    (data && data.metrics.length > 0) ||
    (tokenStats && tokenStats.sessionTotal.totalTokens > 0);

  if (!hasData) return null;

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setOpen(true)}
        style={{ backgroundColor: "hsl(var(--card))" }}
        className={cn(
          "fixed bottom-3 right-3 z-40 flex items-center gap-2 px-3 py-2 rounded-lg",
          "border border-border shadow-lg text-xs font-medium",
          "transition-all duration-200 hover:shadow-xl hover:scale-[1.02]",
          "text-foreground",
          open && "opacity-0 pointer-events-none"
        )}
      >
        <Activity className="h-3.5 w-3.5 text-primary" />
        <span>Observatory</span>
        {stats.totalCalls > 0 && (
          <span className="text-muted-foreground font-mono">
            {formatCompact(stats.totalCalls)}
          </span>
        )}
      </button>

      {/* Slide-out Panel */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-50 w-80 transform transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Backdrop */}
        {open && (
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm -z-10"
            onClick={() => setOpen(false)}
          />
        )}

        {/* Panel Content */}
        <div
          style={{ backgroundColor: "hsl(var(--background))" }}
          className="h-full flex flex-col border-l border-border shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Observatory</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-1 px-2 py-2 border-b border-border">
            {(["overview", "tools", "tokens", "activity"] as const).map((section) => (
              <button
                key={section}
                onClick={() => setActiveSection(section)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-md transition-colors capitalize",
                  activeSection === section
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {section}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4">
            {/* Overview Section */}
            {activeSection === "overview" && (
              <div className="space-y-4">
                {/* Quick Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Total Calls */}
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="h-3.5 w-3.5 text-blue-500" />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Invocations
                      </span>
                    </div>
                    <div className="text-xl font-mono font-bold text-foreground">
                      {formatCompact(stats.totalCalls)}
                    </div>
                  </div>

                  {/* Success Rate */}
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="relative">
                        <RingChart
                          value={stats.successRate}
                          max={100}
                          size={28}
                          strokeWidth={3}
                          color={
                            stats.successRate >= 90
                              ? "rgb(34, 197, 94)"
                              : stats.successRate >= 70
                              ? "rgb(234, 179, 8)"
                              : "rgb(239, 68, 68)"
                          }
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-[8px] font-mono">
                            {Math.round(stats.successRate)}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Success
                      </span>
                    </div>
                    <div className="text-xl font-mono font-bold text-foreground">
                      {stats.successRate.toFixed(1)}%
                    </div>
                  </div>

                  {/* Avg Response Time */}
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Avg Time
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-mono font-bold text-foreground">
                        {stats.avgResponseTime}
                      </span>
                      <span className="text-xs text-muted-foreground">ms</span>
                    </div>
                    {stats.responseTimes.length > 1 && (
                      <div className="mt-1">
                        <Sparkline
                          data={stats.responseTimes}
                          width={50}
                          height={16}
                          color="rgb(245, 158, 11)"
                        />
                      </div>
                    )}
                  </div>

                  {/* Active Tools */}
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Cpu className="h-3.5 w-3.5 text-purple-500" />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Tools
                      </span>
                    </div>
                    <div className="text-xl font-mono font-bold text-foreground">
                      {stats.activeTools}
                    </div>
                  </div>
                </div>

                {/* Token Summary */}
                {tokenStats && tokenStats.sessionTotal.totalTokens > 0 && (
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart3 className="h-3.5 w-3.5 text-green-500" />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Session Tokens
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-mono font-bold text-foreground">
                        {formatCompact(tokenStats.sessionTotal.totalTokens)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({tokenStats.messageCount} msgs)
                      </span>
                    </div>
                    <div className="mt-2 flex gap-3 text-[10px]">
                      <span className="text-blue-500">
                        In: {formatCompact(tokenStats.sessionTotal.inputTokens)}
                      </span>
                      <span className="text-green-500">
                        Out: {formatCompact(tokenStats.sessionTotal.outputTokens)}
                      </span>
                      {tokenStats.sessionTotal.cacheReadTokens > 0 && (
                        <span className="text-purple-500">
                          Cache: {formatCompact(tokenStats.sessionTotal.cacheReadTokens)}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tools Section */}
            {activeSection === "tools" && data?.metrics && (
              <div className="space-y-2">
                {data.metrics.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No tool invocations yet
                  </div>
                ) : (
                  data.metrics.slice(0, 20).map((m) => (
                    <div
                      key={m.name}
                      className="rounded-lg border border-border p-2.5 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="text-xs font-medium text-foreground truncate max-w-[160px]"
                          title={m.name}
                        >
                          {m.name}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <StatusDot
                            status={
                              m.lastStatus === "error"
                                ? "error"
                                : m.lastStatus === "timeout"
                                ? "timeout"
                                : "success"
                            }
                          />
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {m.count}x
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between text-[10px]">
                        <div className="flex gap-2">
                          <span className="text-green-600">{m.success} ok</span>
                          <span className="text-red-500">{m.error} err</span>
                          {m.timeout > 0 && (
                            <span className="text-amber-500">{m.timeout} to</span>
                          )}
                        </div>
                        <span className="text-muted-foreground font-mono">
                          ~{m.avgMs}ms
                        </span>
                      </div>

                      {/* Success rate bar */}
                      <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 transition-all duration-300"
                          style={{
                            width: `${m.count > 0 ? (m.success / m.count) * 100 : 0}%`,
                          }}
                        />
                      </div>

                      {m.lastStatus === "error" && m.lastError && (
                        <div
                          className="mt-1.5 text-[10px] text-red-500 line-clamp-1"
                          title={m.lastError}
                        >
                          {m.lastError}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tokens Section */}
            {activeSection === "tokens" && (
              <div className="space-y-3">
                {tokenStats && tokenStats.sessionTotal.totalTokens > 0 ? (
                  <>
                    {/* Current Session */}
                    <div className="rounded-lg border border-border p-3">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">
                        Current Session
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-blue-500 text-[10px]">Input</div>
                          <div className="font-mono font-medium">
                            {formatCompact(tokenStats.sessionTotal.inputTokens)}
                          </div>
                        </div>
                        <div>
                          <div className="text-green-500 text-[10px]">Output</div>
                          <div className="font-mono font-medium">
                            {formatCompact(tokenStats.sessionTotal.outputTokens)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-border">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground text-xs">Total</span>
                          <span className="font-mono font-bold text-lg">
                            {formatCompact(tokenStats.sessionTotal.totalTokens)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Last Message */}
                    {tokenStats.lastUsage && (
                      <div className="rounded-lg border border-border p-3">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">
                          Last Message
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="flex gap-3 text-[10px]">
                            <span className="text-blue-500">
                              In: {formatCompact(tokenStats.lastUsage.inputTokens)}
                            </span>
                            <span className="text-green-500">
                              Out: {formatCompact(tokenStats.lastUsage.outputTokens)}
                            </span>
                          </div>
                          <span className="font-mono font-medium">
                            {formatCompact(tokenStats.lastUsage.totalTokens)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Recent History */}
                    {tokenStats.recentHistory.length > 1 && (
                      <div className="rounded-lg border border-border p-3">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">
                          Recent ({tokenStats.recentHistory.length})
                        </div>
                        <div className="space-y-1.5 max-h-[200px] overflow-auto">
                          {tokenStats.recentHistory
                            .slice()
                            .reverse()
                            .map((h, i) => (
                              <div
                                key={h.timestamp}
                                className="flex justify-between text-[10px]"
                              >
                                <span className="text-muted-foreground">
                                  #{tokenStats.recentHistory.length - i}
                                  {h.model && (
                                    <span className="ml-1.5 text-primary/60">
                                      {h.model.slice(0, 12)}
                                    </span>
                                  )}
                                </span>
                                <span className="font-mono">
                                  {formatCompact(h.usage.totalTokens)}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    No token usage recorded yet
                  </div>
                )}
              </div>
            )}

            {/* Activity Section */}
            {activeSection === "activity" && (
              <div className="space-y-2">
                {data?.invocations && data.invocations.length > 0 ? (
                  data.invocations.slice(0, 20).map((inv, i) => (
                    <div
                      key={`${inv.tool}-${inv.startedAt}-${i}`}
                      className="rounded-lg border border-border p-2.5 animate-in fade-in slide-in-from-right-2 duration-300"
                      style={{ animationDelay: `${i * 50}ms` }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <StatusDot
                            status={
                              !inv.status
                                ? "active"
                                : inv.status === "error"
                                ? "error"
                                : inv.status === "timeout"
                                ? "timeout"
                                : "success"
                            }
                          />
                          <span
                            className="text-xs font-medium truncate max-w-[140px]"
                            title={inv.tool}
                          >
                            {inv.tool}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {timeAgo(inv.startedAt)}
                        </span>
                      </div>
                      {inv.durationMs !== undefined && (
                        <div className="mt-1 text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{inv.durationMs}ms</span>
                          {inv.durationMs < 500 && (
                            <TrendingDown className="h-3 w-3 text-green-500" />
                          )}
                          {inv.durationMs > 2000 && (
                            <TrendingUp className="h-3 w-3 text-amber-500" />
                          )}
                        </div>
                      )}
                      {inv.error && (
                        <div
                          className="mt-1 text-[10px] text-red-500 line-clamp-1"
                          title={inv.error}
                        >
                          {inv.error}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    No recent activity
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground flex items-center justify-between">
            <span>Auto-refresh: 4s</span>
            <span>Observatory v1.0</span>
          </div>
        </div>
      </div>
    </>
  );
}
