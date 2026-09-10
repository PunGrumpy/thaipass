"use client";

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
import { formatPercent } from "@/lib/format";
import { isResumable, isRunEmpty } from "@/lib/learn-run";
import { MONTHLY_TARGET } from "@/lib/lms";
import { cn } from "@/lib/utils";

const LearningPage = () => {
  const { hasSession } = useConnection();
  const { data, error, loading, reload } = useLearning();
  const {
    clear: handleClear,
    error: runError,
    running,
    start: handleStart,
    state: runState,
    stop: handleStop,
  } = useLearnRun(reload);

  const monthly = data?.monthly ?? null;
  const share =
    monthly === null ? null : formatPercent(monthly, MONTHLY_TARGET);

  return (
    <>
      <PageHeader
        action={
          <Button
            disabled={loading || !hasSession}
            onClick={() => reload()}
            variant="outline"
          >
            <RefreshCw className={cn(loading && "animate-spin")} />
            Refresh
          </Button>
        }
        description="EXP the LMS has recorded for this account, and the runs that earn more. A run completes lessons through the gateway, so it changes the account."
        title="Learning"
      />
      {hasSession ? null : (
        <Alert>
          <TriangleAlert />
          <AlertTitle>No session connected</AlertTitle>
          <AlertDescription>
            Add a session cookie in Settings to read the LMS and to run lessons.
          </AlertDescription>
        </Alert>
      )}

      {error ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Could not read the LMS</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="bg-border ring-border grid gap-px overflow-hidden rounded-xl ring-1 sm:grid-cols-2">
        <StatCard
          footer={
            monthly === null
              ? "The payload named no monthly figure"
              : `${share}% of the ${MONTHLY_TARGET} EXP default target`
          }
          label="EXP this period"
          loading={loading && !data}
          value={monthly}
        />
        <StatCard
          footer="Courses outside the per-type breakdown"
          label="Standard course EXP"
          loading={loading && !data}
          value={data?.normalCourseExp ?? null}
        />
      </div>

      <RunPanel
        canClear={!isRunEmpty(runState)}
        hasSession={hasSession}
        onClear={handleClear}
        onStart={handleStart}
        onStop={handleStop}
        paused={isResumable(runState)}
        running={running}
      />

      <RunFeed error={runError} running={running} state={runState} />

      <section aria-labelledby="breakdown-heading" className="space-y-4">
        <h2 className="text-base font-medium" id="breakdown-heading">
          By lesson type
        </h2>
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
