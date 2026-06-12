import React from "react";
import { useStatus } from "../hooks/use-status";
import { StatusCard, StatusCardSkeleton } from "../components/status-card";
import { QuotaBar } from "../components/quota-bar";
import { Button } from "../components/ui/button";
import { RefreshCw } from "lucide-react";

export function Status() {
  const { data, loading, error, refetch, autoRefresh, setAutoRefresh } = useStatus();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="text-sm text-muted-foreground">Proxy status and metrics</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? "Auto-refresh On" : "Auto-refresh Off"}
          </Button>
          <Button variant="outline" size="sm" onClick={refetch}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <StatusCardSkeleton />
      ) : error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : data ? (
        <StatusCard data={data} />
      ) : null}

      {/* Quota usage bars */}
      <QuotaBar />
    </div>
  );
}
