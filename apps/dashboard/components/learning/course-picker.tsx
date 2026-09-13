"use client";

import { useI18n } from "@thaipass/internationalization";
import type { Dictionary } from "@thaipass/internationalization";
import { ListPlus, TriangleAlert, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useCourses } from "@/hooks/use-courses";
import { fill, formatDuration } from "@/lib/format";
import { MAX_COURSES } from "@/lib/learn-run";
import type { LmsCourse } from "@/lib/lms";

type CourseCopy = Dictionary["learning"]["courses"];

/** The three states a course can be in, in the order a run works through them. */
const GROUPS = [
  {
    key: "started",
    match: (course: LmsCourse) => course.started && !course.done,
  },
  {
    key: "notStarted",
    match: (course: LmsCourse) => !(course.started || course.done),
  },
  { key: "finished", match: (course: LmsCourse) => course.done },
] as const;

/** What the row says about the course on the right: state first, then price. */
const stateOf = (course: LmsCourse, copy: CourseCopy): string => {
  if (course.done) {
    return copy.state.done;
  }
  if (course.started) {
    return course.progress === null
      ? copy.state.started
      : fill(copy.state.progress, Math.round(course.progress));
  }
  return copy.state.notStarted;
};

const priceOf = (course: LmsCourse, copy: CourseCopy): string | null => {
  const parts: string[] = [];
  if (course.exp !== null) {
    parts.push(fill(copy.price.exp, course.exp.toLocaleString()));
  }
  if (course.bonus) {
    parts.push(fill(copy.price.bonus, course.bonus.toLocaleString()));
  }
  return parts.length === 0 ? null : parts.join(" · ");
};

export interface CoursePickerProps {
  disabled: boolean;
  onChange: (codes: readonly string[]) => void;
  /** Course codes currently chosen; empty means the whole catalogue. */
  value: readonly string[];
}

/**
 * A catalogue can run to hundreds of courses, so the list lives behind a
 * searchable dialog and the form keeps only what was picked. Choosing nothing
 * is a real answer: the run then covers everything.
 */
export const CoursePicker = ({
  disabled,
  onChange,
  value,
}: CoursePickerProps) => {
  const { t } = useI18n();
  const copy = t.learning.courses;
  const [open, setOpen] = useState(false);
  // Once opened, the catalogue stays loaded; reopening should not re-walk it.
  const [asked, setAsked] = useState(false);
  const { data, error, loading } = useCourses(asked);

  const courses = data ?? [];
  const chosen = new Set(value);
  const full = value.length >= MAX_COURSES;

  const toggle = (code: string) => {
    if (chosen.has(code)) {
      onChange(value.filter((picked) => picked !== code));
      return;
    }
    if (full) {
      return;
    }
    onChange([...value, code]);
  };

  const titleOf = (code: string): string =>
    courses.find((course) => course.code === code)?.title ?? code;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={disabled}
          onClick={() => {
            setAsked(true);
            setOpen(true);
          }}
          type="button"
          variant="outline"
        >
          <ListPlus />
          {copy.open}
        </Button>
        <span className="text-muted-foreground text-xs">
          {value.length === 0
            ? copy.every
            : fill(copy.limit, value.length, MAX_COURSES)}
        </span>
      </div>

      {value.length === 0 ? null : (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((code) => (
            <li key={code}>
              <Badge className="gap-1 pr-1" variant="secondary">
                <span className="font-mono">{code}</span>
                <button
                  aria-label={fill(copy.remove, titleOf(code))}
                  className="hover:bg-foreground/10 focus-visible:ring-ring/50 rounded-full p-0.5 outline-none focus-visible:ring-2"
                  onClick={() => toggle(code)}
                  type="button"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}

      <CommandDialog
        className="data-closed:animate-none data-open:animate-none"
        description={copy.purpose}
        onOpenChange={setOpen}
        open={open}
        title={copy.open}
      >
        <Command shouldFilter={!loading}>
          <CommandInput
            className="text-base sm:text-sm"
            placeholder={copy.placeholder}
          />
          <CommandList>
            {loading ? (
              <output className="text-muted-foreground block py-6 text-center text-sm">
                {copy.loading}
              </output>
            ) : null}

            {error ? (
              <p className="text-destructive flex items-start gap-2 p-3 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {error}
              </p>
            ) : null}

            {loading || error ? null : (
              <CommandEmpty>{copy.noMatch}</CommandEmpty>
            )}

            {GROUPS.map((group) => {
              const rows = courses.filter(group.match);
              if (rows.length === 0) {
                return null;
              }
              return (
                <CommandGroup heading={copy.groups[group.key]} key={group.key}>
                  {rows.map((course) => {
                    const picked = chosen.has(course.code);
                    const price = priceOf(course, copy);
                    return (
                      <CommandItem
                        data-checked={picked}
                        disabled={full && !picked}
                        key={course.code}
                        onSelect={() => toggle(course.code)}
                        value={`${course.code} ${course.title ?? ""}`}
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="break-words">
                            {course.title ?? course.code}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            <span className="font-mono">{course.code}</span>
                            {` · ${stateOf(course, copy)}`}
                            {course.duration
                              ? ` · ${formatDuration(course.duration)}`
                              : ""}
                            {price ? ` · ${price}` : ""}
                          </p>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>

        <div className="flex items-center justify-between gap-2 border-t px-2 py-2">
          <span className="text-muted-foreground pl-1 text-xs">
            {full
              ? fill(copy.full, MAX_COURSES)
              : fill(copy.chosen, value.length)}
          </span>
          <div className="flex gap-1">
            <Button
              disabled={value.length === 0}
              onClick={() => onChange([])}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t.common.actions.clear}
            </Button>
            <Button onClick={() => setOpen(false)} size="sm" type="button">
              {copy.done}
            </Button>
          </div>
        </div>
      </CommandDialog>
    </div>
  );
};
