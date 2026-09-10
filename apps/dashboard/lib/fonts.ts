import {
  Geist_Mono as createMono,
  IBM_Plex_Sans_Thai as createSans,
} from "next/font/google";

import { cn } from "./utils";

const sans = createSans({
  display: "swap",
  subsets: ["thai", "latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700"],
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
