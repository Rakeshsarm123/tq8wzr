"""WindLens API: dashboard numbers for any range of delivery days and any order deadline."""

from datetime import date, time

from fastapi import FastAPI, HTTPException

from .analysis import UK, Analysis, analyse
from .data_store import load

DATA = load()
FIRST_DAY = min(DATA.actuals).astimezone(UK).date()
LAST_DAY = max(DATA.actuals).astimezone(UK).date()

app = FastAPI(title="WindLens API")


@app.get("/api/dashboard")
def dashboard(start: date = FIRST_DAY, end: date = LAST_DAY, deadline: time = time(9, 20)) -> Analysis:
    """Forecast available at the deadline (UK time, day before delivery) vs actual wind, with accuracy metrics."""
    if not FIRST_DAY <= start <= end <= LAST_DAY:
        raise HTTPException(status_code=422, detail=f"Choose delivery days between {FIRST_DAY} and {LAST_DAY}.")
    return analyse(DATA, start, end, deadline)
