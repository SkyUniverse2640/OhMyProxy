"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import type { LogsResponse } from "@/lib/types";

interface LogViewerProps {
  data: LogsResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

const LOG_LEVEL_COLORS: Record<string, string> = {
  debug: "text-muted-foreground",
  info: "text-blue-400",
  warn: "text-yellow-400",
  error: "text-red-400",
};

function getLogColor(line: string): string {
  const lower = line.toLowerCase();
  if (lower.includes("[error]") || lower.includes(" error ")) return LOG_LEVEL_COLORS.error;
  if (lower.includes("[warn]") || lower.includes(" warn ")) return LOG_LEVEL_COLORS.warn;
  if (lower.includes("[info]") || lower.includes(" info ")) return LOG_LEVEL_COLORS.info;
  if (lower.includes("[debug]") || lower.includes(" debug ")) return LOG_LEVEL_COLORS.debug;
  return "text-foreground";
}

export function LogViewer({ data, loading, error, onRefresh }: LogViewerProps) {
  const [clearing, setClearing] = useState(false);

  const handleClear = async () => {
    setClearing(true);
    try {
      await apiClient.deleteLogs();
      toast.success("Logs cleared");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to clear logs");
    } finally {
      setClearing(false);
    }
  };

  if (loading) {
    return <LogViewerSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-lg border p-8 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={onRefresh}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} line${data.total !== 1 ? "s" : ""}` : "No logs"}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={clearing || !data || data.total === 0}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear
          </Button>
        </div>
      </div>

      {!data || data.lines.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border py-12 text-center">
          <p className="text-sm text-muted-foreground">No log entries</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Logs will appear here when the proxy processes requests.
          </p>
        </div>
      ) : (
        <div className="rounded-md border bg-black/50">
          <ScrollArea className="h-[600px]">
            <pre className="p-4 font-mono text-xs leading-relaxed">
              {data.lines.map((line, i) => (
                <div key={i} className={getLogColor(line)}>
                  {line}
                </div>
              ))}
            </pre>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

function LogViewerSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-20" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <Skeleton className="h-[600px] w-full rounded-md" />
    </div>
  );
}
