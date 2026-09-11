import {
  Geist_Mono as createMono,
  Noto_Sans_Thai as createSans,
} from "next/font/google";

import { cn } from "./utils";

const sans = createSans({
  display: "swap",
  subsets: ["latin", "thai"],
  variable: "--font-sans",
  weight: "variable",
});

const mono = createMono({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-mono",
  weight: "variable",
});

export const fonts = cn(
  "touch-manipulation font-sans antialiased [font-synthesis-weight:none]",
  sans.variable,
  mono.variable
);
