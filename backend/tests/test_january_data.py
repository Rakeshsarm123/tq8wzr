from datetime import UTC, date, datetime, time, timedelta

import pytest

from app.analysis import Analysis, HourResult, analyse
from app.data_store import load


@pytest.fixture(scope="module")
def january() -> Analysis:
    return analyse(load(), date(2026, 1, 2), date(2026, 2, 1), time(9, 20))


def hour(result: Analysis, iso_time: str) -> HourResult:
    start = datetime.fromisoformat(iso_time)
    return next(h for h in result.hours if h.start_time == start)


def test_every_delivery_hour_has_a_forecast_and_an_actual(january):
    assert (january.metrics.hours, january.metrics.missing) == (744, 0)


def test_buyer_always_had_the_0730_forecast_from_the_day_before(january):
    for day in january.days:
        assert day.publish_time is not None and day.next_publish_time is not None
        assert day.publish_time == datetime.combine(day.day - timedelta(days=1), time(7, 30), UTC)
        assert day.next_publish_time - day.deadline == timedelta(minutes=10)


def test_15_jan_noon_matches_the_hand_checked_example(january):
    row = hour(january, "2026-01-15T12:00:00Z")
    assert row.publish_time == datetime(2026, 1, 14, 7, 30, tzinfo=UTC)
    assert (row.forecast, row.actual, row.error, row.hours_ahead) == (11_049, 9_742, 1_307, 28.5)


def test_28_jan_noon_was_the_big_miss(january):
    assert hour(january, "2026-01-28T12:00:00Z").error == 4_123


def test_latest_forecast_handles_the_missing_1130_run(january):
    # On 15 Jan the 11:30 run never came, and the 12:25 one arrived after noon.
    row = hour(january, "2026-01-15T12:00:00Z")
    assert row.latest_publish_time == datetime(2026, 1, 15, 9, 30, tzinfo=UTC)
    assert row.latest_forecast == 10_503


def test_headline_numbers(january):
    metrics = january.metrics
    assert metrics.mae == pytest.approx(2_022, abs=1)
    assert metrics.rmse == pytest.approx(2_497, abs=1)
    assert metrics.bias == pytest.approx(1_746, abs=1)
