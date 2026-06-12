"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import type { TokenItem } from "@/lib/types";
import { AddTokenDialog } from "@/components/add-token-dialog";

interface TokenTableProps {
  tokens: TokenItem[];
  loading: boolean;
  onRefresh: () => void;
}

export function TokenTable({ tokens, loading, onRefresh }: TokenTableProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toggling, setToggling] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState<Set<number>>(new Set());

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

  const handleDelete = async (id: number) => {
    setDeleting((prev) => new Set(prev).add(id));
    try {
      await apiClient.deleteToken(id);
      toast.success("Token deleted");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete token");
    } finally {
      setDeleting((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
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
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Token
        </Button>
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
                      onClick={() => handleDelete(token.id)}
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
    </>
  );
}

function TokenTableSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-9 w-28" />
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
