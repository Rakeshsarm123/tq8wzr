import { useEffect, useState } from "react";
import { fetchDashboard, type Dashboard, type DashboardQuery, type Metrics } from "./api";
import { Controls, type Selection } from "./components/Controls";
import { ForecastOverview } from "./components/ForecastOverview";
import { ForecastVsActual } from "./components/ForecastVsActual";
import { addDays, formatDate } from "./format";

interface Period {
  first: string;
  last: string;
}

export default function App() {
  const [query, setQuery] = useState<DashboardQuery>({});
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [period, setPeriod] = useState<Period | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reference, setReference] = useState<{ deadline: string; metrics: Metrics } | null>(null);

  // Whole-period errors at the same deadline: the historical range drawn in Section 2.
  useEffect(() => {
    const controller = new AbortController();
    fetchDashboard({ deadline: query.deadline }, controller.signal)
      .then((data) => setReference({ deadline: data.deadline, metrics: data.metrics }))
      .catch(() => {
        if (!controller.signal.aborted) setReference(null);
      });
    return () => controller.abort();
  }, [query.deadline]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetchDashboard(query, controller.signal)
      .then((data) => {
        setDashboard(data);
        setError(null);
        // The first, unfiltered response defines the whole period the data covers.
        setPeriod((known) => known ?? { first: data.days[0].day, last: data.days[data.days.length - 1].day });
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query]);

  if (!dashboard || !period) {
    return <p className="state">{error ?? "Loading wind data…"}</p>;
  }

  const change = (update: Partial<Selection>) => setQuery((current) => ({ ...current, ...update }));

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="logo">WindLens</span>
          <span className="tagline">Wind Forecast Intelligence</span>
        </div>
        <p className="scope">
          Orders placed {formatDate(addDays(period.first, -1))} – {formatDate(addDays(period.last, -1))} · deliveries{" "}
          {formatDate(period.first)} – {formatDate(period.last)}
        </p>
      </header>
      <main className="page">
        <Controls
          period={period}
          start={query.start ?? period.first}
          end={query.end ?? period.last}
          deadline={query.deadline ?? dashboard.deadline.slice(0, 5)}
          loading={loading}
          onChange={change}
        />
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <ForecastOverview dashboard={dashboard} />
        <ForecastVsActual
          dashboard={dashboard}
          reference={reference?.deadline === dashboard.deadline ? reference.metrics : null}
        />
      </main>
      <footer className="footer">
        Data: Elexon BMRS. Wind forecasts (WINDFOR) are hourly; actual wind generation (FUELHH) is half-hourly and
        averaged to hourly for comparison.
      </footer>
    </>
  );
}
