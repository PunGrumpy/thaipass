"use client";

import { useI18n } from "@thaipass/internationalization";

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
  <div className="flex items-baseline justify-between gap-3 border-t py-2 first:border-t-0">
    <dt className="text-muted-foreground text-xs">{label}</dt>
    <dd className="text-right text-xs tabular-nums">{children}</dd>
  </div>
);

/**
 * The rows the catalog can actually fill. Context window, a written
 * description and uptime are not in it, so they are absent rather than shown
 * as blanks.
 */
export const ModelSummary = ({ model }: { readonly model: CatalogModel }) => {
  const { t } = useI18n();
  const copy = t.playground.card;

  const rate = (value: number | undefined) =>
    value === undefined
      ? copy.none
      : fill(copy.perMillion, formatRatePerMillion(value));

  return (
    <div className="space-y-3">
      <div className="flex min-w-0 items-center gap-2">
        <VendorChip modelId={model.id} />
        <span className="text-muted-foreground truncate text-xs">
          {vendorOf(model.id)}
        </span>
      </div>

      <p className="font-mono text-[13px] break-all">{model.id}</p>

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
  );
};
