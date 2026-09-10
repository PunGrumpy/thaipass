"use client";

import { useI18n } from "@thaipass/internationalization";

import { IntegrationPanel } from "@/components/integrations/integration-panel";
import { PageHeader } from "@/components/layout/page-header";

const IntegrationsPage = () => {
  const { t } = useI18n();

  return (
    <>
      <PageHeader
        description={t.integrations.description}
        title={t.integrations.title}
      />
      <IntegrationPanel />
    </>
  );
};

export default IntegrationsPage;
