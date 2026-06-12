"use client";

import { useLogs } from "@/hooks/use-logs";
import { LogViewer } from "@/components/log-viewer";
import { Separator } from "@/components/ui/separator";

export default function LogsPage() {
  const { data, loading, error, refetch } = useLogs();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Logs</h1>
        <p className="text-sm text-muted-foreground">
          View the proxy request logs in real-time.
        </p>
      </div>
      <Separator />

      <LogViewer data={data} loading={loading} error={error} onRefresh={refetch} />
    </div>
  );
}
