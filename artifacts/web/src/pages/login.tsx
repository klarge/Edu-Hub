import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BookOpen } from "lucide-react";
import {
  useLogin,
  useGetPublicSettings,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const login = useLogin();
  const { data: publicSettings } = useGetPublicSettings();

  const settings = publicSettings?.settings ?? {};
  const samlEnabled = settings["saml_enabled"] === "true";
  const googleEnabled = settings["google_enabled"] === "true";
  const microsoftEnabled = settings["microsoft_enabled"] === "true";

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  function onSubmit(values: FormValues) {
    login.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          setLocation("/dashboard");
        },
        onError: (err: unknown) => {
          const msg =
            (err as { data?: { error?: string } })?.data?.error ??
            "Invalid email or password";
          toast({ title: "Login failed", description: msg, variant: "destructive" });
        },
      }
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-semibold tracking-tight">TrainHub</span>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
          <h1 className="text-base font-semibold mb-1">Sign in to your account</h1>
          <p className="text-sm text-muted-foreground mb-5">Enter your credentials below</p>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                data-testid="input-email"
                placeholder="you@example.com"
                {...form.register("email")}
              />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                data-testid="input-password"
                placeholder="••••••••"
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              data-testid="button-submit-login"
              disabled={login.isPending}
            >
              {login.isPending ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          {(samlEnabled || googleEnabled || microsoftEnabled) && (
            <>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-2 text-muted-foreground">or continue with</span>
                </div>
              </div>
              <div className="space-y-2">
                {samlEnabled && (
                  <Button
                    variant="outline"
                    className="w-full"
                    data-testid="button-saml-login"
                    onClick={() => { window.location.href = "/api/auth/saml/login"; }}
                  >
                    Sign in with SAML SSO
                  </Button>
                )}
                {googleEnabled && (
                  <Button
                    variant="outline"
                    className="w-full"
                    data-testid="button-google-login"
                    onClick={() => { window.location.href = "/api/auth/oauth/google/login"; }}
                  >
                    Sign in with Google
                  </Button>
                )}
                {microsoftEnabled && (
                  <Button
                    variant="outline"
                    className="w-full"
                    data-testid="button-microsoft-login"
                    onClick={() => { window.location.href = "/api/auth/oauth/microsoft/login"; }}
                  >
                    Sign in with Microsoft
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
