"use client";

import { useI18n } from "@thaipass/internationalization";
import { Info } from "lucide-react";

import { ModelTable } from "@/components/models/model-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useCatalog } from "@/hooks/use-gateway";

const ModelsPage = () => {
  const catalog = useCatalog();
  const { t } = useI18n();

  return (
    <>
      {catalog.builtin && !catalog.loading ? (
        <Alert>
          <Info />
          <AlertTitle>{t.models.builtin.title}</AlertTitle>
          <AlertDescription>
            {catalog.error ?? t.models.builtin.description}
          </AlertDescription>
        </Alert>
      ) : null}

      <ModelTable models={catalog.models} />
    </>
  );
};

export default ModelsPage;
