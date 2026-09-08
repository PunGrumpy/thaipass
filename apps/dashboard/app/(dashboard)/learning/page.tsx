"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { LessonTypeTable } from "@/components/learning/lesson-type-table";
import { StatCard } from "@/components/overview/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConnection } from "@/hooks/use-connection";
import { useLearning } from "@/hooks/use-learning";
import { formatPercent } from "@/lib/format";
import { MONTHLY_TARGET } from "@/lib/lms";
import { cn } from "@/lib/utils";

const LearningPage = () => {
  const { hasSession } = useConnection();
  const { data, error, loading, reload } = useLearning();

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
        description="EXP the LMS has recorded for this account, read through the gateway. Nothing on this page changes anything."
        title="Learning"
      />
      {hasSession ? null : (
        <Alert>
          <AlertTriangle />
          <AlertTitle>No session connected</AlertTitle>
          <AlertDescription>
            Add a session cookie in Settings to read the LMS.
          </AlertDescription>
        </Alert>
      )}

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle />
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

      {loading && !data ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <LessonTypeTable rows={data?.perLessonType ?? []} />
      )}
    </>
  );
};

export default LearningPage;
