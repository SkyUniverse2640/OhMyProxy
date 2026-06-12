import React from "react";
import { useLogs } from "../hooks/use-logs";
import { LogViewer } from "../components/log-viewer";

export function Logs() {
  const { data, loading, error, refetch } = useLogs();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Logs</h1>
        <p className="text-sm text-muted-foreground">Proxy request logs</p>
      </div>
      <LogViewer data={data} loading={loading} error={error} onRefresh={refetch} />
    </div>
  );
}
