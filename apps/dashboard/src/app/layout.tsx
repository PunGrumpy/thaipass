import "./globals.css";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  description:
    "Personal AI Pass proxy gateway, client config generator, and model playground",
  title: "thaipass dashboard",
};

interface RootLayoutProps {
  readonly children: ReactNode;
}

const RootLayout = ({ children }: RootLayoutProps) => (
  <html
    lang="en"
    className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
  >
    <body className="bg-background text-foreground selection:bg-primary/20 selection:text-primary flex min-h-full flex-col">
      {children}
      <Toaster position="bottom-right" richColors />
    </body>
  </html>
);

export default RootLayout;
