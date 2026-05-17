import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/auth-context";
import { AppLayout } from "@/components/layout/app-layout";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import TrainingDetailPage from "@/pages/training-detail";
import EventDetailPage from "@/pages/event-detail";
import HistoryPage from "@/pages/history";
import ManageTrainingsPage from "@/pages/manage/trainings";
import ManageEventsPage from "@/pages/manage/events";
import TeamStatusPage from "@/pages/team-status";
import AdminUsersPage from "@/pages/admin/users";
import AdminGroupsPage from "@/pages/admin/groups";
import AdminAssignmentsPage from "@/pages/admin/assignments";
import AdminSSOPage from "@/pages/admin/sso";
import AdminSMTPPage from "@/pages/admin/smtp";
import AdminApiKeysPage from "@/pages/admin/api-keys";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 30000 } },
});

function AuthenticatedRoute({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/">
        <AuthenticatedRoute><DashboardPage /></AuthenticatedRoute>
      </Route>
      <Route path="/dashboard">
        <AuthenticatedRoute><DashboardPage /></AuthenticatedRoute>
      </Route>
      <Route path="/trainings/:id">
        {(params) => (
          <AuthenticatedRoute><TrainingDetailPage id={params.id} /></AuthenticatedRoute>
        )}
      </Route>
      <Route path="/events/:id">
        {(params) => (
          <AuthenticatedRoute><EventDetailPage id={params.id} /></AuthenticatedRoute>
        )}
      </Route>
      <Route path="/history">
        <AuthenticatedRoute><HistoryPage /></AuthenticatedRoute>
      </Route>
      <Route path="/manage/trainings">
        <AuthenticatedRoute><ManageTrainingsPage /></AuthenticatedRoute>
      </Route>
      <Route path="/manage/events">
        <AuthenticatedRoute><ManageEventsPage /></AuthenticatedRoute>
      </Route>
      <Route path="/team">
        <AuthenticatedRoute><TeamStatusPage /></AuthenticatedRoute>
      </Route>
      <Route path="/admin/users">
        <AuthenticatedRoute><AdminUsersPage /></AuthenticatedRoute>
      </Route>
      <Route path="/admin/groups">
        <AuthenticatedRoute><AdminGroupsPage /></AuthenticatedRoute>
      </Route>
      <Route path="/admin/assignments">
        <AuthenticatedRoute><AdminAssignmentsPage /></AuthenticatedRoute>
      </Route>
      <Route path="/admin/sso">
        <AuthenticatedRoute><AdminSSOPage /></AuthenticatedRoute>
      </Route>
      <Route path="/admin/smtp">
        <AuthenticatedRoute><AdminSMTPPage /></AuthenticatedRoute>
      </Route>
      <Route path="/admin/api-keys">
        <AuthenticatedRoute><AdminApiKeysPage /></AuthenticatedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
