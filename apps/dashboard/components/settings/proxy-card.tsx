"use client";

import { CheckCircle2, Plug, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_PROXY_URL, useConnection } from "@/hooks/use-connection";
import { attempt } from "@/lib/attempt";
import { fetchHealth } from "@/lib/proxy";

export const ProxyCard = () => {
  const { proxyUrl, setProxyUrl } = useConnection();
  const [edited, setEdited] = useState<string | null>(null);
  const draft = edited ?? proxyUrl;
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  const handleTest = async () => {
    setTesting(true);
    setResult(null);

    const outcome = await attempt(() => fetchHealth(draft));
    setTesting(false);

    if (outcome.ok) {
      setProxyUrl(draft);
      setEdited(null);
      setResult({
        ok: true,
        text: `Reachable, forwarding to ${outcome.data.origin}`,
      });
      toast.success("Gateway reachable");
      return;
    }

    setResult({ ok: false, text: outcome.message });
    toast.error("Could not reach the gateway");
  };

  return (
    <SettingsSection
      description="Where the thaipass proxy is listening. The dashboard calls it from your browser, so it has to be reachable from here."
      title="Gateway origin"
    >
      <div className="space-y-1.5">
        <Label htmlFor="proxy-url">Origin</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="font-mono text-base sm:max-w-sm sm:text-xs"
            id="proxy-url"
            onChange={(event) => setEdited(event.target.value)}
            placeholder={DEFAULT_PROXY_URL}
            value={draft}
          />
          <Button
            className="shrink-0"
            disabled={testing || draft.trim() === ""}
            onClick={handleTest}
          >
            <Plug />
            {testing ? "Testing…" : "Test & save"}
          </Button>
        </div>
      </div>

      {result ? (
        <p className="flex items-center gap-2 text-xs">
          {result.ok ? (
            <CheckCircle2 className="text-success size-3.5" />
          ) : (
            <XCircle className="text-destructive size-3.5" />
          )}
          <span
            className={result.ok ? "text-muted-foreground" : "text-destructive"}
          >
            {result.text}
          </span>
        </p>
      ) : null}
    </SettingsSection>
  );
};
