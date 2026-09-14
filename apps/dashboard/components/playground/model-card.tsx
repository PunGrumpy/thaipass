"use client";

import { useI18n } from "@thaipass/internationalization";
import { ArrowUpRight, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { CapabilityIcons } from "@/components/models/capabilities";
import { VendorChip } from "@/components/models/vendor-chip";
import { KIND_LABELS, vendorOf } from "@/lib/catalog";
import { fill, formatRatePerMillion } from "@/lib/format";
import type { CatalogModel } from "@/lib/proxy";

const Row = ({
  children,
  label,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
}) => (
  <div className="flex items-center justify-between gap-4 border-t py-2.5 first:border-t-0">
    <dt className="text-sm font-medium">{label}</dt>
    <dd className="text-muted-foreground text-sm">{children}</dd>
  </div>
);

export const ModelCard = ({ model }: { readonly model: CatalogModel }) => {
  const { locale, t } = useI18n();
  const copy = t.playground.card;

  const rate = (value: number | undefined) =>
    value === undefined
      ? copy.none
      : fill(copy.perMillion, formatRatePerMillion(value));

  return (
    <div className="bg-card mx-auto w-full max-w-xl overflow-hidden rounded-xl border">
      <div className="space-y-4 p-5">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <VendorChip modelId={model.id} />
          <span className="text-muted-foreground">{vendorOf(model.id)}</span>
          <span className="text-muted-foreground">/</span>
          <span className="truncate font-mono font-medium">{model.id}</span>
        </div>

        {model.ready ? null : (
          <p className="text-warning flex items-center gap-1.5 text-sm">
            <TriangleAlert className="size-3.5 shrink-0" />
            {copy.unavailable}
          </p>
        )}

        <dl>
          <Row label={copy.kind}>{KIND_LABELS[model.kind]}</Row>
          <Row label={copy.input}>
            {model.free ? rate(0) : rate(model.pricing?.prompt)}
          </Row>
          <Row label={copy.output}>
            {model.free ? rate(0) : rate(model.pricing?.completion)}
          </Row>
          <Row label={copy.capabilities}>
            <CapabilityIcons model={model} />
          </Row>
        </dl>
      </div>

      <div className="bg-muted/40 border-t px-5 py-3">
        <Link
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
          href={`/${locale}/models`}
        >
          {copy.link}
          <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
};
