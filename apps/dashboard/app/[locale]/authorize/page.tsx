import { Suspense } from "react";

import { ConsentPanel } from "@/components/authorize/consent-panel";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Login with thaipass, from the account holder's side. The page stands on its
 * own — no sidebar, nothing to wander off into — because the only thing to do
 * here is understand the request and answer it.
 *
 * The panel reads the request from the query string, so it renders in the
 * browser and this page hands it a placeholder until it does.
 */
const AuthorizePage = () => (
  <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
    <Suspense
      fallback={
        <Card>
          <CardContent className="space-y-4 py-6">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      }
    >
      <ConsentPanel />
    </Suspense>
  </main>
);

export default AuthorizePage;
