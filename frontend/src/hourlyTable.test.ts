import { describe, expect, it } from "vitest";
import type { HourResult } from "./api";
import { filterRows, sortRows, toCsv } from "./hourlyTable";

const hour = (start: string, forecast: number | null, actual: number | null): HourResult => ({
  start_time: start,
  publish_time: "2026-01-27T07:30:00Z",
  hours_ahead: 16.5,
  forecast,
  actual,
  error: forecast !== null && actual !== null ? forecast - actual : null,
  latest_publish_time: null,
  latest_forecast: null,
});

const rows = [
  hour("2026-01-28T00:00:00Z", 9_000, 5_000),
  hour("2026-01-28T01:00:00Z", 5_000, 5_500.5),
  hour("2026-01-28T02:00:00Z", null, 5_000),
  hour("2026-01-28T03:00:00Z", 7_000, 6_000),
];

describe("filterRows", () => {
  it("separates forecasts that were too high from those that were too low", () => {
    expect(filterRows(rows, "over", null).map((h) => h.error)).toEqual([4_000, 1_000]);
    expect(filterRows(rows, "under", null).map((h) => h.error)).toEqual([-500.5]);
  });

  it("keeps hours with a missing value visible instead of treating them as zero", () => {
    expect(filterRows(rows, "missing", null).map((h) => h.start_time)).toEqual(["2026-01-28T02:00:00Z"]);
  });

  it("finds shortfalls beyond the historical buffer", () => {
    expect(filterRows(rows, "beyond", 2_000).map((h) => h.error)).toEqual([4_000]);
    expect(filterRows(rows, "beyond", null)).toEqual([]);
  });
});

describe("sortRows", () => {
  it("puts the largest overforecast first and missing values last", () => {
    expect(sortRows(rows, { key: "error", descending: true }).map((h) => h.error)).toEqual([4_000, 1_000, -500.5, null]);
  });

  it("keeps missing values last when sorting ascending too", () => {
    expect(sortRows(rows, { key: "forecast", descending: false }).map((h) => h.forecast)).toEqual([
      5_000,
      7_000,
      9_000,
      null,
    ]);
  });

  it("sorts times chronologically", () => {
    const newestFirst = sortRows(rows, { key: "start_time", descending: true });
    expect(newestFirst.map((h) => h.start_time.slice(11, 13))).toEqual(["03", "02", "01", "00"]);
  });
});

describe("toCsv", () => {
  it("writes exact values and leaves missing ones empty, never zero", () => {
    const lines = toCsv(rows.slice(1, 3)).trimEnd().split("\r\n");
    expect(lines).toEqual([
      "delivery_start_utc,delivery_start_uk,forecast_published_utc,hours_ahead,forecast_mw,actual_mw,error_mw",
      "2026-01-28T01:00:00Z,2026-01-28 01:00,2026-01-27T07:30:00Z,16.5,5000,5500.5,-500.5",
      "2026-01-28T02:00:00Z,2026-01-28 02:00,2026-01-27T07:30:00Z,16.5,,5000,",
    ]);
  });
});
