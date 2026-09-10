"use client";

import { Info, RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ModelTable } from "@/components/models/model-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useCatalog } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";

const ModelsPage = () => {
  const catalog = useCatalog();

  return (
    <>
      <PageHeader
        action={
          <Button
            disabled={catalog.loading}
            onClick={() => catalog.reload()}
            variant="outline"
          >
            <RefreshCw className={cn(catalog.loading && "animate-spin")} />
            Refresh
          </Button>
        }
        description="Ids are case-sensitive, and Claude models include an @provider suffix. Kind decides which endpoint takes the model."
        title="Models"
      />

      {catalog.builtin && !catalog.loading ? (
        <Alert>
          <Info />
          <AlertTitle>Showing the built-in model list</AlertTitle>
          <AlertDescription>
            {catalog.error ??
              "Connect a session in Settings to load the catalog your account can actually reach, with live availability."}
          </AlertDescription>
        </Alert>
      ) : null}

      <ModelTable models={catalog.models} />
    </>
  );
};

export default ModelsPage;
