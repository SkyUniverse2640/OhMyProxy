"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Key, Globe } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const { proxyUrl, managementKey, isAuthenticated, setCredentials, login } =
    useAuthStore();

  const [url, setUrl] = useState(proxyUrl);
  const [key, setKey] = useState(managementKey);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !key.trim()) return;

    setLoading(true);
    setCredentials(url.trim(), key.trim());
    const success = await login();
    setLoading(false);

    if (success) {
      toast.success("Connected to proxy");
      router.replace("/dashboard");
    } else {
      toast.error("Authentication failed. Check your proxy URL and management key.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">OhMyProxy</CardTitle>
          <CardDescription>Enter your proxy URL and management key to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Proxy URL
              </Label>
              <Input
                id="url"
                type="text"
                placeholder="http://127.0.0.1:8020"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key" className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                Management Key
              </Label>
              <Input
                id="key"
                type="password"
                placeholder="Enter your management key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                disabled={loading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Connecting..." : "Connect"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
