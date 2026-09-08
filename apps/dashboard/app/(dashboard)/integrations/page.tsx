"use client";

import { IntegrationPanel } from "@/components/integrations/integration-panel";
import { PageHeader } from "@/components/layout/page-header";

const IntegrationsPage = () => (
  <>
    <PageHeader
      description="Point a coding agent or an SDK at the local gateway. Every snippet includes your gateway origin and the model you pick."
      title="Integrations"
    />
    <IntegrationPanel />
  </>
);

export default IntegrationsPage;
