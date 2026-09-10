import "../globals.css";
import {
  getDictionary,
  I18nProvider,
  isLocale,
  LOCALES,
} from "@thaipass/internationalization";
import { LucideProvider } from "lucide-react";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
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

export const generateStaticParams = () => LOCALES.map((locale) => ({ locale }));

interface RootLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

const RootLayout = async ({ children, params }: RootLayoutProps) => {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const dictionary = getDictionary(locale);

  return (
    <html
      className={fonts}
      data-scroll-behavior="smooth"
      lang={locale}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>
          <I18nProvider dictionary={dictionary} locale={locale}>
            <LucideProvider strokeWidth={1.5}>
              <TooltipProvider delay={250}>{children}</TooltipProvider>
            </LucideProvider>
            <Toaster position="bottom-right" />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
};

export default RootLayout;
