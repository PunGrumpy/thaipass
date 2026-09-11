"use client";

import { useI18n } from "@thaipass/internationalization";
import { Check, Copy, Search, TerminalSquare } from "lucide-react";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";

import { VendorChip } from "@/components/models/vendor-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { attempt } from "@/lib/attempt";
import { KIND_LABELS, MODEL_KINDS, vendorOf } from "@/lib/catalog";
import { formatRatePerMillion } from "@/lib/format";
import type { CatalogModel, ModelKind } from "@/lib/proxy";
import { cn } from "@/lib/utils";

const COPIED_RESET_MS = 1500;

type Filter = "all" | ModelKind;

const FILTERS: readonly Filter[] = ["all", ...MODEL_KINDS];

const asFilter = (value: string): Filter =>
  FILTERS.find((filter) => filter === value) ?? "all";

interface VendorGroup {
  models: CatalogModel[];
  vendor: string;
}

/**
 * Vendor is the one axis the kind tabs do not already cover, so grouping on it
 * adds structure rather than repeating a filter. The group header carries the
 * count and the mark, which lets the row drop both.
 */
const groupByVendor = (models: readonly CatalogModel[]): VendorGroup[] => {
  const byVendor = new Map<string, CatalogModel[]>();
  for (const model of models) {
    const vendor = vendorOf(model.id);
    const bucket = byVendor.get(vendor);
    if (bucket) {
      bucket.push(model);
    } else {
      byVendor.set(vendor, [model]);
    }
  }
  return [...byVendor]
    .map(([vendor, group]) => ({ models: group, vendor }))
    .toSorted(
      (a, b) =>
        b.models.length - a.models.length || a.vendor.localeCompare(b.vendor)
    );
};

const capabilitiesOf = (model: CatalogModel): string[] => {
  if (model.thinking && model.thinking.length > 0) {
    return model.thinking.map((level) => `thinking:${level}`);
  }
  if (model.options?.resolutions && model.options.resolutions.length > 0) {
    return [...model.options.resolutions];
  }
  if (model.options?.provider) {
    return [model.options.provider];
  }
  return [];
};

const ModelPriceCell = ({ model }: { readonly model: CatalogModel }) => {
  if (model.free) {
    return (
      <Badge className="border-success/30 text-success" variant="outline">
        Free ($0)
      </Badge>
    );
  }

  if (model.pricing) {
    const promptFormatted = formatRatePerMillion(model.pricing.prompt);
    const completionFormatted = formatRatePerMillion(model.pricing.completion);
    return (
      <div
        className="flex flex-col font-mono text-xs tabular-nums"
        title={`Prompt: ${promptFormatted} / 1M · Completion: ${completionFormatted} / 1M`}
      >
        <span className="sr-only">
          Input: {promptFormatted} per million tokens, Output:{" "}
          {completionFormatted} per million tokens
        </span>
        <span aria-hidden="true">
          {promptFormatted}
          <span className="text-muted-foreground ml-1 font-sans text-xs">
            in
          </span>
        </span>
        <span aria-hidden="true" className="text-muted-foreground">
          {completionFormatted}
          <span className="text-muted-foreground ml-1 font-sans text-xs">
            out
          </span>
        </span>
      </div>
    );
  }

  return <span className="text-muted-foreground/60 text-xs">—</span>;
};

export const ModelTable = ({
  models,
}: {
  readonly models: readonly CatalogModel[];
}) => {
  const { locale } = useI18n();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [freeOnly, setFreeOnly] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return models.filter((model) => {
      if (freeOnly && !model.free) {
        return false;
      }
      if (filter !== "all" && model.kind !== filter) {
        return false;
      }
      return needle === "" || model.id.toLowerCase().includes(needle);
    });
  }, [filter, freeOnly, models, query]);

  const groups = useMemo(() => groupByVendor(rows), [rows]);

  const handleCopy = async (id: string) => {
    const outcome = await attempt(() => navigator.clipboard.writeText(id));
    if (!outcome.ok) {
      toast.error(`Could not copy ${id}. Select the id and copy it by hand.`);
      return;
    }
    setCopied(id);
    toast.success(`Copied ${id}`);
    setTimeout(() => {
      setCopied((current) => (current === id ? null : current));
    }, COPIED_RESET_MS);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <InputGroup className="lg:max-w-xs">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search models"
            className="font-mono text-base sm:text-xs"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search model id…"
            value={query}
          />
        </InputGroup>

        <Tabs
          onValueChange={(next) => setFilter(asFilter(String(next)))}
          value={filter}
        >
          <TabsList variant="line">
            <TabsTrigger value="all">All</TabsTrigger>
            {MODEL_KINDS.map((kind) => (
              <TabsTrigger key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 lg:ml-auto">
          <Switch
            checked={freeOnly}
            id="free-only"
            onCheckedChange={setFreeOnly}
          />
          <Label className="text-muted-foreground text-xs" htmlFor="free-only">
            Free only
          </Label>
          <span className="text-muted-foreground ml-2 text-xs tabular-nums">
            {rows.length} of {models.length}
          </span>
        </div>
      </div>

      <div className="ring-foreground/10 overflow-hidden rounded-xl ring-1">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Model</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead className="hidden sm:table-cell">
                Pricing / 1M tokens
              </TableHead>
              <TableHead className="hidden lg:table-cell">
                Capabilities
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => (
              <Fragment key={group.vendor}>
                <TableRow className="hover:bg-muted/40 bg-muted/40">
                  <TableCell className="py-2" colSpan={5}>
                    <div className="flex items-center gap-2">
                      <VendorChip modelId={group.models[0]?.id ?? ""} />
                      <span className="text-xs font-medium">
                        {group.vendor}
                      </span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {group.models.length}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>

                {group.models.map((model) => {
                  const capabilities = capabilitiesOf(model);
                  return (
                    <TableRow key={model.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "font-mono text-xs",
                              !model.ready && "text-muted-foreground"
                            )}
                          >
                            {model.id}
                          </span>
                          {model.ready ? null : (
                            <Badge variant="destructive">unavailable</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {KIND_LABELS[model.kind]}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <ModelPriceCell model={model} />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {capabilities.length === 0 ? (
                            <span className="text-muted-foreground/60 text-xs">
                              —
                            </span>
                          ) : (
                            capabilities.map((capability) => (
                              <Badge
                                className="font-mono"
                                key={capability}
                                variant="ghost"
                              >
                                {capability}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1 pointer-coarse:gap-5">
                          <Button
                            aria-label={`Copy ${model.id}`}
                            className="touch-target"
                            onClick={() => handleCopy(model.id)}
                            size="icon-sm"
                            variant="ghost"
                          >
                            {copied === model.id ? (
                              <Check className="text-success" />
                            ) : (
                              <Copy />
                            )}
                          </Button>
                          {model.kind === "chat" ? (
                            <Button
                              aria-label={`Open ${model.id} in the playground`}
                              className="touch-target"
                              nativeButton={false}
                              render={
                                <Link
                                  href={`/${locale}/playground?model=${encodeURIComponent(model.id)}`}
                                />
                              }
                              size="icon-sm"
                              variant="ghost"
                            >
                              <TerminalSquare />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </Fragment>
            ))}

            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  className="text-muted-foreground py-12 text-center text-sm"
                  colSpan={5}
                >
                  {query.trim() === ""
                    ? "No model matches these filters."
                    : `No model matches "${query.trim()}".`}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
