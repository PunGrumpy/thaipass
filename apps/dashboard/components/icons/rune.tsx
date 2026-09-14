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
    <g transform="translate(0.75, 0.75) scale(0.9375)">
      <g
        transform="translate(12, 12) rotate(0) scale(1, 1) translate(-12, -12)"
        stroke="currentColor"
        fill="currentColor"
        fillOpacity="0.45"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <g>
          <path
            d="M14 17H5M14 17C14 18.6569 15.3431 20 17 20C18.6569 20 20 18.6569 20 17C20 15.3431 18.6569 14 17 14C15.3431 14 14 15.3431 14 17ZM19 7H10M10 7C10 8.65685 8.65685 10 7 10C5.34315 10 4 8.65685 4 7C4 5.34315 5.34315 4 7 4C8.65685 4 10 5.34315 10 7Z"
            stroke="currentColor"
            strokeOpacity="0.45"
          />
          <path
            d="M17 20C15.3431 20 14 18.6569 14 17C14 15.3431 15.3431 14 17 14C18.6569 14 20 15.3431 20 17C20 18.6569 18.6569 20 17 20Z"
            stroke="currentColor"
          />
          <path
            d="M7 10C8.65685 10 10 8.65685 10 7C10 5.34315 8.65685 4 7 4C5.34315 4 4 5.34315 4 7C4 8.65685 5.34315 10 7 10Z"
            stroke="currentColor"
          />
        </g>
      </g>
    </g>
  </svg>
);

export const DocsIcon = ({ className, ...props }: ComponentProps<"svg">) => (
  <svg
    aria-hidden="true"
    className={cn("size-4", className)}
    viewBox="0 0 24 24"
    {...props}
    fill="none"
  >
    <path
      d="M14 2H6C5.46957 2 4.96086 2.21072 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8M14 2C14.3166 1.99949 14.6301 2.06161 14.9225 2.18277C15.215 2.30394 15.4806 2.48176 15.704 2.706L19.292 6.294C19.5168 6.51751 19.6952 6.78335 19.8167 7.07616C19.9382 7.36898 20.0005 7.68297 20 8M14 2V7C14 7.26522 14.1054 7.51957 14.2929 7.70711C14.4804 7.89464 14.7348 8 15 8H20"
      stroke="currentColor"
      strokeOpacity="0.45"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M14 2H6C5.46957 2 4.96086 2.21072 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8M14 2C14.3166 1.99949 14.6301 2.06161 14.9225 2.18277C15.215 2.30394 15.4806 2.48176 15.704 2.706L19.292 6.294C19.5168 6.51751 19.6952 6.78335 19.8167 7.07616C19.9382 7.36898 20.0005 7.68297 20 8M14 2V7C14 7.26522 14.1054 7.51957 14.2929 7.70711C14.4804 7.89464 14.7348 8 15 8H20"
      stroke="currentColor"
      strokeOpacity="0.45"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M16 17H8"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M16 13H12H8"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10 9H8"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const LanguageIcon = ({
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
      d="M22 12C22 17.5228 17.5228 22 12 22M22 12C22 6.47715 17.5228 2 12 2M22 12H2M12 22C6.47715 22 2 17.5228 2 12M12 22C9.43223 19.3038 8 15.7233 8 12C8 8.27674 9.43223 4.69615 12 2M12 22C14.5678 19.3038 16 15.7233 16 12C16 8.27674 14.5678 4.69615 12 2M12 2C6.47715 2 2 6.47715 2 12"
      stroke="currentColor"
      strokeOpacity="0.45"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const SunIcon = ({ className, ...props }: ComponentProps<"svg">) => (
  <svg
    aria-hidden="true"
    className={cn("size-4", className)}
    viewBox="0 0 24 24"
    {...props}
    fill="none"
  >
    <g transform="translate(0.75, 0.75) scale(0.9375)">
      <g
        transform="translate(12, 12) rotate(0) scale(1, 1) translate(-12, -12)"
        stroke="currentColor"
        strokeOpacity="0.45"
        fill="currentColor"
        fillOpacity="0.45"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <g>
          <path
            d="M12 2V4M12 20V22M4.93005 4.93018L6.34005 6.34018M17.66 17.6602L19.07 19.0702M2 12H4M20 12H22M6.34005 17.6602L4.93005 19.0702M19.07 4.93018L17.66 6.34018"
            stroke="currentColor"
          />
          <path
            d="M12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16Z"
            fill="currentColor"
            fillOpacity="0.45"
            stroke="currentColor"
          />
        </g>
      </g>
    </g>
  </svg>
);

export const MoonIcon = ({ className, ...props }: ComponentProps<"svg">) => (
  <svg
    aria-hidden="true"
    className={cn("size-4", className)}
    viewBox="0 0 24 24"
    {...props}
    fill="none"
  >
    <path
      d="M20.985 12.4864C20.8912 14.2225 20.2966 15.8944 19.273 17.2998C18.2494 18.7052 16.8406 19.7841 15.217 20.4059C13.5933 21.0278 11.8243 21.166 10.1237 20.8039C8.42318 20.4418 6.86392 19.5949 5.63442 18.3655C4.40493 17.1362 3.55785 15.577 3.19558 13.8765C2.83331 12.176 2.97136 10.4069 3.59304 8.78322C4.21472 7.15949 5.29342 5.75059 6.69874 4.72684C8.10406 3.70308 9.77583 3.10831 11.512 3.0144C11.917 2.9924 12.129 3.4744 11.914 3.8174C11.1949 4.96796 10.8869 6.32827 11.0405 7.67635C11.194 9.02443 11.7999 10.2807 12.7593 11.24C13.7187 12.1994 14.9749 12.8054 16.323 12.9589C17.6711 13.1124 19.0314 12.8045 20.182 12.0854C20.526 11.8704 21.007 12.0814 20.985 12.4864Z"
      fill="currentColor"
      fillOpacity="0.45"
    />
  </svg>
);

export const SystemIcon = ({ className, ...props }: ComponentProps<"svg">) => (
  <svg
    aria-hidden="true"
    className={cn("size-4", className)}
    viewBox="0 0 24 24"
    {...props}
    fill="none"
  >
    <g transform="translate(0.75, 0.75) scale(0.9375)">
      <g
        transform="translate(12, 12) rotate(0) scale(1, 1) translate(-12, -12)"
        stroke="currentColor"
        strokeOpacity="0.45"
        fill="currentColor"
        fillOpacity="0.45"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <g>
          <path
            d="M20.054 15.9871H3.94604H20.054ZM18 5C18.5305 5 19.0392 5.21071 19.4142 5.58579C19.7893 5.96086 20 6.46957 20 7V15.526C19.9999 15.8374 20.0725 16.1446 20.212 16.423L21.28 18.55C21.3571 18.703 21.3936 18.8732 21.386 19.0444C21.3784 19.2155 21.327 19.3818 21.2366 19.5274C21.1463 19.6729 21.0201 19.7928 20.8701 19.8756C20.7201 19.9584 20.5513 20.0012 20.38 20H3.62002C3.44871 20.0012 3.27997 19.9584 3.12997 19.8756C2.97997 19.7928 2.85374 19.6729 2.7634 19.5274C2.67305 19.3818 2.62162 19.2155 2.61402 19.0444C2.60643 18.8732 2.64293 18.703 2.72002 18.55L3.78802 16.423C3.92756 16.1446 4.00016 15.8374 4.00002 15.526V7C4.00002 6.46957 4.21073 5.96086 4.58581 5.58579C4.96088 5.21071 5.46959 5 6.00002 5H18Z"
            fill="currentColor"
            fillOpacity="0.45"
          />
          <path
            d="M20.054 15.9871H3.94604M18 5C18.5305 5 19.0392 5.21071 19.4142 5.58579C19.7893 5.96086 20 6.46957 20 7V15.526C19.9999 15.8374 20.0725 16.1446 20.212 16.423L21.28 18.55C21.3571 18.703 21.3936 18.8732 21.386 19.0444C21.3784 19.2155 21.327 19.3818 21.2366 19.5274C21.1463 19.6729 21.0201 19.7928 20.8701 19.8756C20.7201 19.9584 20.5513 20.0012 20.38 20H3.62002C3.44871 20.0012 3.27997 19.9584 3.12997 19.8756C2.97997 19.7928 2.85374 19.6729 2.7634 19.5274C2.67305 19.3818 2.62162 19.2155 2.61402 19.0444C2.60643 18.8732 2.64293 18.703 2.72002 18.55L3.78802 16.423C3.92756 16.1446 4.00016 15.8374 4.00002 15.526V7C4.00002 6.46957 4.21073 5.96086 4.58581 5.58579C4.96088 5.21071 5.46959 5 6.00002 5H18Z"
            stroke="currentColor"
          />
        </g>
      </g>
    </g>
  </svg>
);

export const ExternalLinkIcon = ({
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
      d="M7 7H17V17M17 7L7 17"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M17 17V7H7"
      stroke="currentColor"
      strokeOpacity="0.45"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const PasteIcon = ({ className, ...props }: ComponentProps<"svg">) => (
  <svg
    aria-hidden="true"
    className={cn("size-4", className)}
    viewBox="0 0 24 24"
    {...props}
    fill="none"
  >
    <g transform="translate(0.75, 0.75) scale(0.9375)">
      <g
        transform="translate(12, 12) rotate(0) scale(1, 1) translate(-12, -12)"
        stroke="currentColor"
        fill="currentColor"
        fillOpacity="0.45"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <g>
          <path
            d="M10 8H20C21.1046 8 22 8.89543 22 10V20C22 21.1046 21.1046 22 20 22H10C8.89543 22 8 21.1046 8 20V10C8 8.89543 8.89543 8 10 8Z"
            stroke="currentColor"
          />
          <path
            d="M4 16C2.9 16 2 15.1 2 14V4C2 2.9 2.9 2 4 2H14C15.1 2 16 2.9 16 4"
            stroke="currentColor"
            strokeOpacity="0.45"
          />
        </g>
      </g>
    </g>
  </svg>
);

export const TestIcon = ({ className, ...props }: ComponentProps<"svg">) => (
  <svg
    aria-hidden="true"
    className={cn("size-4", className)}
    viewBox="0 0 24 24"
    {...props}
    fill="none"
  >
    <path
      d="M3.99999 13.9996C3.81076 14.0003 3.62522 13.9472 3.46495 13.8466C3.30467 13.746 3.17623 13.602 3.09454 13.4313C3.01286 13.2606 2.98129 13.0702 3.00349 12.8823C3.0257 12.6944 3.10077 12.5166 3.21999 12.3696L13.12 2.16968C13.1943 2.08396 13.2955 2.02604 13.407 2.00541C13.5185 1.98479 13.6337 2.00269 13.7337 2.05618C13.8337 2.10968 13.9126 2.19558 13.9573 2.29979C14.0021 2.404 14.0101 2.52033 13.98 2.62968L12.06 8.64968C12.0034 8.8012 11.9844 8.9642 12.0046 9.12469C12.0248 9.28517 12.0837 9.43836 12.1761 9.57111C12.2685 9.70385 12.3918 9.8122 12.5353 9.88684C12.6788 9.96149 12.8382 10.0002 13 9.99964H20C20.1892 9.99904 20.3748 10.0521 20.535 10.1527C20.6953 10.2533 20.8238 10.3973 20.9054 10.568C20.9871 10.7387 21.0187 10.9291 20.9965 11.117C20.9743 11.3049 20.8992 11.4827 20.78 11.6296L10.88 21.8296C10.8057 21.9154 10.7045 21.9733 10.593 21.9939C10.4815 22.0145 10.3663 21.9966 10.2663 21.9431C10.1663 21.8896 10.0874 21.8037 10.0427 21.6995C9.99791 21.5953 9.98991 21.479 10.02 21.3696L11.94 15.3496C11.9966 15.1981 12.0156 15.0351 11.9954 14.8746C11.9752 14.7141 11.9163 14.561 11.8239 14.4282C11.7315 14.2955 11.6082 14.1871 11.4647 14.1125C11.3212 14.0378 11.1617 13.9991 11 13.9996H3.99999Z"
      fill="currentColor"
      fillOpacity="0.45"
    />
  </svg>
);

export const VerifiedIcon = ({
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
      d="M20 12.9995C20 17.9995 16.5 20.4995 12.34 21.9495C12.1222 22.0233 11.8855 22.0197 11.67 21.9395C7.5 20.4995 4 17.9995 4 12.9995V5.99947C4 5.73425 4.10536 5.4799 4.29289 5.29236C4.48043 5.10483 4.73478 4.99947 5 4.99947C7 4.99947 9.5 3.79947 11.24 2.27947C11.4519 2.09847 11.7214 1.99902 12 1.99902C12.2786 1.99902 12.5481 2.09847 12.76 2.27947C14.51 3.80947 17 4.99947 19 4.99947C19.2652 4.99947 19.5196 5.10483 19.7071 5.29236C19.8946 5.4799 20 5.73425 20 5.99947V12.9995Z"
      fill="currentColor"
      fillOpacity="0.45"
    />
    <path
      d="M9 12L11 14L15 10"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const PlayIcon = ({ className, ...props }: ComponentProps<"svg">) => (
  <svg
    aria-hidden="true"
    className={cn("size-4", className)}
    viewBox="0 0 24 24"
    {...props}
    fill="none"
  >
    <path
      d="M5 4.99961C4.9999 4.6477 5.09265 4.30201 5.26888 3.99741C5.44512 3.69282 5.69861 3.44011 6.00375 3.26482C6.30889 3.08952 6.65488 2.99784 7.00679 2.99903C7.3587 3.00023 7.70406 3.09426 8.008 3.27162L20.005 10.2696C20.3078 10.4453 20.5591 10.6973 20.7339 11.0006C20.9088 11.3038 21.0009 11.6477 21.0012 11.9977C21.0015 12.3478 20.91 12.6918 20.7357 12.9953C20.5614 13.2989 20.3105 13.5514 20.008 13.7276L8.008 20.7276C7.70406 20.9049 7.3587 20.999 7.00679 21.0002C6.65488 21.0014 6.30889 20.9097 6.00375 20.7344C5.69861 20.5591 5.44512 20.3064 5.26888 20.0018C5.09265 19.6972 4.9999 19.3515 5 18.9996V4.99961Z"
      fill="currentColor"
      fillOpacity="0.45"
    />
  </svg>
);

export const StopIcon = ({ className, ...props }: ComponentProps<"svg">) => (
  <svg
    aria-hidden="true"
    className={cn("size-4", className)}
    viewBox="0 0 24 24"
    {...props}
    fill="none"
  >
    <g transform="translate(0.75, 0.75) scale(0.9375)">
      <g
        transform="translate(12, 12) rotate(0) scale(1, 1) translate(-12, -12)"
        stroke="currentColor"
        fill="currentColor"
        fillOpacity="0.45"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <g>
          <path
            d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
            stroke="currentColor"
            strokeOpacity="0.45"
          />
          <path
            d="M14 9H10C9.44772 9 9 9.44772 9 10V14C9 14.5523 9.44772 15 10 15H14C14.5523 15 15 14.5523 15 14V10C15 9.44772 14.5523 9 14 9Z"
            stroke="currentColor"
          />
        </g>
      </g>
    </g>
  </svg>
);

export const ResumeIcon = ({ className, ...props }: ComponentProps<"svg">) => (
  <svg
    aria-hidden="true"
    className={cn("size-4", className)}
    viewBox="0 0 24 24"
    {...props}
    fill="none"
  >
    <path
      d="M6.029 4.28502C5.72551 4.10292 5.37913 4.00462 5.02523 4.00016C4.67133 3.99569 4.32259 4.08522 4.0146 4.2596C3.70661 4.43398 3.45041 4.68697 3.27216 4.99274C3.09391 5.2985 3 5.64609 3 6.00002V18C3 18.3539 3.09391 18.7015 3.27216 19.0073C3.45041 19.3131 3.70661 19.5661 4.0146 19.7404C4.32259 19.9148 4.67133 20.0043 5.02523 19.9999C5.37913 19.9954 5.72551 19.8971 6.029 19.715L16.026 13.717C16.3228 13.5397 16.5685 13.2885 16.7393 12.9879C16.91 12.6873 16.9999 12.3476 17.0002 12.0019C17.0005 11.6562 16.9112 11.3163 16.741 11.0154C16.5708 10.7145 16.3255 10.4628 16.029 10.285L6.029 4.28502Z"
      fill="currentColor"
      fillOpacity="0.45"
    />
    <path
      d="M21 4V20"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const ChevronDownIcon = ({
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
      d="M6 9L12 15L18 9"
      stroke="currentColor"
      strokeOpacity="0.45"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const ResetIcon = ({ className, ...props }: ComponentProps<"svg">) => (
  <svg
    aria-hidden="true"
    className={cn("size-4", className)}
    viewBox="0 0 24 24"
    {...props}
    fill="none"
  >
    <path
      d="M3 12C3 13.78 3.52784 15.5201 4.51677 17.0001C5.50571 18.4802 6.91131 19.6337 8.55585 20.3149C10.2004 20.9961 12.01 21.1743 13.7558 20.8271C15.5016 20.4798 17.1053 19.6226 18.364 18.364C19.6226 17.1053 20.4798 15.5016 20.8271 13.7558C21.1743 12.01 20.9961 10.2004 20.3149 8.55585C19.6337 6.91131 18.4802 5.50571 17.0001 4.51677C15.5201 3.52784 13.78 3 12 3C9.48395 3.00947 7.06897 3.99122 5.26 5.74L3 8M3 3V8H8"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M8 8H3V3"
      stroke="currentColor"
      strokeOpacity="0.45"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const WarningIcon = ({ className, ...props }: ComponentProps<"svg">) => (
  <svg
    aria-hidden="true"
    className={cn("size-4", className)}
    viewBox="0 0 24 24"
    {...props}
    fill="none"
  >
    <path
      d="M21.7301 18.0002L13.7301 4.00022C13.5556 3.69243 13.3027 3.43641 12.997 3.25829C12.6913 3.08017 12.3438 2.98633 11.9901 2.98633C11.6363 2.98633 11.2888 3.08017 10.9831 3.25829C10.6774 3.43641 10.4245 3.69243 10.2501 4.00022L2.25005 18.0002C2.07373 18.3056 1.98128 18.6521 1.98206 19.0047C1.98284 19.3573 2.07683 19.7035 2.2545 20.008C2.43217 20.3126 2.6872 20.5648 2.99375 20.7391C3.30029 20.9133 3.64746 21.0034 4.00005 21.0002H20.0001C20.351 20.9999 20.6956 20.9072 20.9993 20.7315C21.3031 20.5558 21.5553 20.3033 21.7306 19.9993C21.9059 19.6954 21.9981 19.3506 21.998 18.9997C21.9979 18.6488 21.9055 18.3041 21.7301 18.0002Z"
      fill="currentColor"
      fillOpacity="0.45"
    />
    <path
      d="M12 9V13M12 17H12.01"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const SignedInIcon = ({
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
      d="M15 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H15"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10 17L15 12L10 7M15 12H3"
      stroke="currentColor"
      strokeOpacity="0.45"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const SendIcon = ({ className, ...props }: ComponentProps<"svg">) => (
  <svg
    aria-hidden="true"
    className={cn("size-4", className)}
    viewBox="0 0 24 24"
    {...props}
    fill="none"
  >
    <path
      d="M10.9136 13.0848C10.7225 12.894 10.4947 12.7439 10.2441 12.6436L2.31405 9.46357C2.21937 9.42557 2.13857 9.35953 2.08251 9.27429C2.02644 9.18906 1.9978 9.08871 2.00041 8.98673C2.00302 8.88474 2.03677 8.78599 2.09712 8.70374C2.15747 8.62148 2.24155 8.55966 2.33805 8.52657L11.838 5.27657L21.338 2.02657C21.4267 1.99456 21.5225 1.98845 21.6145 2.00896C21.7064 2.02946 21.7907 2.07573 21.8573 2.14234C21.9239 2.20896 21.9702 2.29317 21.9907 2.38512C22.0112 2.47707 22.0051 2.57296 21.973 2.66157L15.473 21.6616C15.44 21.7581 15.3781 21.8421 15.2959 21.9025C15.2136 21.9628 15.1149 21.9966 15.0129 21.9992C14.9109 22.0018 14.8106 21.9732 14.7253 21.9171C14.6401 21.861 14.574 21.7802 14.536 21.6856L11.356 13.7536C11.2552 13.5031 11.1047 13.2756 10.9136 13.0848ZM10.9136 13.0848L21.8541 2.14648Z"
      fill="currentColor"
    />
    <path
      d="M10.9136 13.0848C10.7225 12.894 10.4947 12.7439 10.2441 12.6436L2.31405 9.46357C2.21937 9.42557 2.13857 9.35953 2.08251 9.27429C2.02644 9.18906 1.9978 9.08871 2.00041 8.98673C2.00302 8.88474 2.03677 8.78599 2.09712 8.70374C2.15747 8.62148 2.24155 8.55966 2.33805 8.52657L11.838 5.27657L21.338 2.02657C21.4267 1.99456 21.5225 1.98845 21.6145 2.00896C21.7064 2.02946 21.7907 2.07573 21.8573 2.14234C21.9239 2.20896 21.9702 2.29317 21.9907 2.38512C22.0112 2.47707 22.0051 2.57296 21.973 2.66157L15.473 21.6616C15.44 21.7581 15.3781 21.8421 15.2959 21.9025C15.2136 21.9628 15.1149 21.9966 15.0129 21.9992C14.9109 22.0018 14.8106 21.9732 14.7253 21.9171C14.6401 21.861 14.574 21.7802 14.536 21.6856L11.356 13.7536C11.2552 13.5031 11.1047 13.2756 10.9136 13.0848ZM10.9136 13.0848L21.8541 2.14648"
      stroke="currentColor"
      strokeOpacity="0.45"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M20.5712 2.47461L2.396 8.89502L10.9862 12.7831L20.5712 2.47461Z"
      fill="currentColor"
      fillOpacity="0.45"
    />
  </svg>
);

export const TuneIcon = ({ className, ...props }: ComponentProps<"svg">) => (
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

export const BreakdownIcon = ({
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
      d="M3 3V19C3 19.5304 3.21071 20.0391 3.58579 20.4142C3.96086 20.7893 4.46957 21 5 21H21"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7 16H15M7 11H19M7 6H10"
      stroke="currentColor"
      strokeOpacity="0.45"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
