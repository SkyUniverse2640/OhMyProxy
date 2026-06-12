"use client";

import { useSettings } from "@/hooks/use-settings";
import { SettingsForm } from "@/components/settings-form";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  const { data, loading, error, refetch } = useSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure proxy logging and Postman API settings.
        </p>
      </div>
      <Separator />

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <SettingsForm settings={data} loading={loading} onRefresh={refetch} />
    </div>
  );
}
