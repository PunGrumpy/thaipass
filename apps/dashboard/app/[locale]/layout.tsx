import "../globals.css";
import {
  DEFAULT_LOCALE,
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

export const generateMetadata = async ({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> => {
  const { locale } = await params;
  const dictionary = getDictionary(isLocale(locale) ? locale : DEFAULT_LOCALE);

  return {
    description: dictionary.brand.tagline,
    title: {
      default: dictionary.brand.name,
      template: dictionary.brand.titleTemplate,
    },
  };
};

export const viewport: Viewport = {
  themeColor: [
    { color: "#fdfdfe", media: "(prefers-color-scheme: light)" },
    { color: "#0c0c0e", media: "(prefers-color-scheme: dark)" },
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
              <TooltipProvider delay={500}>{children}</TooltipProvider>
            </LucideProvider>
            <Toaster position="bottom-right" />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
};

export default RootLayout;
