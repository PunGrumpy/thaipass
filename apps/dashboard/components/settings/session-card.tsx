"use client";

import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardPaste,
  ExternalLink,
  Eye,
  EyeOff,
  HelpCircle,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SettingsSection } from "@/components/settings/settings-section";
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
import { attempt } from "@/lib/attempt";
import { formatResetAt } from "@/lib/format";
import { fetchCredits, hasSessionToken, normalizeCookie } from "@/lib/proxy";
import type { CreditBalance } from "@/lib/proxy";

export const SessionCard = () => {
  const { cookie, hasSession, proxyUrl, setCookie } = useConnection();
  const [visible, setVisible] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const isTokenValid = hasSession && hasSessionToken(cookie);

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

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast.error("Clipboard is empty");
        return;
      }
      const cleaned = normalizeCookie(text);
      if (!cleaned) {
        toast.error("No valid cookie found in clipboard");
        return;
      }
      setCookie(cleaned);
      if (hasSessionToken(cleaned)) {
        toast.success("Cookie extracted and saved from clipboard");
      } else {
        toast.warning(
          "Pasted from clipboard, but session token (__Secure-ai_passport_auth.session_token) is missing"
        );
      }
    } catch {
      toast.error(
        "Could not access clipboard. Please paste manually into the field."
      );
    }
  };

  const renderTokenStatus = () => {
    if (!hasSession) {
      return null;
    }
    if (isTokenValid) {
      return (
        <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
          <Check className="size-3 text-emerald-500" />
          Session token found
        </span>
      );
    }
    return (
      <span className="text-destructive flex items-center gap-1 text-[11px]">
        <AlertCircle className="size-3" />
        Missing session token
      </span>
    );
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
      description="Paste the Cookie header or a cURL command from a signed-in de.aipass.net tab. It is kept in this browser only and is sent to nothing but your own gateway."
      title="AI Pass session"
    >
      <div className="max-w-lg space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="session-cookie">Cookie or cURL command</Label>
          {renderTokenStatus()}
        </div>
        <InputGroup>
          <InputGroupInput
            autoComplete="off"
            className="font-mono text-base sm:text-xs"
            id="session-cookie"
            onChange={(event) => setCookie(event.target.value)}
            placeholder="Paste Cookie header, cURL, or __Secure-ai_passport_auth.session_token=…"
            spellCheck={false}
            type={visible ? "text" : "password"}
            value={cookie}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label="Paste from clipboard"
              onClick={handlePasteFromClipboard}
              size="icon-xs"
              title="Paste from clipboard"
              variant="ghost"
            >
              <ClipboardPaste />
            </InputGroupButton>
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
        {hasSession && !isTokenValid ? (
          <p className="text-destructive text-xs">
            Cookie does not contain{" "}
            <code>__Secure-ai_passport_auth.session_token</code>. Copy the full
            Cookie header or request as cURL from DevTools.
          </p>
        ) : null}
      </div>

      <Collapsible
        className="max-w-lg"
        onOpenChange={setGuideOpen}
        open={guideOpen}
      >
        <CollapsibleTrigger className="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1.5 text-xs transition-colors">
          <HelpCircle className="size-3.5" />
          <span>How to copy cookie in 30 seconds</span>
          <ChevronDown
            className={`size-3.5 transition-transform duration-200 ${
              guideOpen ? "rotate-180" : ""
            }`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <div className="bg-muted/40 space-y-2 rounded-lg border p-3 text-xs">
            <p className="font-medium">Quickest shortcut: Copy as cURL</p>
            <ol className="text-muted-foreground list-decimal space-y-1 pl-4">
              <li>
                Sign in to{" "}
                <a
                  className="hover:text-foreground inline-flex items-center gap-0.5 underline underline-offset-2"
                  href="https://de.aipass.net"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  de.aipass.net
                  <ExternalLink className="size-3" />
                </a>
                .
              </li>
              <li>
                Open DevTools (
                <kbd className="bg-background rounded border px-1 py-0.5 font-mono text-[10px]">
                  F12
                </kbd>{" "}
                or right-click → Inspect) and switch to the{" "}
                <strong>Network</strong> tab.
              </li>
              <li>
                Right-click any request to <code>de.aipass.net</code> →{" "}
                <strong>Copy</strong> → <strong>Copy as cURL</strong>.
              </li>
              <li>
                Click the <strong>Paste</strong> button or paste it directly
                above — the dashboard automatically extracts the session token!
              </li>
            </ol>
          </div>
        </CollapsibleContent>
      </Collapsible>

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
