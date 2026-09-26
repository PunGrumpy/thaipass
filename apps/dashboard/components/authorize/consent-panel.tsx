"use client";

import { useI18n } from "@thaipass/internationalization";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CreditCard,
  Layers,
  MessageSquare,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { ComponentType } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConnection } from "@/hooks/use-connection";
import { useResource } from "@/hooks/use-resource";
import { attempt } from "@/lib/attempt";
import { fill } from "@/lib/format";
import {
  completionUrl,
  fetchAccount,
  readAuthorizeRequest,
  requestCode,
  scopesOf,
} from "@/lib/oauth";
import type { Account, ScopeName } from "@/lib/oauth";

const SCOPE_ICONS: Record<ScopeName, ComponentType<{ className?: string }>> = {
  chat: MessageSquare,
  lms: BookOpen,
  media: Sparkles,
  models: Layers,
  usage: CreditCard,
};

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export const ConsentPanel = () => {
  const { locale, t } = useI18n();
  const { cookie, hasSession, proxyUrl } = useConnection();
  const params = useSearchParams();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = t.authorize;

  const request = useMemo(
    () => readAuthorizeRequest(new URLSearchParams(params.toString())),
    [params]
  );

  const account = useResource<Account>(
    hasSession ? `${proxyUrl}:${cookie}` : null,
    (signal) => fetchAccount(proxyUrl, cookie, signal)
  );

  if (request === null) {
    return (
      <Card>
        <CardContent className="space-y-2 py-6">
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <AlertTriangle className="text-destructive size-4" />
            {copy.invalid.title}
          </h1>
          <p className="text-muted-foreground text-sm text-pretty">
            {copy.invalid.description}
          </p>
        </CardContent>
      </Card>
    );
  }

  const scopes = scopesOf(request.scope);

  const handleApprove = async () => {
    setWorking(true);
    setError(null);

    const outcome = await attempt(() => requestCode(proxyUrl, cookie, request));
    if (!outcome.ok) {
      setWorking(false);
      setError(outcome.message);
      return;
    }
    window.location.replace(completionUrl(request, { code: outcome.data }));
  };

  const handleCancel = () => {
    window.location.replace(completionUrl(request, { error: "access_denied" }));
  };

  return (
    <Card>
      <CardContent className="space-y-6 py-6">
        <div className="space-y-2">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
            <ShieldCheck className="size-3.5" />
            {copy.badge}
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-pretty">
            {fill(copy.title, request.clientId)}
          </h1>
          <p className="text-muted-foreground text-sm text-pretty">
            {fill(copy.description, request.clientId)}
          </p>
        </div>

        {hasSession ? (
          <div className="bg-muted/40 rounded-lg border p-3 text-sm">
            <p className="text-muted-foreground text-xs">
              {copy.account.signedIn}
            </p>
            <p className="font-medium">
              {account.data?.name ?? account.data?.email ?? cookie.slice(0, 12)}
            </p>
            {account.data?.organization ? (
              <p className="text-muted-foreground text-xs">
                {account.data.organization}
                {account.data.email ? ` · ${account.data.email}` : null}
              </p>
            ) : null}
            {account.error ? (
              <p className="text-destructive text-xs">{copy.account.unknown}</p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border border-dashed p-3">
            <p className="text-muted-foreground text-sm text-pretty">
              {copy.account.none}
            </p>
            <Button
              nativeButton={false}
              render={<Link href={`/${locale}`} />}
              variant="outline"
            >
              {copy.action.connect}
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">{copy.scopes.title}</p>
          <ul className="space-y-1.5">
            {scopes.map((scope) => {
              const Icon = SCOPE_ICONS[scope];
              return (
                <li
                  className="text-muted-foreground flex items-start gap-2 text-sm"
                  key={scope}
                >
                  <Icon className="mt-0.5 size-3.5 shrink-0" />
                  <span className="text-pretty">{copy.scopes[scope]}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-2 text-xs">
          <p className="text-muted-foreground">
            {fill(copy.redirect, hostOf(request.redirectUri))}
          </p>
          <p className="text-muted-foreground flex items-start gap-1.5 text-pretty">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {copy.unverified}
          </p>
        </div>

        {error ? (
          <p className="text-destructive text-xs text-pretty">
            {copy.failed}: {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={!hasSession || working} onClick={handleApprove}>
            <Check data-icon="inline-start" />
            {working
              ? copy.action.working
              : fill(copy.action.approve, request.clientId)}
          </Button>
          <Button onClick={handleCancel} variant="ghost">
            {copy.action.cancel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
