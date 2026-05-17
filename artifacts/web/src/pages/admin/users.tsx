import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeactivateUser,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
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
import { Users, Plus, Search, Pencil, UserX } from "lucide-react";
import type { User } from "@workspace/api-client-react";

const ROLES = ["admin", "training_lead", "manager", "user"] as const;
const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  training_lead: "Training Lead",
  manager: "Manager",
  user: "User",
};

const createSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Min 8 characters"),
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  role: z.enum(ROLES),
});
type CreateForm = z.infer<typeof createSchema>;

const editSchema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  role: z.enum(ROLES),
});
type EditForm = z.infer<typeof editSchema>;

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);

  const limit = 20;
  const { data, isLoading } = useListUsers({ page, limit, search: search || undefined });
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deactivate = useDeactivateUser();

  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { email: "", password: "", firstName: "", lastName: "", role: "user" },
  });
  const editForm = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: { firstName: "", lastName: "", role: "user" },
  });

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
  }

  function onCreateSubmit(values: CreateForm) {
    createUser.mutate(
      { data: values },
      {
        onSuccess: () => { toast({ title: "User created" }); invalidate(); setShowCreate(false); createForm.reset(); },
        onError: (err: unknown) => {
          const msg = (err as { data?: { error?: string } })?.data?.error ?? "Failed to create user";
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      }
    );
  }

  function openEdit(u: User) {
    setEditingUser(u);
    editForm.reset({ firstName: u.firstName, lastName: u.lastName, role: u.role as typeof ROLES[number] });
  }

  function onEditSubmit(values: EditForm) {
    if (!editingUser) return;
    updateUser.mutate(
      { id: editingUser.id, data: values },
      {
        onSuccess: () => { toast({ title: "User updated" }); invalidate(); setEditingUser(null); },
        onError: () => toast({ title: "Failed to update", variant: "destructive" }),
      }
    );
  }

  function getInitials(u: User) {
    return `${u.firstName.charAt(0)}${u.lastName.charAt(0)}`.toUpperCase();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            Users
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage platform users and their roles</p>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="button-new-user">
          <Plus className="h-4 w-4 mr-1.5" />
          Invite User
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search users..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="pl-8"
          data-testid="input-search-users"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">User</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Role</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Auth</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No users found
                    </td>
                  </tr>
                )}
                {users.map((u) => (
                  <tr key={u.id} data-testid={`row-user-${u.id}`} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-primary">{getInitials(u)}</span>
                        </div>
                        <div>
                          <p className="font-medium">{u.firstName} {u.lastName}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">{ROLE_LABELS[u.role] ?? u.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.isActive ? "default" : "secondary"} className="text-xs">
                        {u.isActive ? "Active" : "Deactivated"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {u.ssoProvider ?? "Local"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(u)} data-testid={`button-edit-user-${u.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {u.isActive && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => setDeactivateId(u.id)}
                            data-testid={`button-deactivate-user-${u.id}`}
                          >
                            <UserX className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{total} users total</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <span className="flex items-center px-2 text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create user dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite User</DialogTitle></DialogHeader>
          <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First Name *</Label>
                <Input {...createForm.register("firstName")} data-testid="input-first-name" />
                {createForm.formState.errors.firstName && (
                  <p className="text-xs text-destructive">{createForm.formState.errors.firstName.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Last Name *</Label>
                <Input {...createForm.register("lastName")} data-testid="input-last-name" />
                {createForm.formState.errors.lastName && (
                  <p className="text-xs text-destructive">{createForm.formState.errors.lastName.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" {...createForm.register("email")} data-testid="input-user-email" />
              {createForm.formState.errors.email && (
                <p className="text-xs text-destructive">{createForm.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Password *</Label>
              <Input type="password" {...createForm.register("password")} data-testid="input-user-password" />
              {createForm.formState.errors.password && (
                <p className="text-xs text-destructive">{createForm.formState.errors.password.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <select
                {...createForm.register("role")}
                data-testid="select-user-role"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={createUser.isPending} data-testid="button-save-user">Create User</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit user dialog */}
      <Dialog open={!!editingUser} onOpenChange={(o) => { if (!o) setEditingUser(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First Name</Label>
                <Input {...editForm.register("firstName")} data-testid="input-edit-first-name" />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name</Label>
                <Input {...editForm.register("lastName")} data-testid="input-edit-last-name" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <select
                {...editForm.register("role")}
                data-testid="select-edit-user-role"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
              <Button type="submit" disabled={updateUser.isPending} data-testid="button-update-user">Save Changes</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deactivate confirm */}
      <AlertDialog open={!!deactivateId} onOpenChange={(o) => { if (!o) setDeactivateId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate user?</AlertDialogTitle>
            <AlertDialogDescription>
              This user will no longer be able to sign in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deactivateId) {
                  deactivate.mutate(
                    { id: deactivateId },
                    {
                      onSuccess: () => { toast({ title: "User deactivated" }); invalidate(); setDeactivateId(null); },
                    }
                  );
                }
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
