import type { HourResult } from "./api";
import { formatTime, ukDate } from "./format";

export type SortKey = "start_time" | "publish_time" | "hours_ahead" | "forecast" | "actual" | "error";
export type Filter = "all" | "over" | "under" | "beyond" | "missing";

export interface Sort {
  key: SortKey;
  descending: boolean;
}

export const isMissing = (hour: HourResult) => hour.forecast === null || hour.actual === null;

export function filterRows(rows: HourResult[], filter: Filter, buffer: number | null): HourResult[] {
  switch (filter) {
    case "over":
      return rows.filter((h) => h.error !== null && h.error > 0);
    case "under":
      return rows.filter((h) => h.error !== null && h.error < 0);
    case "beyond":
      return buffer === null ? [] : rows.filter((h) => h.error !== null && h.error > buffer);
    case "missing":
      return rows.filter(isMissing);
    case "all":
      return rows;
  }
}

const sortValue = (hour: HourResult, key: SortKey): number | null => {
  const value = hour[key];
  return typeof value === "string" ? Date.parse(value) : value;
};

export function sortRows(rows: HourResult[], { key, descending }: Sort): HourResult[] {
  return [...rows].sort((a, b) => {
    const x = sortValue(a, key);
    const y = sortValue(b, key);
    // Missing values stay at the bottom in either direction.
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return descending ? y - x : x - y;
  });
}

const CSV_HEADER = [
  "delivery_start_utc",
  "delivery_start_uk",
  "forecast_published_utc",
  "hours_ahead",
  "forecast_mw",
  "actual_mw",
  "error_mw",
];

export function toCsv(rows: HourResult[]): string {
  const cell = (value: string | number | null) => (value === null ? "" : String(value));
  const lines = rows.map((h) =>
    [
      h.start_time,
      `${ukDate(h.start_time)} ${formatTime(h.start_time)}`,
      h.publish_time,
      h.hours_ahead,
      h.forecast,
      h.actual,
      h.error,
    ]
      .map(cell)
      .join(","),
  );
  return [CSV_HEADER.join(","), ...lines].join("\r\n") + "\r\n";
}
