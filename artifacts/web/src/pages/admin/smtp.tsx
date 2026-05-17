import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Mail, Send, Bell } from "lucide-react";

const schema = z.object({
  smtp_host: z.string().optional(),
  smtp_port: z.string().optional(),
  smtp_user: z.string().optional(),
  smtp_password: z.string().optional(),
  smtp_from: z.string().optional(),
  reminders_enabled: z.boolean().optional(),
  reminder_days_before: z.string().optional(),
});
type SmtpForm = z.infer<typeof schema>;

export default function AdminSMTPPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useGetSettings();
  const update = useUpdateSettings();
  const [testEmail, setTestEmail] = useState("");
  const [isTesting, setIsTesting] = useState(false);

  const form = useForm<SmtpForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      smtp_host: "",
      smtp_port: "",
      smtp_user: "",
      smtp_password: "",
      smtp_from: "",
      reminders_enabled: true,
      reminder_days_before: "3",
    },
  });

  useEffect(() => {
    if (data?.settings) {
      const s = data.settings;
      form.reset({
        smtp_host: s["smtp_host"] ?? "",
        smtp_port: s["smtp_port"] ?? "",
        smtp_user: s["smtp_user"] ?? "",
        smtp_password: s["smtp_password"] ?? "",
        smtp_from: s["smtp_from"] ?? "",
        reminders_enabled: s["reminders_enabled"] !== "false",
        reminder_days_before: s["reminder_days_before"] ?? "3",
      });
    }
  }, [data, form]);

  function onSubmit(values: SmtpForm) {
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined) continue;
      if (typeof v === "boolean") {
        payload[k] = v ? "true" : "false";
      } else {
        payload[k] = v;
      }
    }
    update.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast({ title: "Settings saved" });
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        },
        onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
      }
    );
  }

  async function handleSendTest() {
    if (!testEmail) {
      toast({ title: "Enter a recipient email address", variant: "destructive" });
      return;
    }
    setIsTesting(true);
    try {
      const res = await fetch("/api/settings/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmail }),
        credentials: "include",
      });
      if (res.ok) {
        toast({ title: "Test email sent", description: `Message dispatched to ${testEmail}` });
      } else {
        const body = await res.json().catch(() => ({}));
        toast({
          title: "Failed to send test email",
          description: (body as { error?: string }).error ?? "Check your SMTP settings and try again",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Network error", description: "Could not reach the server", variant: "destructive" });
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Mail className="h-5 w-5 text-muted-foreground" />
          SMTP Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure outbound email for notifications and certificates
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4 max-w-lg">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-lg">
          {/* SMTP connection */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="smtp_host">SMTP Host</Label>
              <Input
                id="smtp_host"
                placeholder="smtp.example.com"
                {...form.register("smtp_host")}
                data-testid="input-smtp-host"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp_port">SMTP Port</Label>
              <Input
                id="smtp_port"
                placeholder="587"
                {...form.register("smtp_port")}
                data-testid="input-smtp-port"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp_user">Username</Label>
              <Input
                id="smtp_user"
                placeholder="user@example.com"
                {...form.register("smtp_user")}
                data-testid="input-smtp-user"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp_password">Password</Label>
              <Input
                id="smtp_password"
                type="password"
                placeholder="••••••••"
                {...form.register("smtp_password")}
                data-testid="input-smtp-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="smtp_from">From Address</Label>
              <Input
                id="smtp_from"
                placeholder="no-reply@example.com"
                {...form.register("smtp_from")}
                data-testid="input-smtp-from"
              />
            </div>
          </div>

          {/* Reminder settings */}
          <div className="border-t border-border pt-5 space-y-4">
            <div>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Bell className="h-4 w-4 text-muted-foreground" />
                Due-date Reminder Emails
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sends a daily reminder to users with incomplete trainings due within the configured window.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="reminders_enabled" className="cursor-pointer">
                Enable reminder emails
              </Label>
              <Controller
                control={form.control}
                name="reminders_enabled"
                render={({ field }) => (
                  <Switch
                    id="reminders_enabled"
                    checked={field.value ?? true}
                    onCheckedChange={field.onChange}
                    data-testid="switch-reminders-enabled"
                  />
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reminder_days_before">Days before due date to send reminder</Label>
              <Input
                id="reminder_days_before"
                type="number"
                min="1"
                max="30"
                placeholder="3"
                {...form.register("reminder_days_before")}
                data-testid="input-reminder-days-before"
              />
            </div>
          </div>

          <div className="pt-1 flex gap-2">
            <Button type="submit" disabled={update.isPending} data-testid="button-save-smtp">
              {update.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </form>
      )}

      {/* Test email */}
      <div className="max-w-lg border-t border-border pt-5">
        <p className="text-sm font-medium mb-2">Send Test Email</p>
        <p className="text-xs text-muted-foreground mb-3">
          Verify your SMTP configuration by sending a test message.
        </p>
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="recipient@example.com"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            className="flex-1"
            data-testid="input-test-email-to"
          />
          <Button
            variant="outline"
            onClick={handleSendTest}
            disabled={isTesting}
            data-testid="button-send-test-email"
          >
            <Send className="h-4 w-4 mr-1.5" />
            {isTesting ? "Sending..." : "Send Test"}
          </Button>
        </div>
      </div>
    </div>
  );
}
