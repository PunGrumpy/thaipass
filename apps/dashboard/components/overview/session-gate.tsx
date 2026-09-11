"use client";

import { useI18n } from "@thaipass/internationalization";
import { ArrowRight, KeyRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StepPlayer } from "@/components/ui/step-player";

const STEPS = [
  {
    body: "Open de.aipass.net and sign in, so the browser holds a live session.",
    label: "Sign in to AI Pass",
  },
  {
    body: "In DevTools → Network, right-click any request and choose Copy as cURL (or copy the Cookie header).",
    label: "Copy as cURL or Cookie",
  },
  {
    body: "Paste into Settings. The dashboard automatically parses and extracts your session cookie.",
    label: "Paste into Settings",
  },
] as const;

const STEP_MS = 4000;

/** The first screen almost everyone sees, so it carries the whole setup path. */
export const SessionGate = () => {
  const [step, setStep] = useState(0);
  const { locale } = useI18n();
  const current = STEPS[step] ?? STEPS[0];

  return (
    <Card>
      <CardContent className="grid gap-6 py-4 md:grid-cols-[1.1fr_1fr] md:items-center">
        <div className="space-y-4">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
            <KeyRound className="size-3.5" />
            No session connected
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">
              Connect your AI Pass session
            </h2>
            <p className="text-muted-foreground max-w-md text-sm text-pretty">
              The gateway forwards your own AI Pass credentials and stores
              nothing. Add the session cookie once to enable quota, catalog, and
              the playground.
            </p>
          </div>
          <Button
            nativeButton={false}
            render={<Link href={`/${locale}/settings`} />}
          >
            Add session cookie
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>

        <div className="bg-muted/40 space-y-3 rounded-lg border p-4">
          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground text-xs font-medium tabular-nums">
              Step {step + 1} of {STEPS.length}
            </span>
            <span className="text-sm font-medium">{current.label}</span>
          </div>

          <p className="text-muted-foreground min-h-10 text-sm text-pretty">
            {current.body}
          </p>

          {/*
            Seekable and pausable, so the walkthrough is a control rather than
            an animation the reader has to keep up with.
          */}
          <StepPlayer
            duration={STEP_MS}
            loop
            onValueChange={setStep}
            seekable
            steps={STEPS.map((entry) => ({ label: entry.label }))}
            value={step}
          />
        </div>
      </CardContent>
    </Card>
  );
};
