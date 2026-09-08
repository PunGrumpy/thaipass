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

/**
 * Split out so the page can load recharts on demand — it is the heaviest
 * dependency here and the only screen that draws with it is this one card.
 */
const CatalogChart = ({
  slices,
}: {
  readonly slices: readonly CatalogSlice[];
}) => (
  <ChartContainer
    className="mx-auto aspect-square w-[160px]"
    config={CHART_CONFIG}
  >
    <PieChart>
      <ChartTooltip
        content={<ChartTooltipContent hideLabel nameKey="label" />}
        cursor={false}
      />
      <Pie
        data={[...slices]}
        dataKey="value"
        innerRadius={46}
        nameKey="label"
        outerRadius={72}
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
