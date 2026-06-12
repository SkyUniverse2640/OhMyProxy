import React from "react";
import { useTokens } from "../hooks/use-tokens";
import { TokenTable } from "../components/token-table";

export function Tokens() {
  const { data, loading, error, refetch } = useTokens();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tokens</h1>
        <p className="text-sm text-muted-foreground">Manage access tokens for round-robin proxy</p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <TokenTable tokens={data} loading={loading} onRefresh={refetch} />
    </div>
  );
}
