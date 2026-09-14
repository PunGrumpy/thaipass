"use client";

import { useI18n } from "@thaipass/internationalization";
import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

import { VendorChip } from "@/components/models/vendor-chip";
import { ModelSummary } from "@/components/playground/model-summary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { vendorOf } from "@/lib/catalog";
import type { CatalogModel } from "@/lib/proxy";
import { cn } from "@/lib/utils";

export interface ModelPickerProps {
  models: readonly CatalogModel[];
  onChange: (model: string) => void;
  value: string;
}

export const ModelPicker = ({ models, onChange, value }: ModelPickerProps) => {
  const [open, setOpen] = useState(false);
  // cmdk owns the highlight, and it moves with the arrow keys as well as the
  // pointer, so the panel follows a keyboard reader too.
  const [highlighted, setHighlighted] = useState(value);
  const { t } = useI18n();
  const copy = t.playground.picker;
  const current = models.find((model) => model.id === value);
  const preview = models.find((model) => model.id === highlighted) ?? null;

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-label={copy.label}
            className="h-8 max-w-[22rem] justify-between gap-2 font-normal"
            variant="outline"
          />
        }
      >
        {current ? (
          <VendorChip className="size-5" modelId={current.id} />
        ) : null}
        <span className="truncate font-mono text-[13px]">{value}</span>
        {current?.free ? (
          <Badge className="border-success/30 text-success" variant="outline">
            {t.models.free}
          </Badge>
        ) : null}
        <ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0" />
      </PopoverTrigger>

      {/* Two detached cards rather than one split surface, so the summary
          reads as a panel beside the list instead of a second column of it. */}
      <PopoverContent
        align="start"
        className="w-auto max-w-[calc(100vw-2rem)] flex-row items-start gap-2 border-0 bg-transparent p-0 shadow-none ring-0"
      >
        <Command
          className="bg-popover w-72 shrink-0 rounded-xl border shadow-md"
          onValueChange={setHighlighted}
          value={highlighted}
        >
          <CommandInput placeholder={copy.search} />
          <CommandList>
            <CommandEmpty>{copy.empty}</CommandEmpty>
            {models.map((model) => (
              <CommandItem
                key={model.id}
                onSelect={() => {
                  onChange(model.id);
                  setOpen(false);
                }}
                value={model.id}
              >
                <Check
                  className={cn(
                    "size-3.5 shrink-0",
                    model.id !== value && "opacity-0"
                  )}
                />
                <VendorChip modelId={model.id} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[13px]">
                    {model.id}
                  </span>
                  <span className="text-muted-foreground block truncate text-[11px]">
                    {vendorOf(model.id)}
                  </span>
                </span>
                {model.free ? (
                  <Badge
                    className="border-success/30 text-success shrink-0"
                    variant="outline"
                  >
                    {t.models.free}
                  </Badge>
                ) : null}
              </CommandItem>
            ))}
          </CommandList>
        </Command>

        {preview ? (
          <div className="bg-popover hidden w-72 shrink-0 rounded-xl border p-4 shadow-md sm:block">
            <ModelSummary model={preview} />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
};
