import { createContext, useContext, useCallback, ReactNode, useEffect } from "react";
import { useGetMe, User } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, error } = useGetMe({
    query: {
      retry: false,
      queryKey: ["me"],
    },
  });

  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && error && location !== "/setup") {
      // On a fresh install, check setup status before bouncing to login
      fetch("/api/setup/status", { credentials: "include" })
        .then((r) => r.json())
        .then((d: { needsSetup?: boolean }) => {
          setLocation(d.needsSetup ? "/setup" : "/login");
        })
        .catch(() => setLocation("/login"));
    }
  }, [isLoading, error, location, setLocation]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
    }
    queryClient.clear();
    setLocation("/login");
  }, [queryClient, setLocation]);

  return (
    <AuthContext.Provider
      value={{
        user: data?.user || null,
        isLoading,
        isAuthenticated: !!data?.user,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
