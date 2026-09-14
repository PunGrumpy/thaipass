"use client";

import { useI18n } from "@thaipass/internationalization";
import { RefreshCw, TriangleAlert } from "lucide-react";

import { Section } from "@/components/layout/section";
import { Toolbar } from "@/components/layout/toolbar";
import { ExpBreakdown } from "@/components/learning/exp-breakdown";
import { RunFeed } from "@/components/learning/run-feed";
import { RunPanel } from "@/components/learning/run-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useConnection } from "@/hooks/use-connection";
import { useLearnRun } from "@/hooks/use-learn-run";
import { useLearning } from "@/hooks/use-learning";
import { isResumable, isRunEmpty, plannedSeconds } from "@/lib/learn-run";
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

  const estimate =
    runState.preview && runState.summary
      ? {
          lessons: runState.summary.lessons,
          seconds: plannedSeconds(runState),
        }
      : null;

  return (
    <>
      <Toolbar
        actions={
          <Button
            className="aria-disabled:opacity-50"
            disabled={loading || !hasSession}
            focusableWhenDisabled
            onClick={() => reload()}
            size="sm"
            variant="outline"
          >
            <RefreshCw
              className={cn(loading && "animate-spin")}
              data-icon="inline-start"
            />
            {loading ? t.common.actions.refreshing : t.learning.reload}
          </Button>
        }
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

      <div className="grid min-w-0 gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section title={t.learning.run.title}>
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
          </Section>

          <Section title={t.learning.feed.title}>
            <RunFeed error={runError} running={running} state={runState} />
          </Section>
        </div>

        <Section className="min-w-0" title={t.learning.breakdown.title}>
          <ExpBreakdown
            loading={loading && !data}
            monthly={monthly}
            perLessonType={data?.perLessonType ?? []}
            standard={data?.normalCourseExp ?? null}
          />
        </Section>
      </div>
    </>
  );
};

export default LearningPage;
