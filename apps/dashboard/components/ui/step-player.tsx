"use client";

import { combine, separate } from 'flubber';
import type { Interpolator } from 'flubber';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';

import { cn } from "@/lib/utils";

const WIDTH_SPRING = { bounce: 0.14, duration: 0.42, type: "spring" } as const;
const ICON_SPRING = { bounce: 0.22, duration: 0.32, type: "spring" } as const;
const TAP_SPRING = { bounce: 0.3, duration: 0.25, type: "spring" } as const;
const ICON_FADE = { duration: 0.26, ease: [0.32, 0.72, 0, 1] } as const;

const PLAY_PATH = "M9.8 7 L17.7 12 L9.8 17 Z";
const PAUSE_LEFT = "M8.4 5.9 L10.4 5.9 L10.4 18.1 L8.4 18.1 Z";
const PAUSE_RIGHT = "M13.6 5.9 L15.6 5.9 L15.6 18.1 L13.6 18.1 Z";
const REPLAY_PATH =
  "M17.44 6.56 A7.7 7.7 0 1 1 10.66 4.42 L10.32 2.45 L14.86 4.59 L11.32 8.16 L10.91 5.8 A6.3 6.3 0 1 0 16.45 7.55 Z";

type IconState = "play" | "pause" | "replay";

const RESTING: Record<IconState, string> = {
  pause: `${PAUSE_LEFT} ${PAUSE_RIGHT}`,
  play: PLAY_PATH,
  replay: REPLAY_PATH,
};

const MORPH_OPTIONS = { maxSegmentLength: 0.8, single: true };
const PAUSE_PATHS = [PAUSE_LEFT, PAUSE_RIGHT];
const ENTER_SCALE = 0.82;

// replay has no sensible vertex match, so it cross dissolves instead
const canMorph = (from: IconState, to: IconState) =>
  (from === "play" && to === "pause") || (from === "pause" && to === "play");

const morphBetween = (from: IconState): Interpolator =>
  from === "play"
    ? separate(PLAY_PATH, PAUSE_PATHS, MORPH_OPTIONS)
    : combine(PAUSE_PATHS, PLAY_PATH, MORPH_OPTIONS);

// proportions traced from the iOS reference
const RATIO = { barPerDot: 8.2, dot: 0.115, gap: 0.18, icon: 0.64 } as const;
const MIN_HIT = 44;

const iconStateFor = (finished: boolean, playing: boolean): IconState => {
  if (finished) {
    return "replay";
  }
  return playing ? "pause" : "play";
};

const CONTROL_LABEL: Record<IconState, string> = {
  pause: "Pause",
  play: "Play",
  replay: "Replay",
};

type StepState = "active" | "past" | "pending";

const stepStateFor = (position: number, current: number): StepState => {
  if (position === current) {
    return "active";
  }
  return position < current ? "past" : "pending";
};

const metricsFor = (size: number) => {
  const track = Math.max(12, size);
  const dot = Math.max(2, Math.round(track * RATIO.dot));
  return {
    bar: Math.round(dot * RATIO.barPerDot),
    dot,
    gap: Math.max(2, Math.round(track * RATIO.gap)),
    hit: Math.max(0, (Math.max(MIN_HIT, track) - dot) / 2),
    icon: Math.round(track * RATIO.icon),
    // same inset the dot leaves top and bottom
    pad: Math.round((track - dot) / 2),
    track,
  };
};

export interface StepPlayerStep {
  duration?: number;
  label?: string;
}

export type StepPlayerProps = Omit<
  ComponentProps<"div">,
  | "defaultValue"
  | "onDrag"
  | "onDragStart"
  | "onDragEnd"
  | "onAnimationStart"
  | "onAnimationEnd"
> & {
  steps?: number | StepPlayerStep[];
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  playing?: boolean;
  defaultPlaying?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  duration?: number;
  loop?: boolean;
  onComplete?: () => void;
  size?: number;
  showControl?: boolean;
  controlPosition?: "left" | "right";
  seekable?: boolean;
};

const ICON_PAINT = {
  fill: "currentColor",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 1,
} as const;

const TransportIcon = ({
  state,
  size,
  reduced,
}: {
  state: IconState;
  size: number;
  reduced: boolean;
}) => {
  const currentPath = useMotionValue(RESTING[state]);
  const leaving = useMotionValue(RESTING[state]);
  const currentOpacity = useMotionValue(1);
  const leavingOpacity = useMotionValue(0);
  const currentScale = useTransform(
    currentOpacity,
    (o) => ENTER_SCALE + (1 - ENTER_SCALE) * o
  );
  const leavingScale = useTransform(
    leavingOpacity,
    (o) => ENTER_SCALE + (1 - ENTER_SCALE) * o
  );
  const previous = useRef(state);

  useEffect(() => {
    if (previous.current === state) {
      return;
    }
    const from = previous.current;
    previous.current = state;
    currentPath.set(RESTING[state]);
    currentOpacity.set(1);
    leavingOpacity.set(0);
    if (reduced) {
      return;
    }

    if (canMorph(from, state)) {
      const morph = morphBetween(from);
      const controls = animate(0, 1, {
        ...ICON_SPRING,
        onComplete: () => currentPath.set(RESTING[state]),
        onUpdate: (t) => currentPath.set(morph(Math.min(1, Math.max(0, t)))),
      });
      return () => controls.stop();
    }

    leaving.set(RESTING[from]);
    currentOpacity.set(0);
    leavingOpacity.set(1);
    const controls = animate(0, 1, {
      ...ICON_FADE,
      onComplete: () => {
        currentOpacity.set(1);
        leavingOpacity.set(0);
      },
      onUpdate: (t) => {
        currentOpacity.set(t);
        leavingOpacity.set(1 - t);
      },
    });
    return () => controls.stop();
  }, [state, reduced, currentPath, leaving, currentOpacity, leavingOpacity]);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
    >
      <motion.g
        style={{
          opacity: leavingOpacity,
          scale: leavingScale,
          transformOrigin: "12px 12px",
        }}
      >
        <motion.path d={leaving} {...ICON_PAINT} />
      </motion.g>
      <motion.g
        style={{
          opacity: currentOpacity,
          scale: currentScale,
          transformOrigin: "12px 12px",
        }}
      >
        <motion.path d={currentPath} {...ICON_PAINT} />
      </motion.g>
    </svg>
  );
};

const StepPlayer = ({
  steps = 4,
  value,
  defaultValue = 0,
  onValueChange,
  playing,
  defaultPlaying = false,
  onPlayingChange,
  duration = 4000,
  loop = false,
  onComplete,
  size = 48,
  showControl = true,
  controlPosition = "right",
  seekable = false,
  className,
  ...props
}: StepPlayerProps) => {
  const items = useMemo<StepPlayerStep[]>(
    () =>
      typeof steps === "number"
        ? Array.from({ length: Math.max(1, steps) }, () => ({}))
        : steps,
    [steps]
  );
  const count = items.length;

  const isValueControlled = value !== undefined;
  const isPlayingControlled = playing !== undefined;
  const [indexState, setIndexState] = useState(() =>
    Math.min(Math.max(0, defaultValue), count - 1)
  );
  const [playingState, setPlayingState] = useState(defaultPlaying);
  const [finished, setFinished] = useState(false);

  const index = Math.min(isValueControlled ? value : indexState, count - 1);
  const isPlaying = isPlayingControlled ? playing : playingState;

  const shouldReduceMotion = useReducedMotion();
  const metrics = useMemo(() => metricsFor(size), [size]);
  const progress = useMotionValue(0);
  const fillWidth = useTransform(progress, (p) => `${p * 100}%`);
  const stepDuration = items[index]?.duration ?? duration;

  // a new onComplete identity would restart the running step
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const commitIndex = useCallback(
    (next: number) => {
      progress.set(0);
      setFinished(false);
      if (!isValueControlled) {
        setIndexState(next);
      }
      onValueChange?.(next);
    },
    [isValueControlled, onValueChange, progress]
  );

  const commitPlaying = useCallback(
    (next: boolean) => {
      if (!isPlayingControlled) {
        setPlayingState(next);
      }
      onPlayingChange?.(next);
    },
    [isPlayingControlled, onPlayingChange]
  );

  useEffect(() => {
    if (!isPlaying || stepDuration <= 0) {
      return;
    }
    let frame = 0;
    const start = performance.now() - progress.get() * stepDuration;
    const tick = (now: number) => {
      const elapsed = Math.min(1, (now - start) / stepDuration);
      progress.set(elapsed);
      if (elapsed < 1) {
        frame = requestAnimationFrame(tick);
        return;
      }
      if (index < count - 1) {
        commitIndex(index + 1);
        return;
      }
      onCompleteRef.current?.();
      if (loop) {
        commitIndex(0);
        return;
      }
      setFinished(true);
      commitPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [
    isPlaying,
    index,
    count,
    stepDuration,
    loop,
    commitIndex,
    commitPlaying,
    progress,
  ]);

  const handleControl = () => {
    if (finished) {
      commitIndex(0);
      commitPlaying(true);
      return;
    }
    commitPlaying(!isPlaying);
  };

  const minTrack =
    metrics.pad * 2 + metrics.bar + (count - 1) * (metrics.dot + metrics.gap);
  const iconState = iconStateFor(finished, isPlaying);
  const transition = shouldReduceMotion ? { duration: 0 } : WIDTH_SPRING;

  return (
    <div
      data-slot="step-player"
      data-playing={isPlaying || undefined}
      data-finished={finished || undefined}
      className={cn(
        "text-muted-foreground inline-flex items-center",
        controlPosition === "right" && "flex-row-reverse",
        className
      )}
      style={{ gap: metrics.gap }}
      {...props}
    >
      {showControl && (
        <motion.button
          data-slot="step-player-control"
          type="button"
          onClick={handleControl}
          aria-label={CONTROL_LABEL[iconState]}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.88 }}
          transition={shouldReduceMotion ? { duration: 0 } : TAP_SPRING}
          style={{ height: metrics.track, width: metrics.track }}
          className="focus-visible:outline-ring bg-muted flex shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-full outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <TransportIcon
            state={iconState}
            size={metrics.icon}
            reduced={!!shouldReduceMotion}
          />
        </motion.button>
      )}

      <div
        data-slot="step-player-track"
        role="group"
        aria-label={`Step ${index + 1} of ${count}`}
        style={{
          gap: metrics.gap,
          height: metrics.track,
          minWidth: minTrack,
          paddingInline: metrics.pad,
        }}
        className="bg-muted flex flex-1 items-center justify-center rounded-full"
      >
        {items.map((step, i) => {
          const state = stepStateFor(i, index);
          return (
            <motion.div
              key={i}
              data-slot="step-player-step"
              data-state={state}
              animate={{
                width: state === "active" ? metrics.bar : metrics.dot,
              }}
              whileHover={
                seekable && state !== "active" && !shouldReduceMotion
                  ? { scale: 1.35 }
                  : undefined
              }
              whileTap={
                seekable && !shouldReduceMotion ? { scale: 0.85 } : undefined
              }
              transition={transition}
              style={{ borderRadius: 999, height: metrics.dot }}
              className={cn(
                "relative shrink-0 transition-colors duration-300 motion-reduce:transition-none",
                state === "past" ? "bg-foreground" : "bg-muted-foreground",
                seekable &&
                  "has-focus-visible:outline-ring has-focus-visible:outline-2 has-focus-visible:outline-offset-4"
              )}
            >
              {state === "active" && (
                <motion.span
                  data-slot="step-player-fill"
                  style={{ borderRadius: 999, width: fillWidth }}
                  className="bg-foreground absolute inset-y-0 left-0"
                />
              )}
              {seekable && (
                <button
                  type="button"
                  aria-label={step.label ?? `Step ${i + 1}`}
                  aria-current={state === "active" ? "step" : undefined}
                  onClick={() => {
                    commitIndex(i);
                    commitPlaying(true);
                  }}
                  style={{ bottom: -metrics.hit, top: -metrics.hit }}
                  className="absolute inset-x-0 cursor-pointer touch-manipulation outline-none"
                />
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export { StepPlayer };
export default StepPlayer;
