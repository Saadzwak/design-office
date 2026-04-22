from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.models import FloorPlan


def test_testfit_catalog_lists_40_plus_items() -> None:
    client = TestClient(app)
    response = client.get("/api/testfit/catalog")
    assert response.status_code == 200
    payload = response.json()
    assert payload["version"].startswith("2026-04-22")
    assert payload["count"] >= 40


def test_testfit_fixture_returns_lumen_floorplan() -> None:
    client = TestClient(app)
    response = client.get("/api/testfit/fixture")
    assert response.status_code == 200
    plan = FloorPlan.model_validate(response.json())
    assert plan.name == "Lumen plateau (fixture)"
    # 60 m × 40 m = 2400 m² plate.
    assert 2300 < plan.computed_area_m2() < 2500
    assert len(plan.columns) >= 50  # 9×6 grid = 54
    assert len(plan.cores) >= 2
    assert len(plan.stairs) == 1
    assert any(w.facade == "south" for w in plan.windows)
    assert any(w.facade == "north" for w in plan.windows)


def test_fixture_pdf_is_generated() -> None:
    fixture = Path(__file__).resolve().parent.parent / "app" / "data" / "fixtures" / "lumen_plan.pdf"
    # The fixture endpoint regenerates on demand; hit it to guarantee presence.
    client = TestClient(app)
    client.get("/api/testfit/fixture")
    assert fixture.exists()
    assert fixture.stat().st_size > 1000
