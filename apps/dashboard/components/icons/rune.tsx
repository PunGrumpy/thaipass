/**
 * @license Apache-2.0
 * Duotone icons from Rune Icons (https://github.com/Nexvyn/runeicons),
 * inlined because the React package is unpublished. The two fixed greys the
 * set ships are remapped onto currentColor so they follow the theme.
 */
"use client";

import type { ComponentProps } from "react";
import { useId } from "react";

import { cn } from "@/lib/utils";

export const OverviewIcon = ({
  className,
  ...props
}: ComponentProps<"svg">) => (
  <svg
    aria-hidden="true"
    className={cn("size-4", className)}
    viewBox="0 0 24 24"
    {...props}
    fill="none"
  >
    <path
      d="M20 3H15C14.4477 3 14 3.44772 14 4V9C14 9.55228 14.4477 10 15 10H20C20.5523 10 21 9.55228 21 9V4C21 3.44772 20.5523 3 20 3Z"
      fill="currentColor"
      fillOpacity="0.45"
    />
    <path
      d="M20 14H15C14.4477 14 14 14.4477 14 15V20C14 20.5523 14.4477 21 15 21H20C20.5523 21 21 20.5523 21 20V15C21 14.4477 20.5523 14 20 14Z"
      fill="currentColor"
    />
    <path
      d="M9 14H4C3.44772 14 3 14.4477 3 15V20C3 20.5523 3.44772 21 4 21H9C9.55228 21 10 20.5523 10 20V15C10 14.4477 9.55228 14 9 14Z"
      fill="currentColor"
      fillOpacity="0.45"
    />
  </svg>
);

export const PlaygroundIcon = ({
  className,
  ...props
}: ComponentProps<"svg">) => (
  <svg
    aria-hidden="true"
    className={cn("size-4", className)}
    viewBox="0 0 24 24"
    {...props}
    fill="none"
  >
    <path
      d="M4 17L10 11L4 5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 17H20"
      stroke="currentColor"
      strokeOpacity="0.45"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const ModelsIcon = ({ className, ...props }: ComponentProps<"svg">) => {
  const uid = useId();

  return (
    <svg
      aria-hidden="true"
      className={cn("size-4", className)}
      viewBox="0 0 24 24"
      {...props}
      fill="none"
    >
      <g clipPath={`url(#${uid}-0)`}>
        <mask
          id={`${uid}-1`}
          style={{ maskType: "luminance" }}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="24"
          height="24"
        >
          <path d="M24 0H0V24H24V0Z" fill="white" />
        </mask>
        <g mask={`url(#${uid}-1)`}>
          <path
            d="M13 13.7401C12.696 13.9156 12.3511 14.008 12 14.008C11.6489 14.008 11.304 13.9156 11 13.7401L2.49999 8.87014C2.34609 8.78292 2.21808 8.65644 2.12902 8.5036C2.03997 8.35076 1.99304 8.17704 1.99304 8.00014C1.99304 7.82325 2.03997 7.64952 2.12902 7.49668C2.21808 7.34384 2.34609 7.21736 2.49999 7.13014L11 2.26014C11.304 2.08461 11.6489 1.99219 12 1.99219C12.3511 1.99219 12.696 2.08461 13 2.26014L21.5 7.13014C21.6539 7.21736 21.7819 7.34384 21.871 7.49668C21.96 7.64952 22.0069 7.82325 22.0069 8.00014C22.0069 8.17704 21.96 8.35076 21.871 8.5036C21.7819 8.65644 21.6539 8.78292 21.5 8.87014L13 13.7401Z"
            stroke="currentColor"
            strokeOpacity="0.45"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <path
          d="M21.5 13.1299C21.6539 13.2171 21.7819 13.3436 21.871 13.4965C21.96 13.6493 22.0069 13.823 22.0069 13.9999C22.0069 14.1768 21.96 14.3505 21.871 14.5034C21.7819 14.6562 21.6539 14.7827 21.5 14.8699L13 19.7399C12.696 19.9154 12.3511 20.0079 12 20.0079C11.6489 20.0079 11.304 19.9154 11 19.7399L2.49999 14.8699C2.34609 14.7827 2.21808 14.6562 2.12902 14.5034C2.03997 14.3505 1.99304 14.1768 1.99304 13.9999C1.99304 13.823 2.03997 13.6493 2.12902 13.4965C2.21808 13.3436 2.34609 13.2171 2.49999 13.1299"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <defs>
        <clipPath id={`${uid}-0`}>
          <rect width="24" height="24" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
};

export const LearningIcon = ({
  className,
  ...props
}: ComponentProps<"svg">) => (
  <svg
    aria-hidden="true"
    className={cn("size-4", className)}
    viewBox="0 0 24 24"
    {...props}
    fill="none"
  >
    <path
      d="M16 7H22V13M22 7L13.5 15.5L8.5 10.5L2 17"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M22 13V7H16"
      stroke="currentColor"
      strokeOpacity="0.45"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const IntegrationsIcon = ({
  className,
  ...props
}: ComponentProps<"svg">) => (
  <svg
    aria-hidden="true"
    className={cn("size-4", className)}
    viewBox="0 0 24 24"
    {...props}
    fill="none"
  >
    <path
      d="M14 11.0002C13.5705 10.4261 13.0226 9.95104 12.3934 9.60728C11.7642 9.26352 11.0684 9.0591 10.3533 9.00789C9.63816 8.95667 8.92037 9.05985 8.24861 9.31044C7.57685 9.56103 6.96684 9.95315 6.45996 10.4602L3.45996 13.4602C2.54917 14.4032 2.04519 15.6662 2.05659 16.9772C2.06798 18.2882 2.59382 19.5422 3.52086 20.4693C4.4479 21.3963 5.70197 21.9222 7.01295 21.9336C8.32393 21.9449 9.58693 21.441 10.53 20.5302L12.24 18.8202"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10 13C10.4295 13.5741 10.9774 14.0491 11.6066 14.3929C12.2357 14.7367 12.9315 14.9411 13.6467 14.9923C14.3618 15.0435 15.0796 14.9403 15.7513 14.6897C16.4231 14.4392 17.0331 14.047 17.54 13.54L20.54 10.54C21.4508 9.59695 21.9548 8.33394 21.9434 7.02296C21.932 5.71198 21.4061 4.45791 20.4791 3.53087C19.5521 2.60383 18.298 2.07799 16.987 2.0666C15.676 2.0552 14.413 2.55918 13.47 3.46997L11.75 5.17997"
      stroke="currentColor"
      strokeOpacity="0.45"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const SettingsIcon = ({
  className,
  ...props
}: ComponentProps<"svg">) => (
  <svg
    aria-hidden="true"
    className={cn("size-4", className)}
    viewBox="0 0 24 24"
    {...props}
    fill="none"
  >
    <path
      d="M9.67106 4.13615C9.72616 3.55649 9.99539 3.0182 10.4262 2.62643C10.8569 2.23467 11.4183 2.01758 12.0006 2.01758C12.5828 2.01758 13.1442 2.23467 13.575 2.62643C14.0057 3.0182 14.275 3.55649 14.3301 4.13615C14.3632 4.51061 14.486 4.87157 14.6882 5.18849C14.8904 5.50541 15.1659 5.76896 15.4915 5.95683C15.8171 6.1447 16.1832 6.25135 16.5588 6.26777C16.9343 6.28419 17.3083 6.20989 17.6491 6.05115C18.1782 5.81093 18.7777 5.77617 19.3311 5.95364C19.8844 6.1311 20.3519 6.5081 20.6426 7.01126C20.9333 7.51441 21.0263 8.10772 20.9037 8.67572C20.7811 9.24372 20.4515 9.74577 19.9791 10.0842C19.6714 10.3 19.4203 10.5868 19.247 10.9202C19.0736 11.2536 18.9831 11.6239 18.9831 11.9997C18.9831 12.3754 19.0736 12.7457 19.247 13.0791C19.4203 13.4125 19.6714 13.6993 19.9791 13.9152C20.4515 14.2535 20.7811 14.7556 20.9037 15.3236C21.0263 15.8916 20.9333 16.4849 20.6426 16.988C20.3519 17.4912 19.8844 17.8682 19.3311 18.0457C18.7777 18.2231 18.1782 18.1884 17.6491 17.9482C17.3083 17.7894 16.9343 17.7151 16.5588 17.7315C16.1832 17.7479 15.8171 17.8546 15.4915 18.0425C15.1659 18.2303 14.8904 18.4939 14.6882 18.8108C14.486 19.1277 14.3632 19.4887 14.3301 19.8632C14.275 20.4428 14.0057 20.9811 13.575 21.3729C13.1442 21.7646 12.5828 21.9817 12.0006 21.9817C11.4183 21.9817 10.8569 21.7646 10.4262 21.3729C9.99539 20.9811 9.72616 20.4428 9.67106 19.8632C9.638 19.4886 9.51516 19.1275 9.31293 18.8104C9.11069 18.4934 8.83503 18.2298 8.50929 18.0419C8.18355 17.854 7.81733 17.7474 7.44164 17.7311C7.06595 17.7147 6.69186 17.7892 6.35106 17.9482C5.82195 18.1884 5.22239 18.2231 4.66906 18.0457C4.11573 17.8682 3.64823 17.4912 3.35754 16.988C3.06685 16.4849 2.97377 15.8916 3.09642 15.3236C3.21907 14.7556 3.54866 14.2535 4.02106 13.9152C4.32868 13.6993 4.57979 13.4125 4.75315 13.0791C4.92651 12.7457 5.01701 12.3754 5.01701 11.9997C5.01701 11.6239 4.92651 11.2536 4.75315 10.9202C4.57979 10.5868 4.32868 10.3 4.02106 10.0842C3.54932 9.7456 3.22031 9.24375 3.09796 8.67613C2.97561 8.10852 3.06867 7.51569 3.35904 7.01286C3.64942 6.51004 4.11637 6.13313 4.66915 5.95539C5.22193 5.77766 5.82104 5.81179 6.35006 6.05115C6.69082 6.20989 7.0648 6.28419 7.44036 6.26777C7.81592 6.25135 8.18199 6.1447 8.5076 5.95683C8.8332 5.76896 9.10875 5.50541 9.31093 5.18849C9.5131 4.87157 9.63594 4.51061 9.66906 4.13615"
      fill="currentColor"
      fillOpacity="0.45"
    />
  </svg>
);
