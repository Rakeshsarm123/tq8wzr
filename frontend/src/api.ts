// Mirrors the dataclasses in backend/app/analysis.py. Times are ISO-8601 UTC; days are UK delivery days.

export interface Metrics {
  hours: number;
  missing: number;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  p10: number | null;
  p90: number | null;
  max_error: number | null;
  min_error: number | null;
  forecast_mean: number | null;
  actual_mean: number | null;
}

export interface DayResult {
  day: string;
  deadline: string;
  publish_time: string | null;
  next_publish_time: string | null;
  metrics: Metrics;
}

export interface HourResult {
  start_time: string;
  publish_time: string | null;
  hours_ahead: number | null;
  forecast: number | null;
  actual: number | null;
  error: number | null;
  latest_publish_time: string | null;
  latest_forecast: number | null;
}

export interface LeadTimeResult {
  from_hours: number;
  to_hours: number;
  comparisons: number;
  mae: number | null;
  bias: number | null;
}

export interface Dashboard {
  deadline: string;
  days: DayResult[];
  hours: HourResult[];
  metrics: Metrics;
  lead_times: LeadTimeResult[];
}

export interface DashboardQuery {
  start?: string;
  end?: string;
  deadline?: string;
}

export async function fetchDashboard(query: DashboardQuery, signal?: AbortSignal): Promise<Dashboard> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const response = await fetch(`/api/dashboard?${params}`, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.detail === "string" ? body.detail : `Request failed (${response.status})`);
  }
  return response.json();
}
