"use client";

import type { StoreStatus } from "@thaipass/core/aipass/history";
import { useI18n } from "@thaipass/internationalization";
import { AlertTriangle, Database } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Nothing for "ready". "off": the three steps that give the proxy a Redis
 * store. "down": a warning that the store did not answer, with the live
 * figures still shown by the page.
 */
export const StoreNotice = ({ status }: { readonly status: StoreStatus }) => {
  const { t } = useI18n();
  const { store } = t.credits;

  if (status === "ready") {
    return null;
  }
  if (status === "down") {
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>{store.downTitle}</AlertTitle>
        <AlertDescription>{store.downBody}</AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert>
      <Database />
      <AlertTitle>{store.offTitle}</AlertTitle>
      <AlertDescription>
        <p>{store.offBody}</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>{store.offStepCreate}</li>
          <li>{store.offStepConnect}</li>
          <li>{store.offStepRedeploy}</li>
        </ol>
      </AlertDescription>
    </Alert>
  );
};
