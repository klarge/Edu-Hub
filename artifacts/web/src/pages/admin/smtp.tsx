import { useEffect } from "react";
import { useForm } from "react-hook-form";
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
import { Mail } from "lucide-react";

const schema = z.object({
  smtp_host: z.string().optional(),
  smtp_port: z.string().optional(),
  smtp_user: z.string().optional(),
  smtp_password: z.string().optional(),
  smtp_from: z.string().optional(),
});
type SmtpForm = z.infer<typeof schema>;

export default function AdminSMTPPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useGetSettings();
  const update = useUpdateSettings();

  const form = useForm<SmtpForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      smtp_host: "",
      smtp_port: "",
      smtp_user: "",
      smtp_password: "",
      smtp_from: "",
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
      });
    }
  }, [data, form]);

  function onSubmit(values: SmtpForm) {
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v !== undefined) payload[k] = v;
    }
    update.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast({ title: "SMTP settings saved" });
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        },
        onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
      }
    );
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
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-w-lg">
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

          <div className="pt-2">
            <Button type="submit" disabled={update.isPending} data-testid="button-save-smtp">
              {update.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
