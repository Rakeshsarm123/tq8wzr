import { useMemo } from "react";
import type { Dashboard, HourResult, Metrics } from "../api";
import { formatDay, formatDayTime, formatHours, formatMW, formatNumber, formatSignedMW, formatTime, ukDate } from "../format";
import { EChart, type ChartOption } from "./EChart";

const FORECAST = "Forecast at the deadline";
const ACTUAL = "Actual (hourly average)";
const RANGE = "Historical 80% range";
const LATEST = "Last forecast before the hour";
const COLOR = { forecast: "#2563eb", actual: "#0f766e", latest: "#64748b", range: "rgba(37, 99, 235, 0.14)" };

interface Range {
  low: number | null;
  high: number | null;
}

// Actual = forecast - error, so forecast minus the 10th-90th percentile errors brackets 80% of past actuals.
function rangeFor(forecast: number | null, p10: number | null, p90: number | null): Range {
  if (forecast === null || p10 === null || p90 === null) return { low: null, high: null };
  return { low: Math.max(0, forecast - p90), high: forecast - p10 };
}

const percent = (part: number, whole: number) => (whole ? `${Math.round((100 * part) / whole)}%` : "–");

function tooltip(hour: HourResult, range: Range, showLatest: boolean): string {
  const muted = (text: string) => `<span style="color:#5b6b82">${text}</span>`;
  const lines = [`<strong>${formatDayTime(hour.start_time)}</strong>`];
  const published =
    hour.publish_time && hour.hours_ahead !== null
      ? muted(` (published ${formatDayTime(hour.publish_time)}, ${formatHours(hour.hours_ahead)} h ahead)`)
      : "";
  lines.push(`${FORECAST}: <b>${formatMW(hour.forecast)}</b>${published}`);
  lines.push(`${ACTUAL}: <b>${formatMW(hour.actual)}</b>`);
  if (hour.error !== null) {
    const direction = hour.error > 0 ? "forecast too high" : hour.error < 0 ? "forecast too low" : "exact";
    lines.push(`Error: <b>${formatSignedMW(hour.error)}</b> ${muted(`(${direction})`)}`);
  }
  if (range.low !== null && range.high !== null) {
    lines.push(`${RANGE}: ${formatMW(range.low)} – ${formatMW(range.high)}`);
  }
  if (showLatest && hour.latest_forecast !== null && hour.latest_publish_time) {
    lines.push(`${LATEST}: ${formatMW(hour.latest_forecast)} ${muted(`(published ${formatTime(hour.latest_publish_time)})`)}`);
  }
  return lines.join("<br/>");
}

function chartOption({ days, hours }: Dashboard, reference: Metrics | null): ChartOption {
  const multiDay = days.length > 1;
  const zoomable = hours.length > 48;
  const ranges = hours.map((h) => rangeFor(h.forecast, reference?.p10 ?? null, reference?.p90 ?? null));
  return {
    animation: false,
    grid: { left: 64, right: 24, top: 44, bottom: zoomable ? 84 : 48 },
    legend: { top: 0, data: [FORECAST, ACTUAL, RANGE, LATEST], selected: { [LATEST]: false } },
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const items = (Array.isArray(params) ? params : [params]) as { dataIndex: number; seriesName: string }[];
        const index = items[0].dataIndex;
        return tooltip(hours[index], ranges[index], items.some((item) => item.seriesName === LATEST));
      },
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: hours.map((h) => h.start_time),
      axisLabel: {
        formatter: (value: string) => (multiDay ? `${formatTime(value)}\n${formatDay(ukDate(value))}` : formatTime(value)),
      },
    },
    yAxis: { type: "value", name: "MW", min: 0, axisLabel: { formatter: (value: number) => formatNumber(value) } },
    dataZoom: zoomable ? [{ type: "inside" }, { type: "slider", height: 22, bottom: 8 }] : [],
    series: [
      {
        name: "range-base",
        type: "line",
        stack: "range",
        data: ranges.map((r) => r.low),
        symbol: "none",
        lineStyle: { opacity: 0 },
        silent: true,
      },
      {
        name: RANGE,
        type: "line",
        stack: "range",
        data: ranges.map((r) => (r.low === null || r.high === null ? null : r.high - r.low)),
        symbol: "none",
        lineStyle: { opacity: 0 },
        areaStyle: { color: COLOR.range },
        itemStyle: { color: COLOR.range },
        silent: true,
      },
      {
        name: FORECAST,
        type: "line",
        data: hours.map((h) => h.forecast),
        symbol: "none",
        lineStyle: { width: 2 },
        itemStyle: { color: COLOR.forecast },
      },
      {
        name: ACTUAL,
        type: "line",
        data: hours.map((h) => h.actual),
        symbol: "none",
        lineStyle: { width: 2 },
        itemStyle: { color: COLOR.actual },
      },
      {
        name: LATEST,
        type: "line",
        data: hours.map((h) => h.latest_forecast),
        symbol: "none",
        lineStyle: { width: 1.5, type: "dashed" },
        itemStyle: { color: COLOR.latest },
      },
    ],
  };
}

export function ForecastVsActual({ dashboard, reference }: { dashboard: Dashboard; reference: Metrics | null }) {
  const option = useMemo(() => chartOption(dashboard, reference), [dashboard, reference]);
  const { hours, metrics } = dashboard;
  const p10 = reference?.p10 ?? null;
  const p90 = reference?.p90 ?? null;
  const errors = hours.flatMap((h) => (h.error === null ? [] : [h.error]));
  const tooHigh = errors.filter((e) => e > 0).length;
  const inside = p10 !== null && p90 !== null ? errors.filter((e) => e >= p10 && e <= p90).length : null;

  return (
    <section className="card" aria-labelledby="chart-title">
      <h2 id="chart-title">
        <span className="step-number">2</span> Forecast vs actual
      </h2>
      <p className="lead">
        How different was the forecast available at the deadline from the wind generation that actually occurred?
      </p>
      <div className="chart-stats">
        <p>
          <strong>{percent(tooHigh, errors.length)}</strong> of hours had less wind than forecast ({tooHigh} of{" "}
          {errors.length})
        </p>
        <p>
          Average forecast <strong>{formatMW(metrics.forecast_mean)}</strong> vs average actual{" "}
          <strong>{formatMW(metrics.actual_mean)}</strong>
        </p>
      </div>
      <EChart option={option} height={400} label="Hourly forecast at the deadline compared with actual wind generation" />
      <p className="note">
        {reference && inside !== null && (
          <>
            Shaded band: each hour's forecast minus the 10th–90th percentile error of all {reference.hours} analysed
            delivery hours at this deadline, so its lower edge is the historical overforecast buffer (
            {formatMW(reference.p90)} below the forecast). {inside} of the {errors.length} selected hours (
            {percent(inside, errors.length)}) fell inside it. It describes the analysed period and is not a guaranteed
            range for future hours.{" "}
          </>
        )}
        Click “{LATEST}” in the legend to see how much a fresher forecast, published closer to each hour, would have
        helped.
      </p>
    </section>
  );
}
