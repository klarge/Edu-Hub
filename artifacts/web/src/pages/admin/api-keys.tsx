import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import {
  useListApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
  getListApiKeysQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Key, Plus, Trash2, Copy, CheckCheck } from "lucide-react";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
});
type KeyForm = z.infer<typeof schema>;

export default function AdminApiKeysPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const userId = user?.id ?? "";
  const { data, isLoading } = useListApiKeys(userId, {
    query: { enabled: !!userId, queryKey: getListApiKeysQueryKey(userId) },
  });
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();

  const keys = data?.keys ?? [];

  const form = useForm<KeyForm>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListApiKeysQueryKey(userId) });
  }

  function onCreateSubmit(values: KeyForm) {
    createKey.mutate(
      { id: userId, data: { name: values.name } },
      {
        onSuccess: (data) => {
          invalidate();
          setShowCreate(false);
          form.reset();
          const keyValue = data.key?.rawKey;
          if (keyValue) {
            setNewKey(keyValue);
          } else {
            toast({ title: "API key created" });
          }
        },
        onError: () => toast({ title: "Failed to create key", variant: "destructive" }),
      }
    );
  }

  function handleCopy() {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Key className="h-5 w-5 text-muted-foreground" />
            API Keys
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage API keys for programmatic access
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="button-new-api-key">
          <Plus className="h-4 w-4 mr-1.5" />
          New Key
        </Button>
      </div>

      {/* New key reveal */}
      {newKey && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2">
          <p className="text-sm font-semibold text-emerald-800">
            API key created — copy it now, it won't be shown again
          </p>
          <div className="flex items-center gap-2">
            <code
              className="flex-1 font-mono text-sm bg-white border border-emerald-200 rounded px-3 py-2 text-emerald-900 break-all"
              data-testid="text-new-api-key"
            >
              {newKey}
            </code>
            <Button size="sm" variant="outline" onClick={handleCopy} data-testid="button-copy-api-key">
              {copied ? <CheckCheck className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setNewKey(null)}>Dismiss</Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : keys.length === 0 ? (
        <div className="bg-muted rounded-lg p-12 text-center">
          <Key className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">No API keys</p>
          <p className="text-xs text-muted-foreground mt-1">Create a key to access the API programmatically</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Last Used</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Created</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {keys.map((k) => (
                <tr key={k.id} data-testid={`row-api-key-${k.id}`} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium font-mono text-sm">{k.name}</td>
                  <td className="px-4 py-3">
                    <Badge variant={k.isActive ? "default" : "secondary"} className="text-xs">
                      {k.isActive ? "Active" : "Revoked"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {k.lastUsedAt ? format(new Date(k.lastUsedAt), "MMM d, yyyy") : "Never"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {format(new Date(k.createdAt), "MMM d, yyyy")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {k.isActive && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setRevokeId(k.id)}
                        data-testid={`button-revoke-key-${k.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New API Key</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onCreateSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Key Name *</Label>
              <Input
                placeholder="e.g. CI/CD Pipeline"
                {...form.register("name")}
                data-testid="input-api-key-name"
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={createKey.isPending} data-testid="button-create-api-key">
                {createKey.isPending ? "Creating..." : "Create Key"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Revoke confirm */}
      <AlertDialog open={!!revokeId} onOpenChange={(o) => { if (!o) setRevokeId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API key?</AlertDialogTitle>
            <AlertDialogDescription>
              This key will immediately stop working. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (revokeId) {
                  revokeKey.mutate(
                    { id: userId, keyId: revokeId },
                    {
                      onSuccess: () => { toast({ title: "Key revoked" }); invalidate(); setRevokeId(null); },
                    }
                  );
                }
              }}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
