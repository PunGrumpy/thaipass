"use client";

import { useI18n } from "@thaipass/internationalization";

import { PageHeader } from "@/components/layout/page-header";
import { AppearanceCard } from "@/components/settings/appearance-card";
import { LanguageCard } from "@/components/settings/language-card";
import { ProxyCard } from "@/components/settings/proxy-card";
import { SessionCard } from "@/components/settings/session-card";

const SettingsPage = () => {
  const { t } = useI18n();

  return (
    <>
      <PageHeader
        description={t.settings.description}
        title={t.settings.title}
      />
      <div className="max-w-2xl space-y-10">
        <ProxyCard />
        <SessionCard />
        <LanguageCard />
        <AppearanceCard />
      </div>
    </>
  );
};

export default SettingsPage;
