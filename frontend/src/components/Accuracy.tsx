import { useMemo } from "react";
import type { Dashboard, DayResult, HourResult, LeadTimeResult, Metrics } from "../api";
import { formatDay, formatDayTime, formatHours, formatMW, formatNumber, formatShortDay, formatSignedMW } from "../format";
import { EChart, type ChartOption } from "./EChart";

const OVER = "#e11d48";
const UNDER = "#0891b2";
const SIZE = "#0f172a";
const LEAD_USED = "#2563eb";
const LEAD_OTHER = "#93c5fd";
const BIAS = "Bias (signed)";
const MAE = "MAE (size)";

const signed = (value: number | null) => (value === null ? "–" : formatSignedMW(value));
const direction = (bias: number) => (bias > 0 ? "forecast too high" : bias < 0 ? "forecast too low" : "no bias");
const indexOf = (params: unknown) => ((Array.isArray(params) ? params : [params]) as { dataIndex: number }[])[0].dataIndex;

function aheadRange(hours: HourResult[]): [number, number] | null {
  const values = hours.flatMap((h) => (h.hours_ahead === null ? [] : [h.hours_ahead]));
  return values.length ? [Math.min(...values), Math.max(...values)] : null;
}

function dailyOption(days: DayResult[]): ChartOption {
  return {
    animation: false,
    grid: { left: 64, right: 16, top: 40, bottom: 32 },
    legend: { top: 0, data: [BIAS, MAE] },
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const { day, metrics } = days[indexOf(params)];
        return [
          `<strong>${formatDay(day)}</strong>`,
          `Bias: <b>${signed(metrics.bias)}</b>${metrics.bias === null ? "" : ` (${direction(metrics.bias)})`}`,
          `MAE: <b>${formatMW(metrics.mae)}</b>`,
          `${metrics.hours} hours compared${metrics.missing ? `, ${metrics.missing} missing` : ""}`,
        ].join("<br/>");
      },
    },
    xAxis: { type: "category", data: days.map((d) => d.day), axisLabel: { formatter: (v: string) => formatShortDay(v) } },
    yAxis: { type: "value", name: "MW", axisLabel: { formatter: (v: number) => formatNumber(v) } },
    series: [
      {
        name: BIAS,
        type: "bar",
        itemStyle: { color: OVER },
        data: days.map((d) => ({
          value: d.metrics.bias ?? "-",
          itemStyle: { color: (d.metrics.bias ?? 0) >= 0 ? OVER : UNDER },
        })),
      },
      { name: MAE, type: "line", data: days.map((d) => d.metrics.mae), symbolSize: 5, itemStyle: { color: SIZE } },
    ],
  };
}

function leadTimeOption(buckets: LeadTimeResult[], used: [number, number] | null): ChartOption {
  const isUsed = (b: LeadTimeResult) => used !== null && b.from_hours < used[1] && b.to_hours > used[0];
  return {
    animation: false,
    grid: { left: 64, right: 16, top: 40, bottom: 32 },
    legend: { top: 0, data: [MAE, BIAS] },
    tooltip: {
      trigger: "axis",
      formatter: (params: unknown) => {
        const b = buckets[indexOf(params)];
        return [
          `<strong>Published ${b.from_hours}–${b.to_hours} h before delivery</strong>`,
          `MAE: <b>${formatMW(b.mae)}</b>`,
          `Bias: <b>${signed(b.bias)}</b>`,
          `${formatNumber(b.comparisons)} forecast–actual comparisons`,
        ].join("<br/>");
      },
    },
    xAxis: { type: "category", data: buckets.map((b) => `${b.from_hours}–${b.to_hours} h`) },
    yAxis: { type: "value", name: "MW", axisLabel: { formatter: (v: number) => formatNumber(v) } },
    series: [
      {
        name: MAE,
        type: "bar",
        itemStyle: { color: LEAD_USED },
        label: {
          show: true,
          position: "top",
          formatter: ({ value }) => (typeof value === "number" ? formatNumber(value) : ""),
        },
        data: buckets.map((b) => ({ value: b.mae ?? "-", itemStyle: { color: isUsed(b) ? LEAD_USED : LEAD_OTHER } })),
      },
      { name: BIAS, type: "bar", itemStyle: { color: OVER }, data: buckets.map((b) => b.bias ?? "-") },
    ],
  };
}

function Kpi({ label, value, note, whole }: { label: string; value: string; note: string; whole?: string }) {
  return (
    <div className="kpi">
      <p className="kicker">{label}</p>
      <p className="value">{value}</p>
      <p className="muted">{note}</p>
      {whole && <p className="compare">Whole period at this deadline: {whole}</p>}
    </div>
  );
}

export function Accuracy({ dashboard, reference }: { dashboard: Dashboard; reference: Metrics | null }) {
  const { days, hours, metrics, lead_times } = dashboard;
  const used = useMemo(() => aheadRange(hours), [hours]);
  const daily = useMemo(() => dailyOption(days), [days]);
  const byLead = useMemo(() => leadTimeOption(lead_times, used), [lead_times, used]);
  const errors = hours.flatMap((h) => (h.error === null ? [] : [h.error]));
  const tooHigh = errors.filter((e) => e > 0).length;
  const worst = hours.find((h) => h.error !== null && h.error === metrics.max_error);
  const partial = reference !== null && reference.hours !== metrics.hours;
  const whole = (value: number | null, format: (v: number | null) => string) => (partial ? format(value) : undefined);

  return (
    <section className="card" aria-labelledby="accuracy-title">
      <div className="card-head">
        <h2 id="accuracy-title">
          <span className="step-number">3</span> Accuracy
        </h2>
        <p className="muted">
          Based on {metrics.hours} delivery hours with a forecast and an actual · {metrics.missing} missing
        </p>
      </div>
      <p className="lead">
        How far off was the forecast available at the deadline, and in which direction? Error = forecast − actual, so a
        positive error or bias means the forecast was too high: less wind arrived than planned.
      </p>

      <div className="kpis five">
        <Kpi
          label="Average error size (MAE)"
          value={formatMW(metrics.mae)}
          note="Typical miss per hour, in either direction"
          whole={whole(reference?.mae ?? null, formatMW)}
        />
        <Kpi
          label="RMSE"
          value={formatMW(metrics.rmse)}
          note="Squares each error, so large misses weigh more"
          whole={whole(reference?.rmse ?? null, formatMW)}
        />
        <Kpi
          label="Bias"
          value={signed(metrics.bias)}
          note={`Forecast too high in ${tooHigh} of ${errors.length} hours${
            errors.length ? ` (${Math.round((100 * tooHigh) / errors.length)}%)` : ""
          }`}
          whole={whole(reference?.bias ?? null, signed)}
        />
        <Kpi
          label="Historical overforecast buffer"
          value={formatMW(metrics.p90)}
          note="90th percentile error: planning this far below the forecast would have covered about 9 in 10 of these hours"
          whole={whole(reference?.p90 ?? null, formatMW)}
        />
        <Kpi
          label="Largest overforecast"
          value={signed(metrics.max_error)}
          note={worst ? formatDayTime(worst.start_time) : "–"}
          whole={whole(reference?.max_error ?? null, signed)}
        />
      </div>

      <div className="charts">
        <figure>
          <figcaption>Error by delivery day</figcaption>
          <EChart option={daily} height={280} label="Daily bias and mean absolute error" />
        </figure>
        <figure>
          <figcaption>Error by how far ahead the forecast was published</figcaption>
          <EChart option={byLead} height={280} label="Mean absolute error and bias by forecast lead time" />
          <p className="note">
            Every forecast for the selected hours, not only the one used at the deadline.
            {used && ` Darker bars: lead times of the forecast used at the deadline (${formatHours(used[0])}–${formatHours(used[1])} h).`}
          </p>
        </figure>
      </div>

      <p className="note">
        Definitions: MAE = mean of |forecast − actual|; RMSE = √(mean of (forecast − actual)²); bias = mean of (forecast −
        actual); historical overforecast buffer = 90th percentile of (forecast − actual), linearly interpolated. All are
        calculated by the API over the selected hours; the buffer is one-sided and historical, not a guarantee for future
        hours.
      </p>
    </section>
  );
}
