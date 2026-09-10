"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { useConnection } from "@/hooks/use-connection";
import { attempt } from "@/lib/attempt";
import { EMPTY_RUN, runReducer } from "@/lib/learn-run";
import type { RunState } from "@/lib/learn-run";
import { streamLearnRun } from "@/lib/lms";
import type { LearnRunBody } from "@/lib/lms";

export interface LearnRun {
  clear: () => void;
  error: string | null;
  running: boolean;
  start: (body: LearnRunBody) => void;
  state: RunState;
  stop: () => void;
}

/**
 * One run at a time, followed to its end. `onFinish` is what the page uses to
 * re-read the EXP the run just changed; a run left over from a previous page
 * is aborted rather than written into nothing.
 */
export const useLearnRun = (onFinish?: () => void): LearnRun => {
  const { cookie, proxyUrl } = useConnection();
  const [state, dispatch] = useReducer(runReducer, EMPTY_RUN);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const finishRef = useRef(onFinish);

  useEffect(() => {
    finishRef.current = onFinish;
  });

  useEffect(() => {
    const controller = abortRef;
    return () => controller.current?.abort();
  }, []);

  const start = useCallback(
    (body: LearnRunBody) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      dispatch({ kind: "reset" });
      setError(null);
      setRunning(true);

      const follow = async () => {
        const outcome = await attempt(() =>
          streamLearnRun({
            cookie,
            onEvent: (event) => dispatch({ event, kind: "event" }),
            options: body,
            proxyUrl,
            signal: controller.signal,
          })
        );

        // A newer run has taken over; this one's ending is not the page's news.
        if (abortRef.current !== controller) {
          return;
        }
        abortRef.current = null;
        setRunning(false);

        if (controller.signal.aborted) {
          return;
        }
        if (outcome.ok) {
          finishRef.current?.();
          return;
        }
        setError(outcome.message);
      };

      void follow();
    },
    [cookie, proxyUrl]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
    dispatch({ kind: "stopped" });
  }, []);

  const clear = useCallback(() => {
    dispatch({ kind: "reset" });
    setError(null);
  }, []);

  return { clear, error, running, start, state, stop };
};
