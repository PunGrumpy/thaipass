"use client";

import { CheckCircle2, Eye, EyeOff, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SettingsSection } from "@/components/settings/settings-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { useConnection } from "@/hooks/use-connection";
import { attempt } from "@/lib/attempt";
import { formatResetAt } from "@/lib/format";
import { fetchCredits } from "@/lib/proxy";
import type { CreditBalance } from "@/lib/proxy";

export const SessionCard = () => {
  const { cookie, hasSession, proxyUrl, setCookie } = useConnection();
  const [visible, setVisible] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const handleVerify = async () => {
    setVerifying(true);
    setError(null);

    const outcome = await attempt(() => fetchCredits(proxyUrl, cookie));
    setVerifying(false);

    if (outcome.ok) {
      setBalance(outcome.data);
      toast.success("Session accepted");
      return;
    }

    setBalance(null);
    setError(outcome.message);
    toast.error("Session rejected");
  };

  const handleClear = () => {
    setConfirming(false);
    setCookie("");
    setBalance(null);
    setError(null);
    toast.info("Session cookie removed from this browser");
  };

  return (
    <SettingsSection
      action={
        hasSession ? (
          <Badge variant="secondary">
            <ShieldCheck />
            stored locally
          </Badge>
        ) : null
      }
      description="Paste the full Cookie header from a signed-in de.aipass.net tab. It is kept in this browser only and is sent to nothing but your own gateway."
      title="AI Pass session"
    >
      <div className="max-w-lg space-y-1.5">
        <Label htmlFor="session-cookie">Cookie header</Label>
        <InputGroup>
          <InputGroupInput
            autoComplete="off"
            className="font-mono text-base sm:text-xs"
            id="session-cookie"
            onChange={(event) => setCookie(event.target.value)}
            placeholder="__Secure-ai_passport_auth.session_token=…"
            spellCheck={false}
            type={visible ? "text" : "password"}
            value={cookie}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label={visible ? "Hide cookie" : "Show cookie"}
              onClick={() => setVisible((previous) => !previous)}
              size="icon-xs"
              variant="ghost"
            >
              {visible ? <EyeOff /> : <Eye />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={!hasSession || verifying || confirming}
          onClick={handleVerify}
        >
          <CheckCircle2 />
          {verifying ? "Verifying…" : "Verify session"}
        </Button>

        {hasSession && !confirming ? (
          <Button onClick={() => setConfirming(true)} variant="ghost">
            <Trash2 />
            Remove session
          </Button>
        ) : null}

        {confirming ? (
          <>
            <Button onClick={handleClear} variant="destructive">
              <Trash2 />
              Confirm removal
            </Button>
            <Button onClick={() => setConfirming(false)} variant="ghost">
              Cancel
            </Button>
            <span className="text-muted-foreground text-xs">
              You will need to copy the cookie again to reconnect.
            </span>
          </>
        ) : null}
      </div>

      {error ? <p className="text-destructive text-xs">{error}</p> : null}

      {balance ? (
        <dl className="grid max-w-lg gap-3 rounded-lg border p-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Available</dt>
            <dd className="font-medium tabular-nums">
              {balance.available.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Used of limit</dt>
            <dd className="font-medium tabular-nums">
              {balance.used.toLocaleString()} / {balance.limit.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Resets</dt>
            <dd className="font-medium">{formatResetAt(balance.reset_at)}</dd>
          </div>
        </dl>
      ) : null}
    </SettingsSection>
  );
};
