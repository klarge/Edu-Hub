import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Calendar,
  Users,
  Settings,
  LogOut,
  LayoutDashboard,
  History,
  GraduationCap,
  Shield,
  UserCircle,
  Key,
  Layers,
  Network,
  Mail,
  BarChart2,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface NavGroup {
  label: string;
  items: NavItem[];
  roles: string[];
}

const navGroups: NavGroup[] = [
  {
    label: "Learning",
    roles: ["user", "manager", "training_lead", "admin"],
    items: [
      { label: "My Training", href: "/dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
      { label: "My History", href: "/history", icon: <History className="h-4 w-4" /> },
    ],
  },
  {
    label: "Training Lead",
    roles: ["training_lead", "admin"],
    items: [
      { label: "Manage Trainings", href: "/manage/trainings", icon: <GraduationCap className="h-4 w-4" /> },
      { label: "Manage Events", href: "/manage/events", icon: <Calendar className="h-4 w-4" /> },
    ],
  },
  {
    label: "Manager",
    roles: ["manager", "admin"],
    items: [
      { label: "Team Status", href: "/team", icon: <BarChart2 className="h-4 w-4" /> },
    ],
  },
  {
    label: "Administration",
    roles: ["admin"],
    items: [
      { label: "Users", href: "/admin/users", icon: <Users className="h-4 w-4" /> },
      { label: "Groups", href: "/admin/groups", icon: <Network className="h-4 w-4" /> },
      { label: "Assignments", href: "/admin/assignments", icon: <Layers className="h-4 w-4" /> },
      { label: "SSO / Identity", href: "/admin/sso", icon: <Shield className="h-4 w-4" /> },
      { label: "SMTP Settings", href: "/admin/smtp", icon: <Mail className="h-4 w-4" /> },
      { label: "API Keys", href: "/admin/api-keys", icon: <Key className="h-4 w-4" /> },
    ],
  },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  training_lead: "Training Lead",
  manager: "Manager",
  user: "User",
};

export function AppSidebar() {
  const { user } = useAuth();
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const logout = useLogout();

  const role = user?.role ?? "user";

  function handleLogout() {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        window.location.href = "/login";
      },
    });
  }

  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : "?";

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col h-screen sticky top-0 bg-sidebar border-r border-sidebar-border overflow-hidden">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-sidebar-border flex items-center gap-3">
        <div className="h-7 w-7 rounded bg-primary flex items-center justify-center">
          <BookOpen className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-sidebar-accent-foreground tracking-tight">
          TrainHub
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {navGroups
          .filter((g) => g.roles.includes(role))
          .map((group) => (
            <div key={group.label}>
              <p className="px-2 mb-1 text-[10px] uppercase tracking-widest font-semibold text-sidebar-foreground/50">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active =
                    location === item.href ||
                    (item.href !== "/" && location.startsWith(item.href));
                  return (
                    <li key={item.href}>
                      <Link href={item.href}>
                        <a
                          data-testid={`nav-${item.href.replace(/\//g, "-").replace(/^-/, "")}`}
                          className={cn(
                            "flex items-center gap-2.5 px-2 py-1.5 rounded text-sm transition-colors",
                            active
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                          )}
                        >
                          {item.icon}
                          {item.label}
                        </a>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
      </nav>

      {/* User */}
      <div className="border-t border-sidebar-border px-3 py-3 flex items-center gap-2.5">
        <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-bold text-primary">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-sidebar-accent-foreground truncate">
            {user ? `${user.firstName} ${user.lastName}` : "—"}
          </p>
          <p className="text-[10px] text-sidebar-foreground">
            {ROLE_LABELS[role] ?? role}
          </p>
        </div>
        <button
          data-testid="button-logout"
          onClick={handleLogout}
          className="text-sidebar-foreground hover:text-sidebar-accent-foreground transition-colors"
          title="Sign out"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </aside>
  );
}
