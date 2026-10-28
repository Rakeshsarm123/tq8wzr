"""Loads the forecast and actual wind data saved by scripts/fetch_data.py."""

import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from .analysis import WindData

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def _records(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))["records"]


def load(data_dir: Path = DATA_DIR) -> WindData:
    runs: defaultdict[datetime, dict[datetime, float]] = defaultdict(dict)
    for record in _records(data_dir / "forecasts.json"):
        publish_time = datetime.fromisoformat(record["publishTime"])
        runs[publish_time][datetime.fromisoformat(record["startTime"])] = float(record["generation"])
    actuals = {
        datetime.fromisoformat(record["startTime"]): float(record["generation"])
        for record in _records(data_dir / "actuals.json")
    }
    return WindData(runs=dict(runs), actuals=actuals)
