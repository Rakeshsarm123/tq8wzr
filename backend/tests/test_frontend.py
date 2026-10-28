from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import router, serve_frontend


def client_for(build: Path) -> TestClient:
    api = FastAPI()
    api.include_router(router)
    serve_frontend(api, build)
    return TestClient(api)


def fake_build(directory: Path) -> Path:
    (directory / "assets").mkdir()
    (directory / "index.html").write_text('<script type="module" src="/assets/index-abc123.js"></script>')
    (directory / "assets" / "index-abc123.js").write_text("console.log('windlens');")
    (directory / "assets" / "index-abc123.css").write_text("body { margin: 0; }")
    return directory


def test_serves_the_dashboard_page(tmp_path):
    page = client_for(fake_build(tmp_path)).get("/")
    assert page.status_code == 200
    assert "/assets/index-abc123.js" in page.text


def test_serves_the_hashed_assets_with_browser_friendly_types(tmp_path):
    client = client_for(fake_build(tmp_path))
    script = client.get("/assets/index-abc123.js")
    style = client.get("/assets/index-abc123.css")
    assert script.status_code == 200 and "javascript" in script.headers["content-type"]
    assert style.status_code == 200 and "text/css" in style.headers["content-type"]


def test_api_routes_take_precedence_over_the_dashboard(tmp_path):
    client = client_for(fake_build(tmp_path))
    assert client.get("/api/health").json() == {"status": "ok"}
    body = client.get("/api/dashboard", params={"start": "2026-01-28", "end": "2026-01-28"}).json()
    assert body["metrics"]["hours"] == 24


def test_without_a_build_only_the_api_is_served(tmp_path):
    client = client_for(tmp_path)
    assert client.get("/").status_code == 404
    assert client.get("/api/health").status_code == 200


def test_unknown_paths_are_not_found(tmp_path):
    assert client_for(fake_build(tmp_path)).get("/no-such-page").status_code == 404
