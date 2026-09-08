"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useCatalog } from "@/hooks/use-gateway";
import { attempt } from "@/lib/attempt";
import { NAV_SECTIONS } from "@/lib/nav";

const MODEL_LIMIT = 8;

export interface CommandMenuProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export const CommandMenu = ({ onOpenChange, open }: CommandMenuProps) => {
  const router = useRouter();
  const { setTheme } = useTheme();
  const { models } = useCatalog();

  const run = useCallback(
    (action: () => Promise<void> | void) => {
      onOpenChange(false);
      void action();
    },
    [onOpenChange]
  );

  return (
    <CommandDialog
      className="data-closed:animate-none data-open:animate-none"
      onOpenChange={onOpenChange}
      open={open}
    >
      {/* CommandDialog renders only the dialog shell; cmdk's store comes from
          Command, and without it CommandInput has nothing to subscribe to. */}
      <Command>
        <CommandInput
          className="text-base sm:text-sm"
          placeholder="Jump to a page, or search a model id…"
        />
        <CommandList>
          <CommandEmpty>No page or model matched.</CommandEmpty>
          {NAV_SECTIONS.map((section) => (
            <CommandGroup heading={section.label} key={section.label}>
              {section.items.map((item) => (
                <CommandItem
                  key={item.href}
                  onSelect={() => run(() => router.push(item.href))}
                  value={`${item.title} ${item.description}`}
                >
                  <item.icon />
                  <span>{item.title}</span>
                  <span className="text-muted-foreground ml-auto truncate text-xs">
                    {item.description}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}

          <CommandSeparator />

          <CommandGroup heading="Copy model id">
            {models.slice(0, MODEL_LIMIT).map((model) => (
              <CommandItem
                key={model.id}
                onSelect={() =>
                  run(async () => {
                    const outcome = await attempt(() =>
                      navigator.clipboard.writeText(model.id)
                    );
                    if (outcome.ok) {
                      toast.success(`Copied ${model.id}`);
                      return;
                    }
                    toast.error(
                      `Could not copy ${model.id}. Copy it from the Models page instead.`
                    );
                  })
                }
                value={model.id}
              >
                <span className="font-mono text-xs">{model.id}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Theme">
            <CommandItem onSelect={() => run(() => setTheme("light"))}>
              <Sun />
              Light
            </CommandItem>
            <CommandItem onSelect={() => run(() => setTheme("dark"))}>
              <Moon />
              Dark
            </CommandItem>
            <CommandItem onSelect={() => run(() => setTheme("system"))}>
              <Monitor />
              System
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
};

/** Owns the ⌘K binding so the header only has to render a button. */
export const useCommandMenu = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return { onOpenChange: setOpen, open };
};
