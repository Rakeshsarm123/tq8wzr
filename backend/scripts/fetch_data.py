"""Download the wind forecasts (WINDFOR) and actual wind generation (FUELHH) used by WindLens.

Usage: python backend/scripts/fetch_data.py
"""

import json
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

API_BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
DATA_DIR = Path(__file__).resolve().parents[1] / "data"

# Orders placed 1-31 Jan 2026 are for delivery days 2 Jan - 1 Feb 2026.
DELIVERY_FIRST_DAY = "2026-01-02"
DELIVERY_LAST_DAY = "2026-02-01"

# Every run that could matter: from 31 Dec (for a midnight deadline on 1 Jan) to the end of 1 Feb.
FORECASTS_PUBLISHED_FROM = "2025-12-31T00:00:00Z"
FORECASTS_PUBLISHED_TO = "2026-02-02T00:00:00Z"


def fetch(dataset: str, params: dict[str, str]) -> tuple[str, list[dict]]:
    url = f"{API_BASE}/{dataset}/stream?{urlencode(params)}"
    with urlopen(Request(url, headers={"Accept": "application/json"}), timeout=120) as response:
        records = json.load(response)
    if not isinstance(records, list) or not records:
        raise RuntimeError(f"Unexpected response from {url}")
    return url, records


def save(filename: str, source_url: str, records: list[dict]) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / filename
    payload = {
        "source": source_url,
        "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "recordCount": len(records),
        "records": records,
    }
    path.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    return path


def summarise_forecasts(records: list[dict]) -> None:
    runs = sorted({r["publishTime"] for r in records})
    times_of_day = Counter(run[11:16] for run in runs)
    print(f"  {len(records)} hourly values from {len(runs)} forecast runs, published {runs[0]} to {runs[-1]}")
    print("  runs per time of day (UTC): " + ", ".join(f"{t} x{n}" for t, n in sorted(times_of_day.items())))


def summarise_actuals(records: list[dict]) -> None:
    starts = sorted({r["startTime"] for r in records})
    gaps = [
        f"{earlier} -> {later}"
        for earlier, later in zip(starts, starts[1:])
        if datetime.fromisoformat(later) - datetime.fromisoformat(earlier) != timedelta(minutes=30)
    ]
    duplicates = len(records) - len(starts)
    print(f"  {len(records)} half-hourly values ({duplicates} duplicates), {starts[0]} to {starts[-1]}")
    print(f"  gaps: {', '.join(gaps) or 'none'}")


def main() -> None:
    print("Fetching wind forecasts (WINDFOR)...")
    url, forecasts = fetch(
        "WINDFOR",
        {"publishDateTimeFrom": FORECASTS_PUBLISHED_FROM, "publishDateTimeTo": FORECASTS_PUBLISHED_TO},
    )
    print(f"  saved to {save('forecasts.json', url, forecasts)}")
    summarise_forecasts(forecasts)

    print("Fetching actual wind generation (FUELHH, fuelType=WIND)...")
    url, actuals = fetch(
        "FUELHH",
        {"settlementDateFrom": DELIVERY_FIRST_DAY, "settlementDateTo": DELIVERY_LAST_DAY, "fuelType": "WIND"},
    )
    if any(r.get("fuelType") != "WIND" for r in actuals):
        raise RuntimeError("FUELHH response contains non-wind rows")
    print(f"  saved to {save('actuals.json', url, actuals)}")
    summarise_actuals(actuals)


if __name__ == "__main__":
    main()
