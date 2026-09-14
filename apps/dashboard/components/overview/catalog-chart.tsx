"use client";

import { Cell, Pie, PieChart } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { KIND_LABELS } from "@/lib/catalog";

export interface CatalogSlice {
  fill: string;
  kind: string;
  label: string;
  value: number;
}

const CHART_CONFIG = {
  chat: { color: "var(--chart-1)", label: KIND_LABELS.chat },
  image: { color: "var(--chart-2)", label: KIND_LABELS.image },
  music: { color: "var(--chart-4)", label: KIND_LABELS.music },
  value: { label: "Models" },
  video: { color: "var(--chart-3)", label: KIND_LABELS.video },
} satisfies ChartConfig;

const CatalogChart = ({
  slices,
}: {
  readonly slices: readonly CatalogSlice[];
}) => (
  <ChartContainer
    className="mx-auto aspect-square w-full max-w-[140px]"
    config={CHART_CONFIG}
  >
    <PieChart accessibilityLayer={false} role="presentation" tabIndex={-1}>
      <ChartTooltip
        content={<ChartTooltipContent hideLabel nameKey="label" />}
        cursor={false}
      />
      <Pie
        data={[...slices]}
        rootTabIndex={-1}
        dataKey="value"
        innerRadius="62%"
        nameKey="label"
        outerRadius="98%"
        paddingAngle={2}
        strokeWidth={0}
      >
        {slices.map((slice) => (
          <Cell fill={slice.fill} key={slice.kind} />
        ))}
      </Pie>
    </PieChart>
  </ChartContainer>
);

export default CatalogChart;
