"use client";

import { useI18n } from "@thaipass/internationalization";
import { ArrowUpDown, Check, Copy, Search, TerminalSquare } from "lucide-react";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/layout/empty-state";
import { Toolbar } from "@/components/layout/toolbar";
import {
  CAPABILITIES,
  CapabilityIcons,
  capabilitiesOf,
} from "@/components/models/capabilities";
import type { CapabilityId } from "@/components/models/capabilities";
import { ProviderFilter } from "@/components/models/provider-filter";
import { VendorChip } from "@/components/models/vendor-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { fill, formatRatePerMillion } from "@/lib/format";
import type { CatalogModel, ModelKind } from "@/lib/proxy";
import { cn } from "@/lib/utils";

const COPIED_RESET_MS = 1500;

type Filter = "all" | ModelKind;

type SortKey = "input" | "name" | "output" | "provider";

const SORT_KEYS: readonly SortKey[] = ["provider", "name", "input", "output"];

const asSortKey = (value: string): SortKey =>
  SORT_KEYS.find((key) => key === value) ?? "provider";

const asCapability = (value: string): CapabilityId | "all" =>
  CAPABILITIES.find((entry) => entry.id === value)?.id ?? "all";

const rateOf = (model: CatalogModel, key: "completion" | "prompt"): number => {
  if (model.free) {
    return 0;
  }
  return model.pricing?.[key] ?? Number.POSITIVE_INFINITY;
};

const FILTERS: readonly Filter[] = ["all", ...MODEL_KINDS];

const asFilter = (value: string): Filter =>
  FILTERS.find((filter) => filter === value) ?? "all";

interface VendorGroup {
  models: CatalogModel[];
  vendor: string;
}

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

const RateCell = ({
  free,
  rate,
}: {
  readonly free: boolean;
  readonly rate: number | undefined;
}) => {
  const { t } = useI18n();

  if (free) {
    return <span className="text-success text-xs">{t.models.free}</span>;
  }
  if (rate === undefined) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  return (
    <span className="font-mono text-xs tabular-nums">
      {formatRatePerMillion(rate)}
    </span>
  );
};

export const ModelTable = ({
  models,
}: {
  readonly models: readonly CatalogModel[];
}) => {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [freeOnly, setFreeOnly] = useState(false);
  const [vendor, setVendor] = useState("all");
  const [sort, setSort] = useState<SortKey>("provider");
  const [capability, setCapability] = useState<CapabilityId | "all">("all");
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
      if (vendor !== "all" && vendorOf(model.id) !== vendor) {
        return false;
      }
      if (
        capability !== "all" &&
        !capabilitiesOf(model).some((entry) => entry.id === capability)
      ) {
        return false;
      }
      return needle === "" || model.id.toLowerCase().includes(needle);
    });
  }, [capability, filter, freeOnly, models, query, vendor]);

  const vendors = useMemo(
    () => [...new Set(models.map((model) => vendorOf(model.id)))].toSorted(),
    [models]
  );

  const capabilityItems = useMemo(
    () => [
      { label: t.models.capabilityFilter.all, value: "all" },
      ...CAPABILITIES.map((entry) => ({
        label: t.models.capabilityNames[entry.id],
        value: entry.id,
      })),
    ],
    [t]
  );

  const sortItems = useMemo(
    () => SORT_KEYS.map((key) => ({ label: t.models.sort[key], value: key })),
    [t]
  );

  const groups = useMemo(() => groupByVendor(rows), [rows]);

  const sorted = useMemo(() => {
    if (sort === "provider") {
      return null;
    }
    return [...rows].toSorted((a, b) => {
      if (sort === "name") {
        return a.id.localeCompare(b.id);
      }
      const key = sort === "input" ? "prompt" : "completion";
      return rateOf(a, key) - rateOf(b, key) || a.id.localeCompare(b.id);
    });
  }, [rows, sort]);

  const handleCopy = async (id: string) => {
    const outcome = await attempt(() => navigator.clipboard.writeText(id));
    if (!outcome.ok) {
      toast.error(fill(t.models.copyFailed, id));
      return;
    }
    setCopied(id);
    toast.success(fill(t.models.copied, id));
    setTimeout(() => {
      setCopied((current) => (current === id ? null : current));
    }, COPIED_RESET_MS);
  };

  const renderRow = (model: CatalogModel) => (
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
          {model.free ? (
            <Badge className="border-success/30 text-success" variant="outline">
              {t.models.free}
            </Badge>
          ) : null}
          {model.ready ? null : (
            <Badge variant="destructive">{t.models.unavailable}</Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{KIND_LABELS[model.kind]}</Badge>
      </TableCell>
      <TableCell className="hidden text-right sm:table-cell">
        <RateCell free={model.free} rate={model.pricing?.prompt} />
      </TableCell>
      <TableCell className="hidden text-right sm:table-cell">
        <RateCell free={model.free} rate={model.pricing?.completion} />
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <CapabilityIcons model={model} />
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

  return (
    <div className="space-y-4">
      <Toolbar
        actions={
          <>
            <Switch
              checked={freeOnly}
              id="free-only"
              onCheckedChange={setFreeOnly}
            />
            <Label
              className="text-muted-foreground text-xs"
              htmlFor="free-only"
            >
              {t.models.freeOnly}
            </Label>
            <span className="text-muted-foreground ml-2 text-xs tabular-nums">
              {fill(t.models.count, rows.length, models.length)}
            </span>

            <Select
              items={sortItems}
              onValueChange={(next) => setSort(asSortKey(String(next)))}
              value={sort}
            >
              <SelectTrigger
                aria-label={t.models.sort.label}
                className="h-8 w-auto min-w-36"
                size="sm"
              >
                <ArrowUpDown className="size-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      >
        <InputGroup className="max-w-full sm:max-w-xs">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            aria-label={t.models.searchLabel}
            className="font-mono text-base sm:text-xs"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.models.searchPlaceholder}
            value={query}
          />
        </InputGroup>

        <ProviderFilter
          onChange={setVendor}
          providers={vendors}
          value={vendor}
        />

        <Select
          items={capabilityItems}
          onValueChange={(next) => setCapability(asCapability(String(next)))}
          value={capability}
        >
          <SelectTrigger
            aria-label={t.models.capabilityFilter.label}
            className="h-8 w-auto min-w-44"
            size="sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {capabilityItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tabs
          onValueChange={(next) => setFilter(asFilter(String(next)))}
          value={filter}
        >
          <TabsList variant="line">
            <TabsTrigger value="all">{t.models.kinds.all}</TabsTrigger>
            {MODEL_KINDS.map((kind) => (
              <TabsTrigger key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </Toolbar>

      <div className="ring-foreground/10 overflow-hidden rounded-xl ring-1">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>{t.models.columns.model}</TableHead>
              <TableHead>{t.models.columns.kind}</TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                {t.models.columns.input}
              </TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                {t.models.columns.output}
              </TableHead>
              <TableHead className="hidden lg:table-cell">
                {t.models.columns.capabilities}
              </TableHead>
              <TableHead className="text-right">
                {t.models.columns.actions}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted
              ? sorted.map((model) => renderRow(model))
              : groups.map((group) => (
                  <Fragment key={group.vendor}>
                    <TableRow className="hover:bg-muted/40 bg-muted/40">
                      <TableCell className="py-2" colSpan={6}>
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

                    {group.models.map((model) => renderRow(model))}
                  </Fragment>
                ))}

            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6}>
                  <EmptyState>
                    {query.trim() === ""
                      ? t.models.empty.filters
                      : fill(t.models.empty.query, `"${query.trim()}"`)}
                  </EmptyState>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
