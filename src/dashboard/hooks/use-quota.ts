import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../lib/api-client";
import type { QuotaResponse } from "../lib/types";

export function useQuota() {
  const [data, setData] = useState<QuotaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQuota = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const quota = await apiClient.getQuota();
      setData(quota);
    } catch (err: any) {
      setError(err.message || "Failed to fetch quota");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuota();
  }, [fetchQuota]);

  return { data, loading, error, refetch: fetchQuota };
}
