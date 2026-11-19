import { useMemo, useState } from "react";
import { rangeFor, type Preset } from "@/domain/sales";

type QuickPreset = Exclude<Preset, "custom">;

export const PRESETS: ReadonlyArray<{ value: QuickPreset; label: string }> = [
  { value: "today", label: "Hari ini" },
  { value: "yesterday", label: "Kemarin" },
  { value: "thisWeek", label: "Minggu ini" },
  { value: "last7", label: "7 hari" },
];

export function isQuickPreset(value: string): value is QuickPreset {
  return PRESETS.some((p) => p.value === value);
}

/** Format a date for `<input type="datetime-local">` in local time. */
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function defaultCustomStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return toLocalInput(d);
}

/**
 * Report period state. Editing either date switches to the custom range;
 * invalid dates fall back to the last 7 days and reversed dates are swapped.
 */
export function useReportRange() {
  const [preset, setPreset] = useState<Preset>("today");
  const [customStart, setCustomStartRaw] = useState(defaultCustomStart);
  const [customEnd, setCustomEndRaw] = useState(() => toLocalInput(new Date()));

  const { start, end } = useMemo(() => {
    if (preset !== "custom") return rangeFor(preset);
    const s = new Date(customStart);
    const e = new Date(customEnd);
    if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) {
      return rangeFor("last7");
    }
    if (s > e) return { start: e, end: s };
    return { start: s, end: e };
  }, [preset, customStart, customEnd]);

  const setCustomStart = (value: string) => {
    setCustomStartRaw(value);
    setPreset("custom");
  };
  const setCustomEnd = (value: string) => {
    setCustomEndRaw(value);
    setPreset("custom");
  };

  return { preset, setPreset, customStart, customEnd, setCustomStart, setCustomEnd, start, end };
}

export type ReportRange = ReturnType<typeof useReportRange>;
