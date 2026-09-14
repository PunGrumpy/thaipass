"use client";

import { AppearanceCard } from "@/components/settings/appearance-card";
import { LanguageCard } from "@/components/settings/language-card";
import { ProxyCard } from "@/components/settings/proxy-card";
import { SessionCard } from "@/components/settings/session-card";

const SettingsPage = () => (
  <div className="max-w-2xl space-y-8">
    <ProxyCard />
    <SessionCard />
    <LanguageCard />
    <AppearanceCard />
  </div>
);

export default SettingsPage;
