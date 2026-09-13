"use client";

import { useI18n } from "@thaipass/internationalization";
import { RefreshCw, TriangleAlert } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { LessonTypeTable } from "@/components/learning/lesson-type-table";
import { RunFeed } from "@/components/learning/run-feed";
import { RunPanel } from "@/components/learning/run-panel";
import { StatCard } from "@/components/overview/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConnection } from "@/hooks/use-connection";
import { useLearnRun } from "@/hooks/use-learn-run";
import { useLearning } from "@/hooks/use-learning";
import { fill } from "@/lib/format";
import { isResumable, isRunEmpty, plannedSeconds } from "@/lib/learn-run";
import { MONTHLY_TARGET } from "@/lib/lms";
import { cn } from "@/lib/utils";

const LearningPage = () => {
  const { hasSession } = useConnection();
  const { data, error, loading, reload } = useLearning();
  const { t } = useI18n();
  const {
    clear: handleClear,
    error: runError,
    running,
    start: handleStart,
    state: runState,
    stop: handleStop,
  } = useLearnRun(reload);

  const monthly = data?.monthly ?? null;

  /* A preview walks the catalogue and changes nothing, so what it found is the
     honest answer to "how long would this take" — and the only one available
     before the run itself starts. */
  const estimate =
    runState.preview && runState.summary
      ? {
          lessons: runState.summary.lessons,
          seconds: plannedSeconds(runState),
        }
      : null;

  return (
    <>
      <PageHeader
        action={
          <Button
            disabled={loading || !hasSession}
            focusableWhenDisabled
            onClick={() => reload()}
            variant="outline"
          >
            <RefreshCw className={cn(loading && "animate-spin")} />
            {loading ? t.common.actions.refreshing : t.common.actions.refresh}
          </Button>
        }
        description={t.learning.description}
        title={t.learning.title}
      />
      {hasSession ? null : (
        <Alert>
          <TriangleAlert />
          <AlertTitle>{t.learning.session.title}</AlertTitle>
          <AlertDescription>{t.learning.session.description}</AlertDescription>
        </Alert>
      )}

      {error ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>{t.learning.error}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <RunPanel
        canClear={!isRunEmpty(runState)}
        estimate={estimate}
        hasSession={hasSession}
        monthly={monthly}
        onClear={handleClear}
        onStart={handleStart}
        onStop={handleStop}
        paused={isResumable(runState)}
        running={running}
      />

      <RunFeed error={runError} running={running} state={runState} />

      <section aria-labelledby="breakdown-heading" className="space-y-4">
        <h2 className="text-base font-medium" id="breakdown-heading">
          {t.learning.breakdown.title}
        </h2>

        <div className="bg-border ring-border grid gap-px overflow-hidden rounded-xl ring-1 sm:grid-cols-2">
          <StatCard
            footer={t.learning.breakdown.standard.footer}
            label={t.learning.breakdown.standard.label}
            loading={loading && !data}
            value={data?.normalCourseExp ?? null}
          />
          <StatCard
            footer={fill(
              t.learning.breakdown.monthly.footer,
              MONTHLY_TARGET.toLocaleString()
            )}
            label={t.learning.breakdown.monthly.label}
            loading={loading && !data}
            value={monthly}
          />
        </div>

        {loading && !data ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <LessonTypeTable rows={data?.perLessonType ?? []} />
        )}
      </section>
    </>
  );
};

export default LearningPage;
