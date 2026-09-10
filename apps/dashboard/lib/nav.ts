import {
  Boxes,
  GraduationCap,
  LayoutDashboard,
  Plug,
  Settings2,
  TerminalSquare,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  description: string;
  href: string;
  icon: LucideIcon;
  title: string;
}

export interface NavSection {
  items: readonly NavItem[];
  label: string;
}

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    items: [
      {
        description: "Gateway health, quota, and catalog at a glance",
        href: "/",
        icon: LayoutDashboard,
        title: "Overview",
      },
      {
        description: "Stream a prompt through the proxy and time it",
        href: "/playground",
        icon: TerminalSquare,
        title: "Playground",
      },
      {
        description: "Every model your session can reach",
        href: "/models",
        icon: Boxes,
        title: "Models",
      },
      {
        description: "EXP the LMS has recorded, and the runs that earn more",
        href: "/learning",
        icon: GraduationCap,
        title: "Learning",
      },
    ],
    label: "Gateway",
  },
  {
    items: [
      {
        description: "Drop-in config for Claude Code, Cursor, SDKs, and cURL",
        href: "/integrations",
        icon: Plug,
        title: "Integrations",
      },
      {
        description: "Proxy origin, session cookie, and appearance",
        href: "/settings",
        icon: Settings2,
        title: "Settings",
      },
    ],
    label: "Configure",
  },
];

export const NAV_ITEMS: readonly NavItem[] = NAV_SECTIONS.flatMap(
  (section) => section.items
);

export const GITHUB_URL = "https://github.com/PunGrumpy/thaipass";
