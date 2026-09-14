"use client";

import { useReducedMotion } from "motion/react";
import type { ComponentProps } from "react";
import { useEffect, useId, useRef } from "react";

import { EYE_H, EYE_W, placeEyes, REST_GAZE } from "@/lib/mascot";
import { cn } from "@/lib/utils";

const R = 22;
const CX = 30;
const CY = 34;
const D = R * 2;

const eyeTransform = (eye: ReturnType<typeof placeEyes>[number]): string =>
  `translate(${CX + eye.x} ${CY + eye.y}) rotate(${eye.tilt}) scale(${eye.squeeze} 1)`;

export const Mascot = ({ className, ...props }: ComponentProps<"svg">) => {
  const uid = useId();
  const still = useReducedMotion();
  const eyes = useRef<(SVGGElement | null)[]>([null, null]);

  useEffect(() => {
    if (still) {
      return;
    }
    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const t = (now - start) / 1000;
      // Two slow waves per axis, on periods that do not divide into each other,
      // so the gaze wanders instead of tracing the same loop.
      const placed = placeEyes(
        {
          pitch:
            REST_GAZE.pitch + Math.cos(t * 0.29) * 7 + Math.cos(t * 0.13) * 4,
          roll: REST_GAZE.roll,
          yaw: REST_GAZE.yaw + Math.sin(t * 0.37) * 13 + Math.sin(t * 0.19) * 6,
        },
        R
      );
      for (const [i, node] of eyes.current.entries()) {
        const eye = placed[i];
        if (node && eye) {
          node.setAttribute("transform", eyeTransform(eye));
        }
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [still]);

  const rest = placeEyes(REST_GAZE, R);

  return (
    <svg
      aria-hidden="true"
      className={cn("size-16", className)}
      fill="none"
      viewBox="0 0 64 64"
      {...props}
    >
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={uid}
          x1="10"
          x2="50"
          y1="12"
          y2="52"
        >
          <stop stopColor="var(--brand-from)" />
          <stop offset="1" stopColor="var(--brand-to)" />
        </linearGradient>
      </defs>

      <circle
        cx={CX}
        cy={CY}
        data-slot="mascot-body"
        fill={`url(#${uid})`}
        r={R}
      />

      {rest.map((eye, i) => (
        <g
          key={eye.x}
          ref={(node) => {
            eyes.current[i] = node;
          }}
          transform={eyeTransform(eye)}
        >
          <rect
            className="fill-background"
            data-slot="mascot-eye"
            height={EYE_H * D}
            rx={(EYE_W * D) / 2}
            width={EYE_W * D}
            x={(-EYE_W * D) / 2}
            y={(-EYE_H * D) / 2}
          />
        </g>
      ))}

      <path
        className="fill-brand"
        d="M54 2c.32 4.1 1.71 6.08 4.45 7.6-2.74 1.5-4.13 3.48-4.45 7.58-.32-4.1-1.71-6.08-4.45-7.59C52.29 8.08 53.68 6.1 54 2Z"
      />
    </svg>
  );
};
