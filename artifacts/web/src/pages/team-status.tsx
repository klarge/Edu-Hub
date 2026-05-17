import { useState } from "react";
import {
  useGetTeamCompletionStatus,
  useListTrainings,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BarChart2, CheckCircle2, Clock, AlertTriangle, Search, X } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  training_lead: "Training Lead",
  manager: "Manager",
  user: "User",
};

function getInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

type CompletionSummary = {
  completed?: number;
  pending?: number;
  overdue?: number;
  total?: number;
} | null;

function parseSummary(raw: unknown): CompletionSummary {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  return {
    completed: typeof s.completed === "number" ? s.completed : 0,
    pending: typeof s.pending === "number" ? s.pending : 0,
    overdue: typeof s.overdue === "number" ? s.overdue : 0,
    total: typeof s.total === "number" ? s.total : 0,
  };
}

export default function TeamStatusPage() {
  const { data: trainingsData } = useListTrainings({ limit: 200 });

  const [search, setSearch] = useState("");
  const [trainingFilter, setTrainingFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const trainings = trainingsData?.trainings ?? [];

  const { data, isLoading } = useGetTeamCompletionStatus(
    {
      trainingId: trainingFilter || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    },
  );

  const allUsers = data?.users ?? [];

  const users = allUsers.filter((u) =>
    !search ||
    `${u.firstName} ${u.lastName} ${u.email}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const hasFilters = !!trainingFilter || !!fromDate || !!toDate;
  function clearFilters() {
    setTrainingFilter("");
    setFromDate("");
    setToDate("");
  }

  const totalMembers = allUsers.length;
  const totalCompleted = allUsers.reduce((sum, u) => {
    const s = parseSummary(u.completionSummary);
    return sum + (s?.completed ?? 0);
  }, 0);
  const totalOverdue = allUsers.reduce((sum, u) => {
    const s = parseSummary(u.completionSummary);
    return sum + (s?.overdue ?? 0);
  }, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-muted-foreground" />
            Team Status
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Completion status for your team members
          </p>
        </div>
        {!isLoading && (
          <Badge variant="secondary">{totalMembers} members</Badge>
        )}
      </div>

      {/* Summary stats */}
      {!isLoading && totalMembers > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-lg p-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Total Completions</p>
              <p className="text-lg font-semibold">{totalCompleted}</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Overdue</p>
              <p className="text-lg font-semibold">{totalOverdue}</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Active Members</p>
              <p className="text-lg font-semibold">{totalMembers}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            data-testid="input-search-team"
          />
        </div>

        <div>
          <select
            value={trainingFilter}
            onChange={(e) => setTrainingFilter(e.target.value)}
            data-testid="select-filter-training"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All trainings</option>
            {trainings.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-0.5">
          <Label className="text-xs text-muted-foreground">From date</Label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            data-testid="input-filter-from-date"
            className="h-9"
          />
        </div>

        <div className="space-y-0.5">
          <Label className="text-xs text-muted-foreground">To date</Label>
          <div className="flex gap-1.5">
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              data-testid="input-filter-to-date"
              className="h-9"
            />
            {hasFilters && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={clearFilters}
                data-testid="button-clear-filters"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : users.length === 0 ? (
        <div className="bg-muted rounded-lg p-12 text-center">
          <BarChart2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">
            {search || hasFilters ? "No members match your filters" : "No team members found"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {hasFilters
              ? "Try adjusting your filters"
              : "Users in your managed groups will appear here"}
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Member</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Role</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">Completed</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">Pending</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">Overdue</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => {
                const summary = parseSummary(u.completionSummary);
                const completed = summary?.completed ?? 0;
                const pending = summary?.pending ?? 0;
                const overdue = summary?.overdue ?? 0;
                const total = summary?.total ?? (completed + pending + overdue);
                const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                return (
                  <tr
                    key={u.id}
                    data-testid={`row-team-${u.id}`}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-primary">
                            {getInitials(u.firstName, u.lastName)}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">{u.firstName} {u.lastName}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">
                        {ROLE_LABELS[u.role] ?? u.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {completed}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-muted-foreground">{pending}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {overdue > 0 ? (
                        <span className="inline-flex items-center gap-1 text-destructive font-medium">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {overdue}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {total > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
