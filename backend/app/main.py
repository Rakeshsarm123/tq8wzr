"""WindLens API and, once built, the dashboard: both served from one address."""

from datetime import date, time
from pathlib import Path

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from .analysis import UK, Analysis, analyse
from .data_store import load

DATA = load()
FIRST_DAY = min(DATA.actuals).astimezone(UK).date()
LAST_DAY = max(DATA.actuals).astimezone(UK).date()
FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/dashboard")
def dashboard(start: date = FIRST_DAY, end: date = LAST_DAY, deadline: time = time(9, 20)) -> Analysis:
    """Forecast available at the deadline (UK time, day before delivery) vs actual wind, with accuracy metrics."""
    if not (FIRST_DAY <= start <= LAST_DAY and FIRST_DAY <= end <= LAST_DAY):
        raise HTTPException(status_code=422, detail=f"Choose delivery days between {FIRST_DAY} and {LAST_DAY}.")
    if start > end:
        raise HTTPException(status_code=422, detail="The first delivery day must be on or before the last one.")
    return analyse(DATA, start, end, deadline)


def serve_frontend(api: FastAPI, directory: Path) -> None:
    """Serve the built dashboard (index.html and its /assets files) if it has been built."""
    if (directory / "index.html").is_file():
        # Mounted after the API routes, so /api/... is never shadowed by the catch-all "/" mount.
        api.mount("/", StaticFiles(directory=directory, html=True), name="dashboard")


app = FastAPI(title="WindLens API")
app.include_router(router)
serve_frontend(app, FRONTEND_DIST)
