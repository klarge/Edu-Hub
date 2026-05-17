import { useState, useEffect } from "react";
import {
  useListAuthProviders,
  useGetAuthProvider,
  useUpdateAuthProvider,
  getListAuthProvidersQueryKey,
  getGetAuthProviderQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Shield, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

type Provider = "saml" | "google" | "microsoft";

const PROVIDER_LABELS: Record<Provider, string> = {
  saml: "SAML SSO",
  google: "Google OAuth",
  microsoft: "Microsoft OAuth",
};

const PROVIDER_FIELDS: Record<Provider, { key: string; label: string; type?: string }[]> = {
  saml: [
    { key: "idpMetadataUrl", label: "IdP Metadata URL" },
    { key: "spEntityId", label: "SP Entity ID" },
    { key: "spAcsUrl", label: "SP ACS URL" },
  ],
  google: [
    { key: "clientId", label: "Client ID" },
    { key: "clientSecret", label: "Client Secret", type: "password" },
  ],
  microsoft: [
    { key: "clientId", label: "Client ID" },
    { key: "clientSecret", label: "Client Secret", type: "password" },
    { key: "tenantId", label: "Tenant ID" },
  ],
};

const PROVIDER_TEST_PATHS: Record<Provider, string> = {
  saml: "/api/auth/saml/login",
  google: "/api/auth/oauth/google/login",
  microsoft: "/api/auth/oauth/microsoft/login",
};

function ProviderCard({ provider }: { provider: Provider }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(false);

  const { data, isLoading } = useGetAuthProvider(provider, {
    query: { queryKey: getGetAuthProviderQueryKey(provider) },
  });
  const updateProvider = useUpdateAuthProvider();

  useEffect(() => {
    if (data?.provider) {
      setEnabled(data.provider.enabled ?? false);
      setConfig((data.provider.config as Record<string, string>) ?? {});
    }
  }, [data]);

  function handleSave(andTest = false) {
    updateProvider.mutate(
      { provider, data: { enabled, config } },
      {
        onSuccess: () => {
          toast({ title: `${PROVIDER_LABELS[provider]} settings saved` });
          queryClient.invalidateQueries({ queryKey: getListAuthProvidersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAuthProviderQueryKey(provider) });
          if (andTest) {
            window.open(PROVIDER_TEST_PATHS[provider], "_blank");
          }
        },
        onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
      }
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
        data-testid={`row-provider-${provider}`}
      >
        <div className="flex items-center gap-3">
          <span className="font-medium text-sm">{PROVIDER_LABELS[provider]}</span>
          {isLoading ? (
            <Skeleton className="h-5 w-16" />
          ) : (
            <Badge variant={enabled ? "default" : "secondary"} className="text-xs">
              {enabled ? "Enabled" : "Disabled"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={(v) => { setEnabled(v); }}
            onClick={(e) => e.stopPropagation()}
            data-testid={`switch-provider-${provider}`}
          />
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border space-y-4">
          {PROVIDER_FIELDS[provider].map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label>{field.label}</Label>
              <Input
                type={field.type ?? "text"}
                value={config[field.key] ?? ""}
                onChange={(e) => setConfig((prev) => ({ ...prev, [field.key]: e.target.value }))}
                data-testid={`input-${provider}-${field.key}`}
                placeholder={field.key}
              />
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => handleSave(true)}
              disabled={updateProvider.isPending}
              data-testid={`button-save-test-provider-${provider}`}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Save & Test
            </Button>
            <Button
              onClick={() => handleSave(false)}
              disabled={updateProvider.isPending}
              data-testid={`button-save-provider-${provider}`}
            >
              {updateProvider.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminSSOPage() {
  const { isLoading } = useListAuthProviders();
  const providers: Provider[] = ["saml", "google", "microsoft"];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5 text-muted-foreground" />
          SSO / Identity
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure external identity providers for single sign-on
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : (
        <div className="space-y-3 max-w-2xl">
          {providers.map((p) => (
            <ProviderCard key={p} provider={p} />
          ))}
        </div>
      )}

      <div className="max-w-2xl p-4 bg-muted/40 rounded-lg border border-border text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">SAML Metadata</p>
        <p>Your SP metadata is available at <code className="text-primary">/api/auth/saml/metadata</code></p>
        <p className="mt-1">ACS URL: <code className="text-primary">/api/auth/saml/callback</code></p>
      </div>
    </div>
  );
}
