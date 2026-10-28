import type { Dashboard, DayResult } from "../api";
import {
  daysBetween,
  formatDay,
  formatDayTime,
  formatDuration,
  formatHours,
  formatMW,
  formatTime,
  minutesBetween,
  ukDate,
} from "../format";

interface Group {
  label: string;
  days: DayResult[];
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function relativeDay(iso: string, deliveryDay: string): string {
  const before = daysBetween(ukDate(iso), deliveryDay);
  if (before === 0) return "delivery day";
  return before === 1 ? "day before" : `${before} days before`;
}

function groupDays(days: DayResult[], timeOf: (day: DayResult) => string | null): Group[] {
  const groups = new Map<string, DayResult[]>();
  for (const day of days) {
    const iso = timeOf(day);
    const label = iso ? `${formatTime(iso)}, ${relativeDay(iso, day.day)}` : "None in the data";
    groups.set(label, [...(groups.get(label) ?? []), day]);
  }
  return [...groups].map(([label, members]) => ({ label, days: members })).sort((a, b) => b.days.length - a.days.length);
}

function range(values: number[]): [number, number] | null {
  return values.length ? [Math.min(...values), Math.max(...values)] : null;
}

function durationRange([low, high]: [number, number]): string {
  return low === high ? formatDuration(low) : `${formatDuration(low)} to ${formatDuration(high)}`;
}

function StepDetail({ groups, single, days }: { groups: Group[]; single: string | null; days: number }) {
  if (single) return <p>Published {formatDayTime(single)}</p>;
  if (groups.length === 1) return <p>Same on all {plural(days, "delivery day")}</p>;
  return (
    <ul className="groups">
      {groups.map(({ label, days: members }) => (
        <li key={label}>
          <strong>{label}</strong>: {plural(members.length, "day")}
          {members.length <= 3 && ` (${members.map((d) => formatDay(d.day)).join(", ")})`}
        </li>
      ))}
    </ul>
  );
}

export function ForecastOverview({ dashboard }: { dashboard: Dashboard }) {
  const { days, hours } = dashboard;
  const single = days.length === 1 ? days[0] : null;
  const used = groupDays(days, (d) => d.publish_time);
  const next = groupDays(days, (d) => d.next_publish_time);
  const usedBefore = range(days.flatMap((d) => (d.publish_time ? [minutesBetween(d.publish_time, d.deadline)] : [])));
  const nextAfter = range(
    days.flatMap((d) => (d.next_publish_time ? [minutesBetween(d.deadline, d.next_publish_time)] : [])),
  );
  const forecasts = hours.flatMap((h) => (h.forecast === null ? [] : [h.forecast]));
  const averageForecast = forecasts.length ? forecasts.reduce((sum, v) => sum + v, 0) / forecasts.length : null;
  const ahead = range(hours.flatMap((h) => (h.hours_ahead === null ? [] : [h.hours_ahead])));

  return (
    <section className="card" aria-labelledby="overview-title">
      <h2 id="overview-title">
        <span className="step-number">1</span> Forecast overview
      </h2>
      <p className="lead">
        What the buyer could see at the order deadline. No hindsight here: outcomes are compared in the next sections.
      </p>

      <div className="timeline">
        <article className="step used">
          <p className="kicker">Forecast used</p>
          <p className="title">{used.length === 1 ? used[0].label : "Varies by day"}</p>
          <StepDetail groups={used} single={single?.publish_time ?? null} days={days.length} />
          {usedBefore && <p className="muted">{durationRange(usedBefore)} before the deadline</p>}
        </article>
        <span className="arrow" aria-hidden="true">
          →
        </span>
        <article className="step deadline">
          <p className="kicker">Order deadline</p>
          <p className="title">{dashboard.deadline.slice(0, 5)}, day before</p>
          <p>UK time. Forecasts published at or after the deadline are too late to use.</p>
        </article>
        <span className="arrow" aria-hidden="true">
          →
        </span>
        <article className="step late">
          <p className="kicker">Next forecast</p>
          <p className="title">{next.length === 1 ? next[0].label : "Varies by day"}</p>
          <StepDetail groups={next} single={single?.next_publish_time ?? null} days={days.length} />
          {nextAfter && (
            <p className="muted">
              {nextAfter[1] === 0 ? "Exactly at the deadline" : `${durationRange(nextAfter)} after the deadline`}: too
              late to use
            </p>
          )}
        </article>
      </div>

      <div className="kpis">
        <div className="kpi">
          <p className="kicker">Average forecast wind</p>
          <p className="value">{formatMW(averageForecast)}</p>
          <p className="muted">across {plural(forecasts.length, "delivery hour")}</p>
        </div>
        <div className="kpi">
          <p className="kicker">Forecast made</p>
          <p className="value">{ahead ? `${formatHours(ahead[0])}–${formatHours(ahead[1])} h` : "–"}</p>
          <p className="muted">before each delivery hour</p>
        </div>
        <div className="kpi">
          <p className="kicker">Delivery days</p>
          <p className="value">{days.length}</p>
          <p className="muted">
            {formatDay(days[0].day)}
            {days.length > 1 && ` – ${formatDay(days[days.length - 1].day)}`}
          </p>
        </div>
      </div>
    </section>
  );
}
