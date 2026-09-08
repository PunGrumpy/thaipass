import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LessonTypeExp } from "@/lib/lms";

/**
 * A handful of rows with exact figures, so a table beats a chart: the reader
 * wants the number, not the shape.
 */
export const LessonTypeTable = ({
  rows,
}: {
  readonly rows: readonly LessonTypeExp[];
}) => {
  const total = rows.reduce((sum, row) => sum + (row.exp ?? 0), 0);

  return (
    <div className="ring-foreground/10 overflow-hidden rounded-xl ring-1">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead>Lesson type</TableHead>
            <TableHead className="text-right">EXP</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.lessonType}>
              <TableCell>{row.lessonType}</TableCell>
              <TableCell className="text-right tabular-nums">
                {row.exp === null ? (
                  <span className="text-muted-foreground/60">—</span>
                ) : (
                  row.exp.toLocaleString()
                )}
              </TableCell>
            </TableRow>
          ))}

          {rows.length > 0 ? (
            <TableRow className="bg-muted/40">
              <TableCell className="font-medium">Total</TableCell>
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
                The LMS reported no per-type breakdown for this account.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};
