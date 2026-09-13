"use client";

import { useI18n } from "@thaipass/internationalization";
import { ArrowRight, KeyRound } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StepPlayer } from "@/components/ui/step-player";
import { fill } from "@/lib/format";

const STEP_MS = 4000;

/** The first screen almost everyone sees, so it carries the whole setup path. */
export const SessionGate = () => {
  const [step, setStep] = useState(0);
  const { locale, t } = useI18n();
  const gate = t.overview.sessionGate;

  const steps = useMemo(
    () => [gate.steps.signIn, gate.steps.copy, gate.steps.paste] as const,
    [gate]
  );
  const current = steps[step] ?? steps[0];

  return (
    <Card>
      <CardContent className="grid gap-6 py-4 md:grid-cols-[1.1fr_1fr] md:items-center">
        <div className="space-y-4">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
            <KeyRound className="size-3.5" />
            {gate.badge}
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">
              {gate.title}
            </h2>
            <p className="text-muted-foreground max-w-md text-sm text-pretty">
              {gate.description}
            </p>
          </div>
          <Button
            nativeButton={false}
            render={<Link href={`/${locale}/settings`} />}
          >
            {gate.action}
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>

        <div className="bg-muted/40 space-y-3 rounded-lg border p-4">
          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground text-xs font-medium tabular-nums">
              {fill(gate.step, step + 1, steps.length)}
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
