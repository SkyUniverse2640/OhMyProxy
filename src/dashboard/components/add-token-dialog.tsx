import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { toast } from "sonner";
import { apiClient } from "../lib/api-client";
import { HelpCircle, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

interface AddTokenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddTokenDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddTokenDialogProps) {
  const [token, setToken] = useState("");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;

    setLoading(true);
    try {
      await apiClient.addToken({
        token: token.trim(),
        label: label.trim() || undefined,
        note: note.trim() || undefined,
        active,
      });
      toast.success("Token added successfully");
      setToken("");
      setLabel("");
      setNote("");
      setActive(true);
      setShowHelp(false);
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to add token");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setShowHelp(false); }}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Access Token</DialogTitle>
          <DialogDescription>
            Add a Postman access token to the round-robin proxy pool.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="token">Token *</Label>
            <Input
              id="token"
              placeholder="Paste your x-access-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              placeholder="e.g. Account A, Workspace XYZ"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Input
              id="note"
              placeholder="Optional note (email, purpose, etc.)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="active" className="cursor-pointer">
              Active
            </Label>
            <Switch
              id="active"
              checked={active}
              onCheckedChange={setActive}
              disabled={loading}
            />
          </div>

          {/* How to get token */}
          <div className="border-t pt-3">
            <button
              type="button"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground w-full"
              onClick={() => setShowHelp(!showHelp)}
            >
              <HelpCircle className="h-3.5 w-3.5" />
              How to get your token
              {showHelp ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
            </button>
            {showHelp && (
              <div className="mt-3 space-y-3 text-xs text-muted-foreground bg-muted/30 rounded-md p-3">
                <div>
                  <p className="font-medium text-foreground mb-1">Method 1: Browser DevTools (Recommended)</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Open <a href="https://web.postman.co" target="_blank" className="text-primary underline inline-flex items-center gap-0.5">web.postman.co<ExternalLink className="h-2.5 w-2.5" /></a> and login</li>
                    <li>Open DevTools (<kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">F12</kbd>)</li>
                    <li>Go to <strong>Network</strong> tab</li>
                    <li>Find any request to <code className="px-1 py-0.5 bg-muted rounded text-[10px]">api.getpostman.com</code></li>
                    <li>Copy the <code className="px-1 py-0.5 bg-muted rounded text-[10px]">x-access-token</code> request header value</li>
                  </ol>
                </div>
                <div>
                  <p className="font-medium text-foreground mb-1">Method 2: Postman API Key</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Go to <a href="https://web.postman.co/settings/me/api-keys" target="_blank" className="text-primary underline inline-flex items-center gap-0.5">Settings → API Keys<ExternalLink className="h-2.5 w-2.5" /></a></li>
                    <li>Click <strong>Generate API Key</strong></li>
                    <li>Copy and paste the key here</li>
                  </ol>
                </div>
                <p className="text-[11px] italic">
                  Add multiple tokens from different accounts to bypass rate limits. The proxy rotates them automatically.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading || !token.trim()}>
              {loading ? "Adding..." : "Add Token"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
