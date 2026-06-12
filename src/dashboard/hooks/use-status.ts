
import { useState, useEffect, useCallback, useRef } from "react";
import { apiClient } from "../lib/api-client";
import type { ProxyStatus } from "../lib/types";

const POLL_INTERVAL = 10_000; // 10 seconds

export function useStatus() {
  const [data, setData] = useState<ProxyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await apiClient.getStatus();
      setData(status);
    } catch (err: any) {
      setError(err.message || "Failed to fetch status");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-refresh polling
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, fetchStatus]);

  return { data, loading, error, refetch: fetchStatus, autoRefresh, setAutoRefresh };
}
