
import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { toast } from "sonner";
import { apiClient } from "../lib/api-client";
import type { ProxySettings } from "../lib/types";

interface SettingsFormProps {
  settings: ProxySettings | null;
  loading: boolean;
  onRefresh: () => void;
}

export function SettingsForm({ settings, loading, onRefresh }: SettingsFormProps) {
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [loggingEnabled, setLoggingEnabled] = useState(false);
  const [logLevel, setLogLevel] = useState("info");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    if (settings) {
      setLoggingEnabled(settings.logging.enabled);
      setLogLevel(settings.logging.level);
      setModel(settings.postman.model);
      setBaseUrl(settings.postman.base_url);
    }
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        logging: {
          enabled: loggingEnabled,
          level: logLevel,
        },
        postman: {
          model,
          base_url: baseUrl,
        },
      };
      await apiClient.patchSettings(body);
      toast.success("Settings updated");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <SettingsFormSkeleton />;
  }

  if (!settings) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        Failed to load settings
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Logging</CardTitle>
          <CardDescription>Configure proxy logging behavior.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="logging-enabled" className="cursor-pointer">
              Enable Logging
            </Label>
            <Switch
              id="logging-enabled"
              checked={loggingEnabled}
              onCheckedChange={setLoggingEnabled}
            />
          </div>
          {loggingEnabled && (
            <div className="space-y-2">
              <Label htmlFor="log-level">Log Level</Label>
              <Select value={logLevel} onValueChange={setLogLevel}>
                <SelectTrigger id="log-level">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debug">Debug</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warn">Warn</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Postman API</CardTitle>
          <CardDescription>Configure the Postman API connection.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="postman-model">Model</Label>
            <Input
              id="postman-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. claude-sonnet-4-20250514"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="postman-base-url">Base URL</Label>
            <Input
              id="postman-base-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="Postman API base URL"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

function SettingsFormSkeleton() {
  return (
    <div className="space-y-6">
      {[...Array(2)].map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
