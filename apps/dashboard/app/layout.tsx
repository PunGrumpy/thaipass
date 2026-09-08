import "./globals.css";
import { LucideProvider } from "lucide-react";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { fonts } from "@/lib/fonts";

export const metadata: Metadata = {
  description:
    "Control center for the THAIpass gateway: health, quota, model catalog, client configuration, and a streaming playground.",
  title: {
    default: "TH, AI Passport",
    template: "%s ✦ AI Passport",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { color: "#fdfdfd", media: "(prefers-color-scheme: light)" },
    { color: "#1c1c1f", media: "(prefers-color-scheme: dark)" },
  ],
};

const RootLayout = ({ children }: { readonly children: ReactNode }) => (
  <html
    className={fonts}
    lang="en"
    data-scroll-behavior="smooth"
    suppressHydrationWarning
  >
    <body>
      <ThemeProvider>
        <LucideProvider strokeWidth={1.5}>
          <TooltipProvider delay={250}>{children}</TooltipProvider>
        </LucideProvider>
        <Toaster position="bottom-right" />
      </ThemeProvider>
    </body>
  </html>
);

export default RootLayout;
