/**
 * @license MIT
 * Flags from country-flag-icons (https://gitlab.com/catamphetamine/country-flag-icons),
 * inlined so the dashboard carries two files rather than every nation.
 */
"use client";

import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export const EnFlag = ({ className, ...props }: ComponentProps<"svg">) => (
  <svg
    aria-hidden="true"
    className={cn("h-3 w-4 shrink-0 rounded-[2px] object-cover", className)}
    viewBox="0 0 513 342"
    {...props}
  >
    <g fill="#FFF">
      <path d="M0 0h513v341.3H0V0z" />
      <path d="M311.7 230 513 341.3v-31.5L369.3 230h-57.6zM200.3 111.3 0 0v31.5l143.7 79.8h56.6z" />
    </g>
    <g fill="#012169">
      <path d="M393.8 230 513 295.7V230H393.8zm-82.1 0L513 341.3v-31.5L369.3 230h-57.6zm146.9 111.3-147-81.7v81.7h147zM90.3 230 0 280.2V230h90.3zm110 14.2v97.2H25.5l174.8-97.2zM118.2 111.3 0 45.6v65.7h118.2zm82.1 0L0 0v31.5l143.7 79.8h56.6zM53.4 0l147 81.7V0h-147zM421.7 111.3 513 61.1v50.2h-91.3zm-110-14.2V0h174.9L311.7 97.1z" />
    </g>
    <g fill="#c8102e">
      <path d="M288 0h-64v138.7H0v64h224v138.7h64V202.7h224v-64H288V0z" />
      <path d="M311.7 230 513 341.3v-31.5L369.3 230h-57.6zM143.7 230 0 309.9v31.5L200.3 230h-56.6zM200.3 111.3 0 0v31.5l143.7 79.8h56.6zM368.3 111.3 513 31.5V0L311.7 111.3h56.6z" />
    </g>
  </svg>
);

export const ThFlag = ({ className, ...props }: ComponentProps<"svg">) => (
  <svg
    aria-hidden="true"
    className={cn("h-3 w-4 shrink-0 rounded-[2px] object-cover", className)}
    viewBox="0 85.333 512 341.333"
    {...props}
  >
    <path fill="#FFF" d="M0 85.334h512V426.66H0z" />
    <path fill="#0052B4" d="M0 194.056h512v123.882H0z" />
    <g fill="#D80027">
      <path d="M0 85.334h512v54.522H0zM0 372.143h512v54.522H0z" />
    </g>
  </svg>
);
