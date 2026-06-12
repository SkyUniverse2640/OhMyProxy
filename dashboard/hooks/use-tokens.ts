"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import type { TokenItem } from "@/lib/types";

export function useTokens() {
  const [data, setData] = useState<TokenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTokens = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tokens = await apiClient.getTokens();
      setData(tokens);
    } catch (err: any) {
      setError(err.message || "Failed to fetch tokens");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  return { data, loading, error, refetch: fetchTokens };
}
