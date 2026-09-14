"use client";

import { useI18n } from "@thaipass/internationalization";
import Link from "next/link";

import { SessionIcon } from "@/components/icons/rune";
import { Button } from "@/components/ui/button";
import { useConnection } from "@/hooks/use-connection";
import { useHydrated } from "@/hooks/use-hydrated";

export const SessionChip = () => {
  const { hasSession } = useConnection();
  const { locale, t } = useI18n();
  const hydrated = useHydrated();

  if (!hydrated) {
    return <div className="h-7 w-32" />;
  }

  if (hasSession) {
    return (
      <Button
        className="text-muted-foreground h-7 gap-1.5 px-2 text-[13px] font-normal"
        nativeButton={false}
        render={<Link href={`/${locale}/settings`} />}
        variant="ghost"
      >
        <SessionIcon className="size-3.5" />
        {t.navigation.session.connected}
      </Button>
    );
  }

  return (
    <Button
      className="h-7"
      nativeButton={false}
      render={<Link href={`/${locale}/settings`} />}
      size="sm"
      variant="outline"
    >
      <SessionIcon data-icon="inline-start" />
      {t.navigation.session.connect}
    </Button>
  );
};
