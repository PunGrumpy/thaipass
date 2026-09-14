"use client";

import { useI18n } from "@thaipass/internationalization";
import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

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
import { cn } from "@/lib/utils";

export interface ProviderFilterProps {
  onChange: (value: string) => void;
  providers: readonly string[];
  value: string;
}

export const ProviderFilter = ({
  onChange,
  providers,
  value,
}: ProviderFilterProps) => {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const copy = t.models.providers;

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-label={copy.label}
            className="h-8 w-auto min-w-40 justify-between font-normal"
            size="sm"
            variant="outline"
          />
        }
      >
        <span className="truncate">{value === "all" ? copy.all : value}</span>
        <ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0" />
      </PopoverTrigger>

      <PopoverContent align="start" className="w-56 p-0">
        <Command>
          <CommandInput placeholder={copy.search} />
          <CommandList>
            <CommandEmpty>{copy.empty}</CommandEmpty>
            <CommandItem onSelect={() => pick("all")} value={copy.all}>
              <Check
                className={cn("size-3.5", value !== "all" && "opacity-0")}
              />
              {copy.all}
            </CommandItem>
            {providers.map((provider) => (
              <CommandItem
                key={provider}
                onSelect={() => pick(provider)}
                value={provider}
              >
                <Check
                  className={cn("size-3.5", value !== provider && "opacity-0")}
                />
                {provider}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
