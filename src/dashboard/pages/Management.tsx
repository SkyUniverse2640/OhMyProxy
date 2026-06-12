import React, { useState, useCallback } from "react";
import { QuotaBar } from "../components/quota-bar";
import { Button } from "../components/ui/button";
import { RefreshCw } from "lucide-react";
import { apiClient } from "../lib/api-client";
import { toast } from "sonner";

export function Management() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await apiClient.refreshQuota();
      toast.success(`Refreshed ${result.refreshed} token${result.refreshed !== 1 ? "s" : ""}`);
    } catch (err: any) {
      toast.error(err.message || "Refresh failed");
    }
    setRefreshKey(k => k + 1);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Token Quota</h1>
          <p className="text-sm text-muted-foreground">Real-time quota from Postman. Click refresh to probe /chat for latest usage.</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefreshAll} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing..." : "Refresh All"}
        </Button>
      </div>
      <QuotaBar key={refreshKey} />
    </div>
  );
}
