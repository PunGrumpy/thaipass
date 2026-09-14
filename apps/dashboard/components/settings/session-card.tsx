"use client";

import {
  AlertCircle,
  Check,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  HelpCircle,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PasteIcon, VerifiedIcon } from "@/components/icons/rune";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { useConnection } from "@/hooks/use-connection";
import { useGateway } from "@/hooks/use-gateway";
import { formatResetAt } from "@/lib/format";
import { hasSessionToken } from "@/lib/proxy";
import type { CreditBalance } from "@/lib/proxy";
import { readClipboardSession } from "@/lib/session-paste";
import { cn } from "@/lib/utils";

const AIPASS_URL = "https://de.aipass.net";

const SessionStatus = ({
  balance,
  error,
  loading,
}: {
  readonly balance: CreditBalance | null;
  readonly error: string | null;
  readonly loading: boolean;
}) => {
  if (loading) {
    return (
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Loader2 className="size-3 animate-spin" />
        Checking the session…
      </p>
    );
  }
  if (error !== null) {
    return <p className="text-destructive text-xs text-pretty">{error}</p>;
  }
  if (balance === null) {
    return null;
  }
  return (
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
  );
};

export const SessionCard = () => {
  const { cookie, hasSession, setCookie } = useConnection();
  const { credits } = useGateway();
  const handleRecheck = credits.reload;
  const [visible, setVisible] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [guideOpen, setGuideOpen] = useState<boolean | null>(null);

  const isTokenValid = hasSession && hasSessionToken(cookie);

  const handlePaste = async () => {
    setPasting(true);
    const outcome = await readClipboardSession();
    setPasting(false);

    if (outcome.kind === "saved") {
      setCookie(outcome.cookie);
      toast.success("Session connected");
      return;
    }
    if (outcome.kind === "empty") {
      toast.error("Nothing in the clipboard yet");
      return;
    }
    if (outcome.kind === "invalid") {
      toast.error("That copy holds no AI Pass session");
      return;
    }
    toast.error("This browser would not share the clipboard. Paste below.");
  };

  const handleClear = () => {
    setConfirming(false);
    setCookie("");
    toast.info("Session removed from this browser");
  };

  return (
    <Section
      badge={
        hasSession ? (
          <Badge variant="secondary">
            <VerifiedIcon />
            stored locally
          </Badge>
        ) : null
      }
      description="The session of a signed-in de.aipass.net tab. It stays in this browser, goes to nothing but your own gateway, and is checked the moment you paste it."
      title="AI Pass session"
    >
      <div className="max-w-lg space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="session-cookie">Session cookie</Label>
          {isTokenValid ? (
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              <Check className="text-success size-3" />
              Session token found
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <InputGroup>
            <InputGroupInput
              autoComplete="off"
              className="font-mono text-base sm:text-xs"
              id="session-cookie"
              onChange={(event) => setCookie(event.target.value)}
              placeholder="Paste the token, the Cookie header, or a cURL command"
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
          <Button className="shrink-0" disabled={pasting} onClick={handlePaste}>
            <PasteIcon />
            {pasting ? "Reading…" : "Paste and connect"}
          </Button>
        </div>

        {hasSession && !isTokenValid ? (
          <p className="text-destructive text-xs text-pretty">
            This holds no <code>__Secure-ai_passport_auth.session_token</code>.
            Copy the token&apos;s value, the whole Cookie header, or the request
            as cURL.
          </p>
        ) : null}
      </div>

      <Collapsible
        className="max-w-lg"
        onOpenChange={setGuideOpen}
        open={guideOpen ?? !hasSession}
      >
        <CollapsibleTrigger className="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1.5 text-xs transition-colors">
          <HelpCircle className="size-3.5" />
          <span>Where to find it</span>
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform duration-200",
              (guideOpen ?? !hasSession) && "rotate-180"
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <div className="bg-muted/40 rounded-lg border p-3 text-xs">
            <ol className="text-muted-foreground list-decimal space-y-1 pl-4">
              <li>
                Sign in to{" "}
                <a
                  className="hover:text-foreground inline-flex items-center gap-0.5 underline underline-offset-2"
                  href={AIPASS_URL}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  de.aipass.net
                  <ExternalLink className="size-3" />
                </a>
                .
              </li>
              <li>
                Press{" "}
                <kbd className="bg-background rounded border px-1 py-0.5 font-mono text-xs">
                  F12
                </kbd>{" "}
                → <strong>Application</strong> → <strong>Cookies</strong> →{" "}
                <code>https://de.aipass.net</code>.
              </li>
              <li>
                Copy the value of{" "}
                <code>__Secure-ai_passport_auth.session_token</code>, then press{" "}
                <strong>Paste and connect</strong>. The whole Cookie header and
                a <strong>Copy as cURL</strong> from the Network tab work just
                as well — the field takes any of them.
              </li>
            </ol>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {hasSession ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={credits.loading || confirming}
            onClick={handleRecheck}
            variant="outline"
          >
            <RefreshCw />
            Check again
          </Button>

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
                You will need to paste the cookie again to reconnect.
              </span>
            </>
          ) : (
            <Button onClick={() => setConfirming(true)} variant="ghost">
              <Trash2 />
              Remove session
            </Button>
          )}
        </div>
      ) : null}

      {hasSession ? (
        <SessionStatus
          balance={credits.data}
          error={credits.error}
          loading={credits.loading}
        />
      ) : (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <AlertCircle className="size-3" />
          No session yet. Nothing here reaches your account until one is pasted.
        </p>
      )}
    </Section>
  );
};
