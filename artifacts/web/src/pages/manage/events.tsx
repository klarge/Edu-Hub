import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import {
  useListEvents,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
  useGetEvent,
  useGenerateAttendanceCode,
  useManualMarkAttendance,
  getListEventsQueryKey,
  getGetEventQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar,
  Plus,
  Search,
  Pencil,
  Trash2,
  Users,
  QrCode,
  CheckSquare,
} from "lucide-react";
import type { Event, EventRegistration } from "@workspace/api-client-react";

// --- Event Form ---
const eventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  location: z.string().optional(),
  startAt: z.string().min(1, "Start date is required"),
  endAt: z.string().min(1, "End date is required"),
  maxCapacity: z.coerce.number().optional(),
  estimatedDurationMinutes: z.coerce.number().optional(),
});
type EventForm = z.infer<typeof eventSchema>;

function EventRosterTab({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expiresInMinutes, setExpiresInMinutes] = useState(60);

  const { data, isLoading } = useGetEvent(eventId, {
    query: { enabled: !!eventId, queryKey: getGetEventQueryKey(eventId) },
  });
  const generateCode = useGenerateAttendanceCode();
  const markAttendance = useManualMarkAttendance();

  const event = data?.event;
  const registrations: EventRegistration[] = data?.registrations ?? [];
  const attendedSet = new Set<string>(
    (data?.attendance ?? []).map((a) => (a as { userId?: string }).userId ?? "").filter(Boolean)
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
  }

  function handleGenerateCode() {
    generateCode.mutate(
      { id: eventId, data: { expiresInMinutes } },
      {
        onSuccess: () => { toast({ title: "Attendance code generated" }); invalidate(); },
        onError: () => toast({ title: "Failed to generate code", variant: "destructive" }),
      }
    );
  }

  function handleToggleAttendance(userId: string, currentAttended: boolean) {
    markAttendance.mutate(
      { id: eventId, userId, data: { attended: !currentAttended } },
      {
        onSuccess: () => invalidate(),
        onError: () => toast({ title: "Failed to update attendance", variant: "destructive" }),
      }
    );
  }

  if (isLoading) return <Skeleton className="h-20 w-full" />;

  return (
    <div className="space-y-5">
      {/* Attendance Code */}
      <div className="p-4 bg-muted/40 rounded-lg border border-border space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <QrCode className="h-3.5 w-3.5" />
          Attendance Code
        </p>
        {event?.attendanceCode && (
          <div className="text-center py-4">
            <p className="text-4xl font-mono font-bold tracking-widest text-foreground">
              {event.attendanceCode}
            </p>
            {event.attendanceCodeExpiresAt && (
              <p className="text-xs text-muted-foreground mt-1">
                Expires {format(new Date(event.attendanceCodeExpiresAt), "h:mm a")}
              </p>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={expiresInMinutes}
            onChange={(e) => setExpiresInMinutes(parseInt(e.target.value))}
            className="w-28"
            min={5}
            data-testid="input-code-expires-minutes"
          />
          <span className="text-sm text-muted-foreground">min validity</span>
          <Button
            size="sm"
            onClick={handleGenerateCode}
            disabled={generateCode.isPending}
            data-testid="button-generate-code"
          >
            {event?.attendanceCode ? "Regenerate" : "Generate"} Code
          </Button>
        </div>
      </div>

      {/* Registrations */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          Registrations ({registrations.length})
        </p>
        {registrations.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No registrations yet</p>
        ) : (
          <div className="space-y-1.5">
            {registrations.map((r) => (
              <div
                key={r.id}
                data-testid={`row-registration-${r.id}`}
                className="flex items-center justify-between p-3 bg-card border border-border rounded-lg"
              >
                <div>
                  <p className="text-sm font-medium">{r.userId}</p>
                  <p className="text-xs text-muted-foreground">
                    Registered {format(new Date(r.registeredAt), "MMM d, yyyy")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Attended</span>
                  <Switch
                    checked={attendedSet.has(r.userId)}
                    onCheckedChange={() => handleToggleAttendance(r.userId, attendedSet.has(r.userId))}
                    data-testid={`switch-attendance-${r.userId}`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ManageEventsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Event | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [rosterEventId, setRosterEventId] = useState<string | null>(null);

  const { data, isLoading } = useListEvents({ limit: 200 });
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();

  const form = useForm<EventForm>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: "",
      description: "",
      location: "",
      startAt: "",
      endAt: "",
      maxCapacity: undefined,
      estimatedDurationMinutes: undefined,
    },
  });

  const events = (data?.events ?? []).filter(
    (e) => e.title.toLowerCase().includes(search.toLowerCase())
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
  }

  function openCreate() {
    setEditing(null);
    form.reset({ title: "", description: "", location: "", startAt: "", endAt: "" });
    setShowForm(true);
  }

  function openEdit(e: Event) {
    setEditing(e);
    form.reset({
      title: e.title,
      description: e.description ?? "",
      location: e.location ?? "",
      startAt: e.startAt ? new Date(e.startAt).toISOString().slice(0, 16) : "",
      endAt: e.endAt ? new Date(e.endAt).toISOString().slice(0, 16) : "",
      maxCapacity: e.maxCapacity ?? undefined,
      estimatedDurationMinutes: e.estimatedDurationMinutes ?? undefined,
    });
    setShowForm(true);
  }

  function onSave(values: EventForm) {
    const payload = {
      title: values.title,
      description: values.description || undefined,
      location: values.location || undefined,
      startAt: new Date(values.startAt).toISOString(),
      endAt: new Date(values.endAt).toISOString(),
      maxCapacity: values.maxCapacity || undefined,
      estimatedDurationMinutes: values.estimatedDurationMinutes || undefined,
    };
    if (editing) {
      updateEvent.mutate(
        { id: editing.id, data: payload },
        {
          onSuccess: () => { toast({ title: "Event updated" }); invalidate(); setShowForm(false); },
          onError: () => toast({ title: "Failed to update", variant: "destructive" }),
        }
      );
    } else {
      createEvent.mutate(
        { data: payload },
        {
          onSuccess: () => { toast({ title: "Event created" }); invalidate(); setShowForm(false); },
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
            <Calendar className="h-5 w-5 text-muted-foreground" />
            Manage Events
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Create and manage in-person training events</p>
        </div>
        <Button onClick={openCreate} data-testid="button-new-event">
          <Plus className="h-4 w-4 mr-1.5" />
          New Event
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search events..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
          data-testid="input-search-events"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : events.length === 0 ? (
        <div className="bg-muted rounded-lg p-12 text-center">
          <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">{search ? "No events match" : "No events yet"}</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Title</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Date</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Location</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map((e) => (
                <tr key={e.id} data-testid={`row-event-${e.id}`} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{e.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {format(new Date(e.startAt), "MMM d, yyyy")}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{e.location ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={e.isActive ? "default" : "secondary"} className="text-xs">
                      {e.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRosterEventId(e.id)}
                        data-testid={`button-manage-roster-${e.id}`}
                      >
                        <Users className="h-3.5 w-3.5 mr-1" />
                        Roster
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(e)} data-testid={`button-edit-event-${e.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setDeleteId(e.id)}
                        data-testid={`button-delete-event-${e.id}`}
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

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Event" : "New Event"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input {...form.register("title")} data-testid="input-event-title" />
              {form.formState.errors.title && (
                <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input {...form.register("description")} data-testid="input-event-description" />
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input {...form.register("location")} data-testid="input-event-location" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start *</Label>
                <Input type="datetime-local" {...form.register("startAt")} data-testid="input-event-start" />
                {form.formState.errors.startAt && (
                  <p className="text-xs text-destructive">{form.formState.errors.startAt.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>End *</Label>
                <Input type="datetime-local" {...form.register("endAt")} data-testid="input-event-end" />
                {form.formState.errors.endAt && (
                  <p className="text-xs text-destructive">{form.formState.errors.endAt.message}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Max Capacity</Label>
                <Input type="number" {...form.register("maxCapacity")} data-testid="input-event-capacity" />
              </div>
              <div className="space-y-1.5">
                <Label>Duration (min)</Label>
                <Input type="number" {...form.register("estimatedDurationMinutes")} data-testid="input-event-duration" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={createEvent.isPending || updateEvent.isPending} data-testid="button-save-event">
                {editing ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Roster dialog */}
      <Dialog open={!!rosterEventId} onOpenChange={(o) => { if (!o) setRosterEventId(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Event Roster & Attendance</DialogTitle>
          </DialogHeader>
          {rosterEventId && <EventRosterTab eventId={rosterEventId} />}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete event?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the event and all registrations.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) {
                  deleteEvent.mutate(
                    { id: deleteId },
                    {
                      onSuccess: () => { toast({ title: "Event deleted" }); invalidate(); setDeleteId(null); },
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
