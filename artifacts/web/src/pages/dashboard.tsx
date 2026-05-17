import { useMemo } from "react";
import { Link } from "wouter";
import { format, isPast, isFuture, addDays } from "date-fns";
import {
  useListTrainings,
  useListEvents,
  useGetUserCompletions,
  getGetUserCompletionsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Calendar, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

type StatusGroup = "overdue" | "upcoming" | "not_started" | "completed";

function StatusBadge({ status }: { status: StatusGroup }) {
  const configs = {
    overdue: { label: "Overdue", className: "bg-destructive/10 text-destructive border-destructive/20" },
    upcoming: { label: "Due Soon", className: "bg-amber-50 text-amber-700 border-amber-200" },
    not_started: { label: "Not Started", className: "bg-muted text-muted-foreground" },
    completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  };
  const c = configs[status];
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: trainingsData, isLoading: trainingsLoading } = useListTrainings({ limit: 100 });
  const { data: eventsData, isLoading: eventsLoading } = useListEvents({ limit: 100 });
  const { data: completionsData, isLoading: completionsLoading } = useGetUserCompletions(
    user?.id ?? "",
    { query: { enabled: !!user?.id, queryKey: getGetUserCompletionsQueryKey(user?.id ?? "") } }
  );

  const completionMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const c of completionsData?.completions ?? []) {
      if (c.trainingId) map.set(c.trainingId, true);
      if (c.eventId) map.set(c.eventId, true);
    }
    return map;
  }, [completionsData]);

  const trainings = (trainingsData?.trainings ?? []).filter((t) => t.isActive);
  const events = (eventsData?.events ?? []).filter((e) => e.isActive);

  function getTrainingStatus(id: string): StatusGroup {
    if (completionMap.has(id)) return "completed";
    return "not_started";
  }

  function getEventStatus(id: string, startAt: string): StatusGroup {
    if (completionMap.has(id)) return "completed";
    const start = new Date(startAt);
    if (isPast(start)) return "overdue";
    if (isFuture(start) && start <= addDays(new Date(), 7)) return "upcoming";
    return "not_started";
  }

  const isLoading = trainingsLoading || eventsLoading || completionsLoading;

  const totalCompleted = completionsData?.completions.length ?? 0;
  const overdueEvents = events.filter(
    (e) => getEventStatus(e.id, e.startAt) === "overdue"
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Welcome back, {user?.firstName}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Here's your training overview
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Assigned Trainings", value: trainings.length, icon: <BookOpen className="h-4 w-4 text-primary" /> },
          { label: "Completed", value: totalCompleted, icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" /> },
          { label: "Overdue Events", value: overdueEvents, icon: <AlertTriangle className="h-4 w-4 text-destructive" /> },
        ].map((stat) => (
          <div key={stat.label} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">{stat.icon}<span className="text-xs text-muted-foreground">{stat.label}</span></div>
            <p className="text-2xl font-semibold">{isLoading ? "—" : stat.value}</p>
          </div>
        ))}
      </div>

      {/* Trainings */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          Online Trainings
        </h2>
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : trainings.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No trainings available</p>
        ) : (
          <div className="space-y-4">
            {(["not_started", "completed"] as StatusGroup[]).map((bucket) => {
              const items = trainings.filter((t) => getTrainingStatus(t.id) === bucket);
              if (items.length === 0) return null;
              return (
                <div key={bucket}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    {bucket === "not_started" ? "Not Started" : "Completed"} ({items.length})
                  </p>
                  <div className="space-y-1.5">
                    {items.map((t) => (
                      <Link key={t.id} href={`/trainings/${t.id}`}>
                        <a
                          data-testid={`card-training-${t.id}`}
                          className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3 hover:border-primary/50 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
                            {t.estimatedDurationMinutes && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Clock className="h-3 w-3" />
                                {t.estimatedDurationMinutes} min
                              </p>
                            )}
                          </div>
                          <StatusBadge status={getTrainingStatus(t.id)} />
                        </a>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Events */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          In-Person Events
        </h2>
        {isLoading ? (
          <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No events available</p>
        ) : (
          <div className="space-y-4">
            {(["overdue", "upcoming", "not_started", "completed"] as StatusGroup[]).map((bucket) => {
              const items = events.filter((e) => getEventStatus(e.id, e.startAt) === bucket);
              if (items.length === 0) return null;
              const bucketLabel: Record<StatusGroup, string> = {
                overdue: "Overdue",
                upcoming: "Due Soon",
                not_started: "Upcoming",
                completed: "Completed",
              };
              return (
                <div key={bucket}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                    {bucketLabel[bucket]} ({items.length})
                  </p>
                  <div className="space-y-1.5">
                    {items.map((e) => (
                      <Link key={e.id} href={`/events/${e.id}`}>
                        <a
                          data-testid={`card-event-${e.id}`}
                          className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3 hover:border-primary/50 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{e.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {format(new Date(e.startAt), "MMM d, yyyy 'at' h:mm a")}
                              {e.location && ` · ${e.location}`}
                            </p>
                          </div>
                          <StatusBadge status={getEventStatus(e.id, e.startAt)} />
                        </a>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
