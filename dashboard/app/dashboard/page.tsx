"use client";

import { useStatus } from "@/hooks/use-status";
import { StatusCard, StatusCardSkeleton } from "@/components/status-card";
import { Separator } from "@/components/ui/separator";

export default function DashboardPage() {
  const { data, loading, error } = useStatus();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your OhMyProxy instance
        </p>
      </div>
      <Separator />

      {loading && <StatusCardSkeleton />}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
      {data && <StatusCard data={data} />}
    </div>
  );
}
