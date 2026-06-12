import { useQuota } from "../hooks/use-quota";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { Activity, BarChart3 } from "lucide-react";

const MAX_REQUESTS_PER_TOKEN = 1000; // Postman daily limit estimate

export function QuotaBar() {
  const { data, loading, error } = useQuota();

  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Quota Usage</CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return null;
  }

  const activeTokens = data.tokens.filter(t => t.active);
  const { total } = data;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          Quota Usage
          <span className="ml-2 text-xs text-muted-foreground">
            ({total.requests} requests, {total.rateLimits} rate limits)
          </span>
        </CardTitle>
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {activeTokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Activity className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No active tokens</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add tokens to see quota usage
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeTokens.map((token) => {
              const pct = Math.min(100, Math.round((token.requestCount / MAX_REQUESTS_PER_TOKEN) * 100));
              const barColor =
                token.rateLimitCount > 0
                  ? "bg-destructive"
                  : pct > 80
                  ? "bg-yellow-500"
                  : "bg-primary";

              return (
                <div key={token.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium truncate max-w-[150px]">
                      {token.label}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {token.requestCount} req
                      {token.rateLimitCount > 0 && (
                        <span className="text-destructive ml-1">
                          ({token.rateLimitCount} limit)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
