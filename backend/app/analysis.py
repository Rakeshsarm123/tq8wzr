"""WindLens core rules: which forecast the buyer had at the order deadline, and how accurate it was."""

from bisect import bisect_left
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from math import sqrt
from statistics import fmean, quantiles
from zoneinfo import ZoneInfo

UK = ZoneInfo("Europe/London")
HOUR = timedelta(hours=1)
LEAD_TIME_BUCKETS = ((0, 6), (6, 12), (12, 24), (24, 36), (36, 48), (48, 72))


@dataclass
class WindData:
    runs: dict[datetime, dict[datetime, float]]  # publish time -> {hour start: forecast MW}
    actuals: dict[datetime, float]  # half-hour start -> actual MW
    run_times: list[datetime] = field(init=False)

    def __post_init__(self) -> None:
        self.run_times = sorted(self.runs)

    # "Before" is strict: a run published exactly at the deadline is too late to act on.
    def latest_run_before(self, moment: datetime) -> datetime | None:
        i = bisect_left(self.run_times, moment)
        return self.run_times[i - 1] if i else None

    def first_run_from(self, moment: datetime) -> datetime | None:
        i = bisect_left(self.run_times, moment)
        return self.run_times[i] if i < len(self.run_times) else None

    def latest_forecast_before(self, hour: datetime) -> tuple[datetime, float] | None:
        i = bisect_left(self.run_times, hour)
        for publish_time in reversed(self.run_times[:i]):
            if hour in self.runs[publish_time]:
                return publish_time, self.runs[publish_time][hour]
        return None


@dataclass(frozen=True)
class HourResult:
    start_time: datetime
    publish_time: datetime | None  # forecast run available at the deadline
    hours_ahead: float | None
    forecast: float | None
    actual: float | None
    error: float | None  # forecast - actual: positive means the forecast was too high
    latest_publish_time: datetime | None  # newest run published before the hour itself
    latest_forecast: float | None


@dataclass(frozen=True)
class Metrics:
    hours: int
    missing: int
    mae: float | None = None
    rmse: float | None = None
    bias: float | None = None
    p10: float | None = None
    p90: float | None = None  # safety margin: planning for this much less wind covers 9 hours in 10
    max_error: float | None = None
    min_error: float | None = None
    forecast_mean: float | None = None
    actual_mean: float | None = None


@dataclass(frozen=True)
class DayResult:
    day: date
    deadline: datetime
    publish_time: datetime | None
    next_publish_time: datetime | None  # first run published at or after the deadline: too late to use
    metrics: Metrics


@dataclass(frozen=True)
class LeadTimeResult:
    from_hours: int
    to_hours: int
    comparisons: int
    mae: float | None
    bias: float | None


@dataclass(frozen=True)
class Analysis:
    deadline: time
    days: list[DayResult]
    hours: list[HourResult]
    metrics: Metrics
    lead_times: list[LeadTimeResult]


def deadline_for(day: date, deadline: time) -> datetime:
    """Orders for delivery `day` close at `deadline` UK time on the day before."""
    return datetime.combine(day - timedelta(days=1), deadline, UK).astimezone(UTC)


def delivery_hours(day: date) -> list[datetime]:
    start = datetime.combine(day, time(0), UK).astimezone(UTC)
    end = datetime.combine(day + timedelta(days=1), time(0), UK).astimezone(UTC)
    return [start + i * HOUR for i in range((end - start) // HOUR)]


def summarise(rows: list[HourResult]) -> Metrics:
    pairs = [(r.forecast, r.actual) for r in rows if r.forecast is not None and r.actual is not None]
    if not pairs:
        return Metrics(hours=0, missing=len(rows))
    errors = [forecast - actual for forecast, actual in pairs]
    deciles = quantiles(errors, n=10, method="inclusive")
    return Metrics(
        hours=len(pairs),
        missing=len(rows) - len(pairs),
        mae=fmean(abs(e) for e in errors),
        rmse=sqrt(fmean(e * e for e in errors)),
        bias=fmean(errors),
        p10=deciles[0],
        p90=deciles[-1],
        max_error=max(errors),
        min_error=min(errors),
        forecast_mean=fmean(forecast for forecast, _ in pairs),
        actual_mean=fmean(actual for _, actual in pairs),
    )


def error_by_lead_time(data: WindData, hours: set[datetime]) -> list[LeadTimeResult]:
    errors: dict[tuple[int, int], list[float]] = {bucket: [] for bucket in LEAD_TIME_BUCKETS}
    for publish_time, run in data.runs.items():
        for hour, forecast in run.items():
            actual = data.actuals.get(hour)
            if hour not in hours or actual is None:
                continue
            lead = (hour - publish_time) / HOUR
            # Runs also repeat hours that had already passed (negative lead); no bucket accepts those.
            for low, high in LEAD_TIME_BUCKETS:
                if low <= lead < high:
                    errors[(low, high)].append(forecast - actual)
    return [
        LeadTimeResult(
            from_hours=low,
            to_hours=high,
            comparisons=len(bucket),
            mae=fmean(abs(e) for e in bucket) if bucket else None,
            bias=fmean(bucket) if bucket else None,
        )
        for (low, high), bucket in errors.items()
    ]


def analyse(data: WindData, first_day: date, last_day: date, deadline: time) -> Analysis:
    days: list[DayResult] = []
    hours: list[HourResult] = []
    for offset in range((last_day - first_day).days + 1):
        day = first_day + timedelta(days=offset)
        cutoff = deadline_for(day, deadline)
        publish_time = data.latest_run_before(cutoff)
        run = data.runs[publish_time] if publish_time else {}
        day_hours = [_hour_result(data, hour, publish_time, run) for hour in delivery_hours(day)]
        days.append(DayResult(day, cutoff, publish_time, data.first_run_from(cutoff), summarise(day_hours)))
        hours.extend(day_hours)
    lead_times = error_by_lead_time(data, {h.start_time for h in hours})
    return Analysis(deadline, days, hours, summarise(hours), lead_times)


def _hour_result(
    data: WindData, hour: datetime, publish_time: datetime | None, run: dict[datetime, float]
) -> HourResult:
    forecast = run.get(hour)
    actual = data.actuals.get(hour)
    latest = data.latest_forecast_before(hour)
    return HourResult(
        start_time=hour,
        publish_time=publish_time,
        hours_ahead=(hour - publish_time) / HOUR if publish_time else None,
        forecast=forecast,
        actual=actual,
        error=forecast - actual if forecast is not None and actual is not None else None,
        latest_publish_time=latest[0] if latest else None,
        latest_forecast=latest[1] if latest else None,
    )
