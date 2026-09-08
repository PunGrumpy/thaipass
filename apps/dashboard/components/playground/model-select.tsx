"use client";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CatalogModel } from "@/lib/proxy";

export interface ModelSelectProps {
  /** Bound to the field's own <Label htmlFor>. */
  id: string;
  models: readonly CatalogModel[];
  onChange: (model: string) => void;
  value: string;
}

export const ModelSelect = ({
  id,
  models,
  onChange,
  value,
}: ModelSelectProps) => (
  <Select onValueChange={(next) => onChange(String(next))} value={value}>
    <SelectTrigger className="w-full font-mono text-xs" id={id}>
      <SelectValue placeholder="Pick a chat model" />
    </SelectTrigger>
    <SelectContent className="max-h-80">
      {models.map((model) => (
        <SelectItem key={model.id} value={model.id}>
          <span className="font-mono text-xs">{model.id}</span>
          {model.free ? <Badge variant="secondary">free</Badge> : null}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
