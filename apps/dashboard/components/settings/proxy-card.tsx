"use client";

import { CheckCircle2, Lock, Plug, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_PROXY_URL, useConnection } from "@/hooks/use-connection";
import { attempt } from "@/lib/attempt";
import { fetchHealth } from "@/lib/proxy";

export const ProxyCard = () => {
  const { proxyLocked, proxyUrl, setProxyUrl } = useConnection();
  const [edited, setEdited] = useState<string | null>(null);
  const draft = edited ?? proxyUrl;
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  const testLabel = () => {
    if (testing) {
      return "Testing…";
    }
    return proxyLocked ? "Test" : "Test & save";
  };

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
    <Section
      badge={
        proxyLocked ? (
          <Badge variant="secondary">
            <Lock />
            fixed by this deployment
          </Badge>
        ) : null
      }
      description={
        proxyLocked
          ? "This dashboard talks to one gateway, and only that one. Run your own copy of thaipass to point somewhere else — the source and the deploy steps are in the README."
          : "Where the thaipass proxy is listening. The dashboard calls it from your browser, so it has to be reachable from here."
      }
      title="Gateway origin"
    >
      <div className="space-y-1.5">
        <Label htmlFor="proxy-url">Origin</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="font-mono text-base sm:max-w-sm sm:text-xs"
            disabled={proxyLocked}
            id="proxy-url"
            onChange={(event) => setEdited(event.target.value)}
            placeholder={DEFAULT_PROXY_URL}
            readOnly={proxyLocked}
            value={draft}
          />
          <Button
            className="shrink-0"
            disabled={testing || draft.trim() === ""}
            onClick={handleTest}
            variant={proxyLocked ? "outline" : "default"}
          >
            <Plug />
            {testLabel()}
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
    </Section>
  );
};
