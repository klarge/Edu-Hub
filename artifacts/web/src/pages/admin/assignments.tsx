import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useListTrainings,
  useListEvents,
  useListGroups,
  useListTrainingAssignments,
  useListEventAssignments,
  useAssignTrainingToGroup,
  useUnassignTrainingFromGroup,
  useAssignEventToGroup,
  useUnassignEventFromGroup,
  getListTrainingAssignmentsQueryKey,
  getListEventAssignmentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Layers, Plus, Trash2 } from "lucide-react";
import type { TrainingGroupAssignment } from "@workspace/api-client-react";

const trainingAssignSchema = z.object({
  trainingId: z.string().min(1, "Select a training"),
  groupId: z.string().min(1, "Select a group"),
  dueDate: z.string().optional(),
});
type TrainingAssignForm = z.infer<typeof trainingAssignSchema>;

const eventAssignSchema = z.object({
  eventId: z.string().min(1, "Select an event"),
  groupId: z.string().min(1, "Select a group"),
});
type EventAssignForm = z.infer<typeof eventAssignSchema>;

function TrainingAssignmentsTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedTrainingId, setSelectedTrainingId] = useState("");

  const { data: trainingsData } = useListTrainings({ limit: 200 });
  const { data: groupsData } = useListGroups();
  const { data: assignmentsData, isLoading } = useListTrainingAssignments(selectedTrainingId, {
    query: {
      enabled: !!selectedTrainingId,
      queryKey: getListTrainingAssignmentsQueryKey(selectedTrainingId),
    },
  });

  const assign = useAssignTrainingToGroup();
  const unassign = useUnassignTrainingFromGroup();

  const trainings = trainingsData?.trainings ?? [];
  const groups = groupsData?.groups ?? [];
  const assignments: TrainingGroupAssignment[] = assignmentsData?.assignments ?? [];

  const form = useForm<TrainingAssignForm>({
    resolver: zodResolver(trainingAssignSchema),
    defaultValues: { trainingId: "", groupId: "", dueDate: "" },
  });

  function invalidate(tid: string) {
    queryClient.invalidateQueries({ queryKey: getListTrainingAssignmentsQueryKey(tid) });
  }

  function onAssign(values: TrainingAssignForm) {
    assign.mutate(
      {
        id: values.trainingId,
        data: { groupId: values.groupId, dueDate: values.dueDate || undefined },
      },
      {
        onSuccess: () => {
          toast({ title: "Training assigned to group" });
          invalidate(values.trainingId);
          if (!selectedTrainingId) setSelectedTrainingId(values.trainingId);
        },
        onError: () => toast({ title: "Failed to assign", variant: "destructive" }),
      }
    );
  }

  function handleUnassign(trainingId: string, assignmentId: string) {
    unassign.mutate(
      { id: trainingId, assignmentId },
      {
        onSuccess: () => { toast({ title: "Assignment removed" }); invalidate(trainingId); },
        onError: () => toast({ title: "Failed to remove assignment", variant: "destructive" }),
      }
    );
  }

  const groupMap = new Map(groups.map((g) => [g.id, g.name]));

  return (
    <div className="space-y-5">
      {/* Assign form */}
      <div className="p-4 bg-muted/40 rounded-lg border border-border space-y-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Assign Training to Group</p>
        <form onSubmit={form.handleSubmit(onAssign)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Training</Label>
              <select
                {...form.register("trainingId")}
                data-testid="select-assign-training"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Select training…</option>
                {trainings.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Group</Label>
              <select
                {...form.register("groupId")}
                data-testid="select-assign-training-group"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Select group…</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="space-y-1.5 flex-1">
              <Label>Due Date (optional)</Label>
              <input
                type="date"
                {...form.register("dueDate")}
                data-testid="input-assign-due-date"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <Button type="submit" disabled={assign.isPending} data-testid="button-assign-training">
              <Plus className="h-4 w-4 mr-1" />
              Assign
            </Button>
          </div>
        </form>
      </div>

      {/* View assignments for a training */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>View assignments for training</Label>
          <select
            value={selectedTrainingId}
            onChange={(e) => setSelectedTrainingId(e.target.value)}
            data-testid="select-view-training-assignments"
            className="flex h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Select training…</option>
            {trainings.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>

        {selectedTrainingId && (
          isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No group assignments for this training</p>
          ) : (
            <div className="space-y-1.5">
              {assignments.map((a) => (
                <div
                  key={a.id}
                  data-testid={`row-training-assignment-${a.id}`}
                  className="flex items-center justify-between p-3 bg-card border border-border rounded-lg"
                >
                  <div>
                    <p className="text-sm font-medium">{groupMap.get(a.groupId) ?? a.groupId}</p>
                    {a.dueDate && (
                      <p className="text-xs text-muted-foreground">
                        Due: {new Date(a.dueDate).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => handleUnassign(a.trainingId, a.id)}
                    data-testid={`button-unassign-training-${a.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function EventAssignmentsTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedEventId, setSelectedEventId] = useState("");

  const { data: eventsData } = useListEvents({ limit: 200 });
  const { data: groupsData } = useListGroups();
  const { data: assignmentsData, isLoading } = useListEventAssignments(selectedEventId, {
    query: {
      enabled: !!selectedEventId,
      queryKey: getListEventAssignmentsQueryKey(selectedEventId),
    },
  });

  const assign = useAssignEventToGroup();
  const unassign = useUnassignEventFromGroup();

  const events = eventsData?.events ?? [];
  const groups = groupsData?.groups ?? [];
  const assignments = assignmentsData?.assignments ?? [];

  const form = useForm<EventAssignForm>({
    resolver: zodResolver(eventAssignSchema),
    defaultValues: { eventId: "", groupId: "" },
  });

  function invalidate(eid: string) {
    queryClient.invalidateQueries({ queryKey: getListEventAssignmentsQueryKey(eid) });
  }

  function onAssign(values: EventAssignForm) {
    assign.mutate(
      { id: values.eventId, data: { groupId: values.groupId } },
      {
        onSuccess: () => {
          toast({ title: "Event assigned to group" });
          invalidate(values.eventId);
          if (!selectedEventId) setSelectedEventId(values.eventId);
        },
        onError: () => toast({ title: "Failed to assign", variant: "destructive" }),
      }
    );
  }

  function handleUnassign(eventId: string, assignmentId: string) {
    unassign.mutate(
      { id: eventId, assignmentId },
      {
        onSuccess: () => { toast({ title: "Assignment removed" }); invalidate(eventId); },
        onError: () => toast({ title: "Failed to remove", variant: "destructive" }),
      }
    );
  }

  const groupMap = new Map(groups.map((g) => [g.id, g.name]));

  return (
    <div className="space-y-5">
      <div className="p-4 bg-muted/40 rounded-lg border border-border space-y-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Assign Event to Group</p>
        <form onSubmit={form.handleSubmit(onAssign)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Event</Label>
              <select
                {...form.register("eventId")}
                data-testid="select-assign-event"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Select event…</option>
                {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Group</Label>
              <select
                {...form.register("groupId")}
                data-testid="select-assign-event-group"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Select group…</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={assign.isPending} data-testid="button-assign-event">
              <Plus className="h-4 w-4 mr-1" />
              Assign
            </Button>
          </div>
        </form>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>View assignments for event</Label>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            data-testid="select-view-event-assignments"
            className="flex h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Select event…</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
        </div>

        {selectedEventId && (
          isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No group assignments for this event</p>
          ) : (
            <div className="space-y-1.5">
              {assignments.map((a) => (
                <div
                  key={a.id}
                  data-testid={`row-event-assignment-${a.id}`}
                  className="flex items-center justify-between p-3 bg-card border border-border rounded-lg"
                >
                  <p className="text-sm font-medium">{groupMap.get(a.groupId) ?? a.groupId}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => handleUnassign(a.eventId, a.id)}
                    data-testid={`button-unassign-event-${a.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

export default function AdminAssignmentsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Layers className="h-5 w-5 text-muted-foreground" />
          Assignments
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Assign trainings and events to groups
        </p>
      </div>

      <Tabs defaultValue="trainings">
        <TabsList>
          <TabsTrigger value="trainings">Trainings</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
        </TabsList>
        <TabsContent value="trainings" className="pt-4">
          <TrainingAssignmentsTab />
        </TabsContent>
        <TabsContent value="events" className="pt-4">
          <EventAssignmentsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
