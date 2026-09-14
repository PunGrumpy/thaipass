"use client";

import { useI18n } from "@thaipass/internationalization";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LessonTypeExp } from "@/lib/lms";

export const LessonTypeTable = ({
  rows,
}: {
  readonly rows: readonly LessonTypeExp[];
}) => {
  const { t } = useI18n();
  const copy = t.learning.breakdown;
  // SAFETY: the dictionary block is a flat string record, and the lookup below
  const labels: Record<string, string | undefined> = copy.types;
  const labelOf = (key: string): string => labels[key] ?? key;
  const total = rows.reduce((sum, row) => sum + (row.exp ?? 0), 0);

  return (
    <div className="ring-foreground/10 overflow-hidden rounded-xl ring-1">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead>{copy.type}</TableHead>
            <TableHead className="text-right">{copy.exp}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.lessonType}>
              <TableCell>{labelOf(row.lessonType)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {row.exp === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  row.exp.toLocaleString()
                )}
              </TableCell>
            </TableRow>
          ))}

          {rows.length > 0 ? (
            <TableRow className="bg-muted/40">
              <TableCell className="font-medium">{copy.total}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {total.toLocaleString()}
              </TableCell>
            </TableRow>
          ) : (
            <TableRow>
              <TableCell
                className="text-muted-foreground py-12 text-center text-sm"
                colSpan={2}
              >
                {copy.empty}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};
