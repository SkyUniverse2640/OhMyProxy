
import { useState, useRef, useEffect } from "react";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Skeleton } from "./ui/skeleton";
import { Input } from "./ui/input";
import { Trash2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "../lib/api-client";
import { ConfirmDialog } from "./confirm-dialog";
import type { LogsResponse } from "../lib/types";

interface LogViewerProps {
  data: LogsResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

const LOG_LEVELS = ["all", "debug", "info", "warn", "error"] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

const LOG_LEVEL_COLORS: Record<string, string> = {
  debug: "text-muted-foreground",
  info: "text-blue-400",
  warn: "text-yellow-400",
  error: "text-red-400",
};

function getLogLevel(line: string): string {
  const lower = line.toLowerCase();
  if (lower.includes("❌") || lower.includes("[error]") || lower.includes(" error ")) return "error";
  if (lower.includes("⚠️") || lower.includes("[warn]") || lower.includes(" warn ")) return "warn";
  if (lower.includes("[info]") || lower.includes(" info ")) return "info";
  if (lower.includes("[debug]") || lower.includes(" debug ")) return "debug";
  return "info";
}

function getLogColor(line: string): string {
  return LOG_LEVEL_COLORS[getLogLevel(line)] ?? "text-foreground";
}

export function LogViewer({ data, loading, error, onRefresh }: LogViewerProps) {
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [levelFilter, setLevelFilter] = useState<LogLevel>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const filteredLines = data?.lines.filter((line) => {
    if (levelFilter !== "all" && getLogLevel(line) !== levelFilter) return false;
    if (searchQuery && !line.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }) ?? [];

  // Auto-scroll to bottom when new data arrives
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      const viewport = scrollRef.current.querySelector<HTMLDivElement>("[data-radix-scroll-area-viewport]");
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [data, autoScroll]);

  // Detect manual scroll to disable auto-scroll
  const handleScroll = () => {
    const viewport = scrollRef.current?.querySelector<HTMLDivElement>("[data-radix-scroll-area-viewport]");
    if (viewport) {
      const isAtBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 50;
      setAutoScroll(isAtBottom);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await apiClient.deleteLogs();
      toast.success("Logs cleared");
      setShowClearConfirm(false);
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

  const activeFilterCount = (levelFilter !== "all" ? 1 : 0) + (searchQuery ? 1 : 0);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {data ? `${filteredLines.length} / ${data.total} line${data.total !== 1 ? "s" : ""}` : "No logs"}
          {activeFilterCount > 0 && (
            <span className="ml-1 text-xs">(filtered)</span>
          )}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowClearConfirm(true)}
            disabled={!data || data.total === 0}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v as LogLevel)}>
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            {LOG_LEVELS.map((lvl) => (
              <SelectItem key={lvl} value={lvl} className="text-xs">
                {lvl === "all" ? "All Levels" : lvl.charAt(0).toUpperCase() + lvl.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Log content */}
      {filteredLines.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {data && data.total > 0 ? "No matching log entries" : "No log entries"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {data && data.total > 0
              ? "Try adjusting your filters."
              : "Logs will appear here when the proxy processes requests."}
          </p>
        </div>
      ) : (
        <div className="rounded-md border bg-black/50" ref={scrollRef}>
          <ScrollArea className="h-[600px]" onScroll={handleScroll}>
            <pre className="p-4 font-mono text-xs leading-relaxed">
              {filteredLines.map((line, i) => (
                <div key={i} className={getLogColor(line)}>
                  {line}
                </div>
              ))}
            </pre>
          </ScrollArea>
          {!autoScroll && (
            <div className="flex justify-center border-t bg-background/80 py-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setAutoScroll(true)}
              >
                ↓ Auto-scroll
              </Button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={showClearConfirm}
        onOpenChange={setShowClearConfirm}
        title="Clear Logs"
        description="Are you sure you want to clear all log entries? This action cannot be undone."
        confirmLabel="Clear All"
        variant="destructive"
        loading={clearing}
        onConfirm={handleClear}
      />
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
      <div className="flex gap-2">
        <Skeleton className="h-8 w-[200px]" />
        <Skeleton className="h-8 w-[110px]" />
      </div>
      <Skeleton className="h-[600px] w-full rounded-md" />
    </div>
  );
}
