import React from "react";
import { useSettings } from "../hooks/use-settings";
import { SettingsForm } from "../components/settings-form";

export function Settings() {
  const { data, loading, error, refetch } = useSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure proxy behavior</p>
      </div>
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
      <SettingsForm settings={data} loading={loading} onRefresh={refetch} />
    </div>
  );
}
