import React, { useState } from "react";
import { useTokens } from "../hooks/use-tokens";
import { TokenTable } from "../components/token-table";
import { Button } from "../components/ui/button";
import { Plug } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "../lib/api-client";

export function Tokens() {
  const { data, loading, error, refetch } = useTokens();
  const [connecting, setConnecting] = useState(false);

  const handleConnectPostman = async () => {
    setConnecting(true);
    try {
      const { url } = await apiClient.getOAuthLoginUrl();
      // Open Postman OAuth in new window
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      const popup = window.open(
        url,
        "Postman OAuth",
        `width=${width},height=${height},left=${left},top=${top}`
      );

      // Poll for popup close, then refresh tokens
      const interval = setInterval(() => {
        if (popup?.closed) {
          clearInterval(interval);
          toast.success("Postman account connected!");
          refetch();
        }
      }, 1000);

      // Stop polling after 5 minutes
      setTimeout(() => clearInterval(interval), 300_000);
    } catch (err: any) {
      toast.error(err.message || "Failed to start OAuth flow");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tokens</h1>
          <p className="text-sm text-muted-foreground">Manage access tokens</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleConnectPostman}
          disabled={connecting}
        >
          <Plug className="mr-2 h-4 w-4" />
          {connecting ? "Connecting..." : "Connect Postman"}
        </Button>
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
