from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_defaults_to_every_delivery_day_and_the_0920_deadline():
    body = client.get("/api/dashboard").json()
    assert (len(body["days"]), body["metrics"]["hours"], body["deadline"]) == (31, 744, "09:20:00")


def test_a_later_deadline_uses_a_fresher_forecast():
    params = {"start": "2026-01-28", "end": "2026-01-28", "deadline": "15:30"}
    body = client.get("/api/dashboard", params=params).json()
    noon = next(h for h in body["hours"] if h["start_time"].startswith("2026-01-28T12:00"))
    # The 15:30 run lands exactly at the deadline, so the 11:30 one is the newest usable forecast.
    assert datetime.fromisoformat(noon["publish_time"]) == datetime(2026, 1, 27, 11, 30, tzinfo=UTC)
    assert noon["error"] == 1_572.5


def test_rejects_days_outside_the_data():
    assert client.get("/api/dashboard", params={"start": "2025-12-01"}).status_code == 422
