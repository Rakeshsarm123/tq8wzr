import { useMemo, useState } from "react";
import type { Dashboard, Metrics } from "../api";
import { formatDayTime, formatHours, formatMW, formatPrecise, formatSignedPrecise } from "../format";
import { filterRows, sortRows, toCsv, type Filter, type Sort, type SortKey } from "../hourlyTable";

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "start_time", label: "Delivery hour (UK)", numeric: false },
  { key: "publish_time", label: "Forecast published (UK)", numeric: false },
  { key: "hours_ahead", label: "Hours ahead", numeric: true },
  { key: "forecast", label: "Forecast (MW)", numeric: true },
  { key: "actual", label: "Actual, hourly avg (MW)", numeric: true },
  { key: "error", label: "Error = forecast − actual (MW)", numeric: true },
];

const Missing = () => <span className="missing">missing</span>;

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function HourlyDetails({ dashboard, reference }: { dashboard: Dashboard; reference: Metrics | null }) {
  const [sort, setSort] = useState<Sort>({ key: "start_time", descending: false });
  const [filter, setFilter] = useState<Filter>("all");
  const buffer = reference?.p90 ?? null;
  const rows = useMemo(
    () => sortRows(filterRows(dashboard.hours, filter, buffer), sort),
    [dashboard.hours, filter, buffer, sort],
  );

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "All hours" },
    { value: "over", label: "Forecast too high (error > 0)" },
    { value: "under", label: "Forecast too low (error < 0)" },
    ...(buffer === null
      ? []
      : [{ value: "beyond" as const, label: `Shortfall beyond the historical buffer (error > ${formatMW(buffer)})` }]),
    { value: "missing", label: "Missing forecast or actual" },
  ];

  // Errors open largest-first, which is how a buyer investigates misses; other columns open ascending.
  const toggle = (key: SortKey) =>
    setSort((current) => ({ key, descending: current.key === key ? !current.descending : key === "error" }));

  const exportCsv = () => {
    const { days, deadline } = dashboard;
    const range = `${days[0].day}_to_${days[days.length - 1].day}`;
    download(`windlens_${range}_deadline-${deadline.slice(0, 5).replace(":", "")}_${filter}.csv`, toCsv(rows));
  };

  return (
    <section className="card" aria-labelledby="details-title">
      <h2 id="details-title">
        <span className="step-number">4</span> Hourly details
      </h2>
      <p className="lead">
        Every delivery hour with the forecast used at the deadline: the same rows behind the chart and the metrics.
      </p>

      <div className="table-tools">
        <label>
          Show{" "}
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            {filters.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <span className="muted" aria-live="polite">
          {rows.length} of {dashboard.hours.length} hours
        </span>
        <button type="button" className="chip" onClick={exportCsv} disabled={rows.length === 0}>
          Download CSV
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  className={column.numeric ? "num" : undefined}
                  aria-sort={sort.key === column.key ? (sort.descending ? "descending" : "ascending") : "none"}
                >
                  <button type="button" onClick={() => toggle(column.key)}>
                    {column.label}
                    <span aria-hidden="true">{sort.key === column.key ? (sort.descending ? " ▼" : " ▲") : ""}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.start_time}>
                <td>{formatDayTime(h.start_time)}</td>
                <td>{h.publish_time ? formatDayTime(h.publish_time) : <Missing />}</td>
                <td className="num">{h.hours_ahead === null ? <Missing /> : formatHours(h.hours_ahead)}</td>
                <td className="num">{h.forecast === null ? <Missing /> : formatPrecise(h.forecast)}</td>
                <td className="num">{h.actual === null ? <Missing /> : formatPrecise(h.actual)}</td>
                <td className={`num ${h.error === null ? "" : h.error > 0 ? "over" : h.error < 0 ? "under" : ""}`}>
                  {h.error === null ? <Missing /> : formatSignedPrecise(h.error)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="empty">
                  No hours match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="note">
        Error = forecast − actual. <span className="over">Positive (red)</span>: the forecast was too high, so less wind
        arrived than planned. <span className="under">Negative (blue)</span>: more wind arrived than forecast. Actual is
        the average of the hour's two half-hourly values. Click a column header to sort.
      </p>
    </section>
  );
}
