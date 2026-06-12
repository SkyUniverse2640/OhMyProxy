import { useState } from "react";
import { useQuota } from "../hooks/use-quota";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { AlertCircle, Activity, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { apiClient } from "../lib/api-client";
import { toast } from "sonner";

function QuotaSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-4 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function QuotaBar() {
  const { data, loading, error, refetch } = useQuota();
  const [refreshing, setRefreshing] = useState<Set<number>>(new Set());

  const handleRefreshToken = async (tokenId: number, label: string) => {
    setRefreshing(prev => new Set(prev).add(tokenId));
    try {
      const result = await apiClient.refreshQuota(tokenId);
      const t = result.tokens?.[0];
      if (t?.error) {
        toast.error(`${label}: ${t.error}`);
      } else if (t?.warning) {
        toast.warning(`${label}: ${t.warning}`);
      } else {
        toast.success(`${label}: ${t?.remaining?.toLocaleString() ?? "?"} remaining`);
      }
      refetch();
    } catch (err: any) {
      toast.error(`${label}: ${err.message || "Refresh failed"}`);
    } finally {
      setRefreshing(prev => {
        const next = new Set(prev);
        next.delete(tokenId);
        return next;
      });
    }
  };

  if (loading) return <QuotaSkeleton />;

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="flex items-center gap-3 py-6">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <div>
            <p className="text-sm font-medium text-destructive">Failed to load quota</p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const activeTokens = data?.tokens.filter((t) => t.active) ?? [];

  if (activeTokens.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Activity className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No active tokens</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add tokens in Tokens page and use the proxy to see usage here
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Total Usage</p>
              <p className="text-xs text-muted-foreground">
                Across {activeTokens.length} active token{activeTokens.length > 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold tabular-nums">{data!.total.requests}</p>
            <p className="text-xs text-muted-foreground">requests</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold tabular-nums">{data!.total.rateLimits}</p>
            <p className="text-xs text-muted-foreground">rate limits</p>
          </div>
        </CardContent>
      </Card>

      {/* Per-token cards */}
      <div className="grid grid-cols-3 gap-4">
        {activeTokens.map((token) => {
          const hasQuota = token.limit > 0;
          const limit = hasQuota ? token.limit : 50000;
          const used = hasQuota ? token.usage : token.requestCount;
          const remaining = Math.max(limit - used, 0);
          const pct = Math.round((remaining / limit) * 100);
          const isLimited = token.usageState === "LIMITED" || token.rateLimitCount > 0;
          const barColor = isLimited ? "bg-destructive" : pct > 50 ? "bg-emerald-500" : pct > 25 ? "bg-yellow-500" : "bg-destructive";

          return (
            <Card key={token.id} className={`min-w-0 ${isLimited ? "border-destructive/30" : ""}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <CardTitle className="text-sm font-medium truncate max-w-[140px]">
                    {token.label}
                  </CardTitle>
                  {isLimited ? (
                    <Badge variant="destructive" className="text-[10px] px-2 py-0 shrink-0">
                      {token.usageState === "LIMITED" ? "Limited" : "Rate Limit"}
                    </Badge>
                  ) : hasQuota ? (
                    <Badge variant="outline" className="text-[10px] px-2 py-0 border-emerald-500/30 text-emerald-400 shrink-0">
                      {token.usageState}
                    </Badge>
                  ) : token.requestCount > 0 ? (
                    <Badge variant="outline" className="text-[10px] px-2 py-0 border-primary/30 text-primary shrink-0">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] px-2 py-0 shrink-0">
                      Idle
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => handleRefreshToken(token.id, token.label)}
                  disabled={refreshing.has(token.id)}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing.has(token.id) ? "animate-spin" : ""}`} />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Remaining quota bar */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">
                      {hasQuota ? `Remaining: ${remaining.toLocaleString()} / ${limit.toLocaleString()}` : `${token.requestCount} requests`}
                    </span>
                    {hasQuota && <span className="tabular-nums font-medium">{pct}%</span>}
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barColor}`}
                      style={{ width: hasQuota ? `${Math.max(pct, 2)}%` : `${Math.min(token.requestCount, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3" />
                    {hasQuota ? `${used.toLocaleString()} used` : `${token.requestCount} requests`}
                  </div>
                  {token.rateLimitCount > 0 && (
                    <div className="flex items-center gap-1.5 text-destructive">
                      <XCircle className="h-3 w-3" />
                      {token.rateLimitCount}
                    </div>
                  )}
                </div>

                {/* Cycle info */}
                {hasQuota && (
                  <p className="text-[10px] text-muted-foreground">
                    Cycle: {new Date(token.cycleStart).toLocaleDateString()} → {new Date(token.cycleEnd).toLocaleDateString()}
                  </p>
                )}

                {token.lastUsed && (
                  <p className="text-[10px] text-muted-foreground">
                    Last: {new Date(token.lastUsed).toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
