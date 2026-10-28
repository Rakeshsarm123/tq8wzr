from datetime import UTC, date, datetime, time

import pytest

from app.analysis import HourResult, WindData, analyse, deadline_for, summarise

DAY = date(2026, 1, 15)
NOON_15_JAN = datetime(2026, 1, 15, 12, tzinfo=UTC)
HALF_PAST_NOON = datetime(2026, 1, 15, 12, 30, tzinfo=UTC)


def utc(day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 1, day, hour, minute, tzinfo=UTC)


@pytest.fixture
def data() -> WindData:
    return WindData(
        runs={
            utc(14, 7, 30): {NOON_15_JAN: 11_000},
            utc(14, 9, 30): {NOON_15_JAN: 10_000},
            utc(15, 11, 30): {NOON_15_JAN: 9_800},
            utc(15, 22, 30): {NOON_15_JAN: 9_750},  # published after the hour had passed
        },
        actuals={NOON_15_JAN: 9_600, HALF_PAST_NOON: 9_800},  # hourly average: 9,700
    )


def noon(data: WindData, deadline: time = time(9, 20)) -> HourResult:
    result = analyse(data, DAY, DAY, deadline)
    return next(h for h in result.hours if h.start_time == NOON_15_JAN)


def with_errors(*errors: float) -> list[HourResult]:
    return [HourResult(NOON_15_JAN, None, None, 10_000 + e, 10_000, e, None, None) for e in errors]


def test_deadline_is_uk_time_on_the_day_before():
    assert deadline_for(DAY, time(9, 20)) == utc(14, 9, 20)


def test_deadline_follows_uk_summer_time():
    assert deadline_for(date(2026, 7, 15), time(9, 20)) == datetime(2026, 7, 14, 8, 20, tzinfo=UTC)


def test_uses_newest_forecast_published_before_the_deadline(data):
    row = noon(data)
    assert row.publish_time == utc(14, 7, 30)
    assert (row.forecast, row.hours_ahead) == (11_000, 28.5)


def test_later_deadline_picks_a_newer_forecast(data):
    assert noon(data, time(15, 30)).publish_time == utc(14, 9, 30)


def test_forecast_published_exactly_at_the_deadline_is_too_late(data):
    assert noon(data, time(9, 30)).publish_time == utc(14, 7, 30)


def test_error_is_forecast_minus_actual(data):
    assert noon(data).error == 1_300


def test_hourly_actual_is_the_average_of_both_half_hours_not_the_sum(data):
    assert noon(data).actual == 9_700


def test_hour_missing_a_half_hour_is_reported_missing(data):
    del data.actuals[HALF_PAST_NOON]
    metrics = analyse(data, DAY, DAY, time(9, 20)).metrics
    assert (noon(data).actual, metrics.hours, metrics.missing) == (None, 0, 24)


def test_latest_forecast_ignores_runs_published_after_the_hour(data):
    row = noon(data)
    assert (row.latest_publish_time, row.latest_forecast) == (utc(15, 11, 30), 9_800)


def test_day_reports_the_first_forecast_that_arrived_too_late(data):
    day = analyse(data, DAY, DAY, time(9, 20)).days[0]
    assert day.next_publish_time == utc(14, 9, 30)


def test_missing_values_are_counted_not_treated_as_zero(data):
    metrics = analyse(data, DAY, DAY, time(9, 20)).metrics
    assert (metrics.hours, metrics.missing, metrics.mae) == (1, 23, 1_300)


def test_metrics_on_known_errors():
    metrics = summarise(with_errors(100, -100, 300, -300))
    assert (metrics.mae, metrics.bias) == (200, 0)
    assert metrics.rmse == pytest.approx(223.607, abs=0.001)


def test_safety_margin_is_the_90th_percentile_error():
    metrics = summarise(with_errors(*range(10, 101, 10)))
    assert (metrics.p10, metrics.p90) == (19, 91)


def test_lead_time_groups_forecasts_by_hours_ahead(data):
    buckets = {(b.from_hours, b.to_hours): b for b in analyse(data, DAY, DAY, time(9, 20)).lead_times}
    assert (buckets[(24, 36)].comparisons, buckets[(24, 36)].mae) == (2, 800)
    assert (buckets[(0, 6)].comparisons, buckets[(0, 6)].mae) == (1, 100)
    assert sum(b.comparisons for b in buckets.values()) == 3
