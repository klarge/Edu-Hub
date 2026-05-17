import { format } from "date-fns";
import {
  useGetUserCompletions,
  getGetUserCompletionsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { History, Download, BookOpen, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HistoryPage() {
  const { user } = useAuth();
  const { data, isLoading } = useGetUserCompletions(user?.id ?? "", {
    query: {
      enabled: !!user?.id,
      queryKey: getGetUserCompletionsQueryKey(user?.id ?? ""),
    },
  });

  const completions = data?.completions ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            Completion History
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your completed trainings and events
          </p>
        </div>
        <Badge variant="secondary">{completions.length} total</Badge>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : completions.length === 0 ? (
        <div className="bg-muted rounded-lg p-12 text-center">
          <History className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">No completions yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Completed trainings and events will appear here
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Title</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Type</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Completed</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Score</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Duration</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {completions.map((c) => (
                <tr
                  key={c.id}
                  data-testid={`row-completion-${c.id}`}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 font-medium">
                    {c.trainingTitle ?? c.eventTitle ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {c.trainingId ? (
                      <Badge variant="secondary" className="text-xs gap-1">
                        <BookOpen className="h-3 w-3" />
                        Training
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Calendar className="h-3 w-3" />
                        Event
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {format(new Date(c.completedAt), "MMM d, yyyy")}
                    {c.isOverdue && (
                      <Badge variant="destructive" className="ml-2 text-xs">Late</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.score != null ? `${c.score}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.durationMinutes != null ? `${c.durationMinutes} min` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.trainingId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1.5"
                        data-testid={`button-download-cert-${c.id}`}
                        onClick={() => {
                          window.open(`/api/completions/${c.id}/certificate`, "_blank");
                        }}
                      >
                        <Download className="h-3 w-3" />
                        Certificate
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
