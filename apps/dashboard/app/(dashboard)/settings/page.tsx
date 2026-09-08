"use client";

import { PageHeader } from "@/components/layout/page-header";
import { AppearanceCard } from "@/components/settings/appearance-card";
import { ProxyCard } from "@/components/settings/proxy-card";
import { SessionCard } from "@/components/settings/session-card";

const SettingsPage = () => (
  <>
    <PageHeader
      description="Everything here lives in this browser. The gateway itself keeps no state and no credentials."
      title="Settings"
    />
    <div className="max-w-2xl space-y-10">
      <ProxyCard />
      <SessionCard />
      <AppearanceCard />
    </div>
  </>
);

export default SettingsPage;
