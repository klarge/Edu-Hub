import {
  useGetTeamCompletionStatus,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart2, CheckCircle2 } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  training_lead: "Training Lead",
  manager: "Manager",
  user: "User",
};

function getInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export default function TeamStatusPage() {
  const { data, isLoading } = useGetTeamCompletionStatus();
  const users = data?.users ?? [];

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
          <Badge variant="secondary">{users.length} members</Badge>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : users.length === 0 ? (
        <div className="bg-muted rounded-lg p-12 text-center">
          <BarChart2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">No team members found</p>
          <p className="text-xs text-muted-foreground mt-1">
            Users in your managed groups will appear here
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Member</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Role</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Completion Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => {
                const summary = u.completionSummary as Record<string, unknown> | null;
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
                    <td className="px-4 py-3">
                      {summary ? (
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-xs text-muted-foreground">
                            {JSON.stringify(summary)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No data</span>
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
