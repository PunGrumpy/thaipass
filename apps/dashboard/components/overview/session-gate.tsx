"use client";

import { useI18n } from "@thaipass/internationalization";
import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PasteIcon, SignedInIcon } from "@/components/icons/rune";
import { SessionWalkthrough } from "@/components/overview/session-walkthrough";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StepPlayer } from "@/components/ui/step-player";
import { useConnection } from "@/hooks/use-connection";
import { fill } from "@/lib/format";
import { readClipboardSession, readPastedSession } from "@/lib/session-paste";
import type { PasteOutcome } from "@/lib/session-paste";

const STEP_MS = 4000;

export const SessionGate = () => {
  const [step, setStep] = useState(0);
  const [pasting, setPasting] = useState(false);
  const { locale, t } = useI18n();
  const { setCookie } = useConnection();
  const still = useReducedMotion();
  const gate = t.overview.sessionGate;

  const steps = useMemo(
    () =>
      [
        gate.steps.signIn,
        gate.steps.open,
        gate.steps.copy,
        gate.steps.paste,
      ] as const,
    [gate]
  );
  const current = steps[step] ?? steps[0];

  const { clipboard } = gate;

  const apply = useCallback(
    (outcome: PasteOutcome) => {
      if (outcome.kind === "saved") {
        setCookie(outcome.cookie);
        toast.success(clipboard.done);
        return;
      }
      if (outcome.kind === "empty") {
        toast.error(clipboard.empty);
        return;
      }
      toast.error(
        outcome.kind === "invalid" ? clipboard.invalid : clipboard.blocked
      );
    },
    [clipboard, setCookie]
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      // SAFETY: a paste event's target is an element of this document, and the
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.closest("input, textarea")) {
        return;
      }
      const text = event.clipboardData?.getData("text") ?? "";
      const outcome = readPastedSession(text);
      if (outcome.kind === "empty") {
        return;
      }
      event.preventDefault();
      apply(outcome);
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [apply]);

  const handlePaste = async () => {
    setPasting(true);
    const outcome = await readClipboardSession();
    setPasting(false);
    apply(outcome);
  };

  return (
    <Card>
      <CardContent className="grid gap-6 py-4 md:grid-cols-[1.1fr_1fr] md:items-start">
        <div className="space-y-4">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
            <SignedInIcon className="size-3.5" />
            {gate.badge}
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold tracking-tight">
              {gate.title}
            </h2>
            <p className="text-muted-foreground max-w-md text-sm text-pretty">
              {gate.description}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={pasting} onClick={handlePaste}>
              <PasteIcon data-icon="inline-start" />
              {pasting ? clipboard.busy : clipboard.action}
            </Button>
            <Link
              className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
              href={`/${locale}/settings`}
            >
              {gate.action}
            </Link>
          </div>
        </div>

        <div className="bg-muted/40 space-y-3 rounded-lg border p-4">
          <SessionWalkthrough index={step} pasteLabel={clipboard.action} />

          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground text-xs font-medium tabular-nums">
              {fill(gate.step, step + 1, steps.length)}
            </span>
            <span className="text-sm font-medium">{current.label}</span>
          </div>

          <p className="text-muted-foreground min-h-14 text-sm text-pretty">
            {current.body}
          </p>

          <StepPlayer
            defaultPlaying={!still}
            duration={STEP_MS}
            labels={{ ...gate.player, track: gate.step }}
            loop
            onValueChange={setStep}
            seekable
            steps={steps.map((entry) => ({ label: entry.label }))}
            value={step}
          />
        </div>
      </CardContent>
    </Card>
  );
};
