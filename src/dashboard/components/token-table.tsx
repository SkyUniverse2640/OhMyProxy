
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { Trash2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "../lib/api-client";
import type { TokenItem } from "../lib/types";
import { AddTokenDialog } from "./add-token-dialog";
import { ConfirmDialog } from "./confirm-dialog";

interface TokenTableProps {
  tokens: TokenItem[];
  loading: boolean;
  onRefresh: () => void;
}

export function TokenTable({ tokens, loading, onRefresh }: TokenTableProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toggling, setToggling] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState<Set<number>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<TokenItem | null>(null);

  const handleToggle = async (id: number) => {
    setToggling((prev) => new Set(prev).add(id));
    try {
      const result = await apiClient.toggleToken(id);
      toast.success(`Token ${result.active ? "activated" : "deactivated"}`);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to toggle token");
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleting((prev) => new Set(prev).add(id));
    try {
      await apiClient.deleteToken(id);
      toast.success(`Token "${deleteTarget.label}" deleted`);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete token");
    } finally {
      setDeleting((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return <TokenTableSkeleton />;
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {tokens.length} token{tokens.length !== 1 ? "s" : ""}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Token
          </Button>
        </div>
      </div>

      {tokens.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-muted-foreground">No tokens yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add your first access token to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((token) => (
                <TableRow key={token.id}>
                  <TableCell className="font-medium">
                    {token.label}
                    {token.note && (
                      <p className="text-xs text-muted-foreground">{token.note}</p>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {token.token}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={token.active}
                      onCheckedChange={() => handleToggle(token.id)}
                      disabled={toggling.has(token.id)}
                    />
                    <span className="ml-2 text-xs text-muted-foreground">
                      {token.active ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(token)}
                      disabled={deleting.has(token.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AddTokenDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={onRefresh}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete Token"
        description={`Are you sure you want to delete token "${deleteTarget?.label}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteTarget ? deleting.has(deleteTarget.id) : false}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}

function TokenTableSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-20" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><Skeleton className="h-4 w-16" /></TableHead>
              <TableHead><Skeleton className="h-4 w-16" /></TableHead>
              <TableHead><Skeleton className="h-4 w-16" /></TableHead>
              <TableHead><Skeleton className="h-4 w-16" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(3)].map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                <TableCell><Skeleton className="h-8 w-8" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
