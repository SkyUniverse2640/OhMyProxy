"use client";

import { useTokens } from "@/hooks/use-tokens";
import { TokenTable } from "@/components/token-table";
import { Separator } from "@/components/ui/separator";

export default function TokensPage() {
  const { data, loading, error, refetch } = useTokens();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Access Tokens</h1>
        <p className="text-sm text-muted-foreground">
          Manage Postman access tokens for the proxy pool.
        </p>
      </div>
      <Separator />

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <TokenTable tokens={data} loading={loading} onRefresh={refetch} />
    </div>
  );
}
