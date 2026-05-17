import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListGroups,
  useCreateGroup,
  useUpdateGroup,
  useDeleteGroup,
  useListGroupMembers,
  useAddGroupMember,
  useRemoveGroupMember,
  useListUsers,
  getListGroupsQueryKey,
  getListGroupMembersQueryKey,
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
import { Network, Plus, Pencil, Trash2, Users, UserPlus } from "lucide-react";
import type { TagGroup } from "@workspace/api-client-react";

const groupSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["location", "job_type"]),
});
type GroupForm = z.infer<typeof groupSchema>;

function GroupMembersPanel({ groupId }: { groupId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState("");

  const { data: membersData, isLoading } = useListGroupMembers(groupId, {
    query: { enabled: !!groupId, queryKey: getListGroupMembersQueryKey(groupId) },
  });
  const { data: usersData } = useListUsers({ limit: 200 });
  const addMember = useAddGroupMember();
  const removeMember = useRemoveGroupMember();

  const members = membersData?.members ?? [];
  const allUsers = usersData?.users ?? [];
  const memberIds = new Set(members.map((m) => m.id));
  const nonMembers = allUsers.filter((u) => !memberIds.has(u.id));

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListGroupMembersQueryKey(groupId) });
  }

  function handleAdd() {
    if (!selectedUserId) return;
    addMember.mutate(
      { id: groupId, data: { userId: selectedUserId } },
      {
        onSuccess: () => { toast({ title: "Member added" }); invalidate(); setSelectedUserId(""); },
        onError: () => toast({ title: "Failed to add member", variant: "destructive" }),
      }
    );
  }

  function handleRemove(userId: string) {
    removeMember.mutate(
      { id: groupId, userId },
      {
        onSuccess: () => { toast({ title: "Member removed" }); invalidate(); },
        onError: () => toast({ title: "Failed to remove member", variant: "destructive" }),
      }
    );
  }

  if (isLoading) return <Skeleton className="h-20 w-full" />;

  return (
    <div className="space-y-4">
      {/* Add member */}
      <div className="flex gap-2">
        <select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          className="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          data-testid="select-add-member"
        >
          <option value="">Select user to add…</option>
          {nonMembers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.firstName} {u.lastName} ({u.email})
            </option>
          ))}
        </select>
        <Button
          size="sm"
          onClick={handleAdd}
          disabled={!selectedUserId || addMember.isPending}
          data-testid="button-add-member"
        >
          <UserPlus className="h-3.5 w-3.5 mr-1" />
          Add
        </Button>
      </div>

      {/* Members list */}
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No members yet</p>
      ) : (
        <div className="space-y-1.5">
          {members.map((m) => (
            <div
              key={m.id}
              data-testid={`row-member-${m.id}`}
              className="flex items-center justify-between p-2.5 bg-card border border-border rounded-lg"
            >
              <div>
                <p className="text-sm font-medium">{m.firstName} {m.lastName}</p>
                <p className="text-xs text-muted-foreground">{m.email}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => handleRemove(m.id)}
                data-testid={`button-remove-member-${m.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminGroupsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TagGroup | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [membersGroupId, setMembersGroupId] = useState<string | null>(null);

  const { data, isLoading } = useListGroups();
  const createGroup = useCreateGroup();
  const updateGroup = useUpdateGroup();
  const deleteGroup = useDeleteGroup();

  const form = useForm<GroupForm>({
    resolver: zodResolver(groupSchema),
    defaultValues: { name: "", type: "location" },
  });

  const groups = data?.groups ?? [];

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListGroupsQueryKey() });
  }

  function openCreate() {
    setEditing(null);
    form.reset({ name: "", type: "location" });
    setShowForm(true);
  }

  function openEdit(g: TagGroup) {
    setEditing(g);
    form.reset({ name: g.name, type: g.type as "location" | "job_type" });
    setShowForm(true);
  }

  function onSave(values: GroupForm) {
    if (editing) {
      updateGroup.mutate(
        { id: editing.id, data: { name: values.name } },
        {
          onSuccess: () => { toast({ title: "Group updated" }); invalidate(); setShowForm(false); },
          onError: () => toast({ title: "Failed to update", variant: "destructive" }),
        }
      );
    } else {
      createGroup.mutate(
        { data: { name: values.name, type: values.type } },
        {
          onSuccess: () => { toast({ title: "Group created" }); invalidate(); setShowForm(false); },
          onError: () => toast({ title: "Failed to create", variant: "destructive" }),
        }
      );
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Network className="h-5 w-5 text-muted-foreground" />
            Groups
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Organize users into groups for training assignment</p>
        </div>
        <Button onClick={openCreate} data-testid="button-new-group">
          <Plus className="h-4 w-4 mr-1.5" />
          New Group
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : groups.length === 0 ? (
        <div className="bg-muted rounded-lg p-12 text-center">
          <Network className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">No groups yet</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Type</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {groups.map((g) => (
                <tr key={g.id} data-testid={`row-group-${g.id}`} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{g.name}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs">
                      {g.type === "location" ? "Location" : "Job Type"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setMembersGroupId(g.id)} data-testid={`button-members-${g.id}`}>
                        <Users className="h-3.5 w-3.5 mr-1" />
                        Members
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(g)} data-testid={`button-edit-group-${g.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setDeleteId(g.id)}
                        data-testid={`button-delete-group-${g.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Group" : "New Group"}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input {...form.register("name")} data-testid="input-group-name" />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            {!editing && (
              <div className="space-y-1.5">
                <Label>Type</Label>
                <select
                  {...form.register("type")}
                  data-testid="select-group-type"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="location">Location</option>
                  <option value="job_type">Job Type</option>
                </select>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={createGroup.isPending || updateGroup.isPending} data-testid="button-save-group">
                {editing ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Members dialog */}
      <Dialog open={!!membersGroupId} onOpenChange={(o) => { if (!o) setMembersGroupId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Manage Members — {groups.find((g) => g.id === membersGroupId)?.name}
            </DialogTitle>
          </DialogHeader>
          {membersGroupId && <GroupMembersPanel groupId={membersGroupId} />}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete group?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the group and all its members.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) {
                  deleteGroup.mutate(
                    { id: deleteId },
                    {
                      onSuccess: () => { toast({ title: "Group deleted" }); invalidate(); setDeleteId(null); },
                    }
                  );
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
