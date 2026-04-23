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
    # Force PyMuPDF-only so the test doesn't hit Opus Vision.
    response = client.get("/api/testfit/fixture?use_vision=false")
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
    client.get("/api/testfit/fixture?use_vision=false")
    assert fixture.exists()
    assert fixture.stat().st_size > 1000


def test_testfit_sample_returns_saved_lumen_run() -> None:
    """Cold-start demo fallback: /api/testfit/sample must return the saved
    3-variant + 3-reviewer fixture so Justify + Export have content even if
    the judge hasn't run Test Fit first.
    """

    client = TestClient(app)
    response = client.get("/api/testfit/sample")
    assert response.status_code == 200
    payload = response.json()
    assert "floor_plan" in payload
    assert "variants" in payload
    assert "verdicts" in payload
    assert len(payload["variants"]) == 3
    assert len(payload["verdicts"]) == 3
    styles = {v["style"] for v in payload["variants"]}
    assert styles == {"villageois", "atelier", "hybride_flex"}


# iter-21a (Saad, 2026-04-24) — Parti Pris Proposer regression


def test_parti_pris_to_directive_text_renders_full_payload() -> None:
    """iter-21a fix for "variants feel random" : the proposer output
    must splice into the variant generator's user template as a
    well-formed directive block (TITLE / ONE-LINE / DIRECTIVE /
    SIGNATURE MOVES / TRADE-OFF)."""

    from app.surfaces.testfit import _parti_pris_to_directive_text

    payload = {
        "id": "crit_pit_core",
        "title": "Crit pit at the heart",
        "one_line": "A stepped amphitheatre anchors the studio around peer review.",
        "directive": "Central stepped crit pit ; library ring on the north ; focus ateliers on the east / west façades.",
        "signature_moves": ["Stepped crit pit", "Material library ring", "Focus ateliers of 6"],
        "trade_off": "Fewer private focus rooms ; deep solo work moves to booths.",
        "style_classification": "villageois",
    }
    txt = _parti_pris_to_directive_text(payload)
    assert "TITLE : Crit pit at the heart" in txt
    assert "ONE-LINE :" in txt
    assert "DIRECTIVE :" in txt
    assert "- Stepped crit pit" in txt
    assert "TRADE-OFF :" in txt


def test_parti_pris_to_directive_text_handles_minimal_payload() -> None:
    """When the proposer omits fields, the renderer must not crash and
    must return a non-empty string so the variant generator always
    sees *something*."""

    from app.surfaces.testfit import _parti_pris_to_directive_text

    txt = _parti_pris_to_directive_text({"title": "Minimal"})
    assert "TITLE : Minimal" in txt
    assert txt.strip() != ""


def test_fallback_parti_pris_directive_covers_all_styles() -> None:
    """Fallback branch (no brief, or proposer failure) must have a
    directive for every VariantStyle so the surface never crashes."""

    from app.models import VariantStyle
    from app.surfaces.testfit import _fallback_parti_pris_directive

    for style in VariantStyle:
        txt = _fallback_parti_pris_directive(style)
        assert "TITLE :" in txt
        assert "DIRECTIVE :" in txt
        assert "TRADE-OFF :" in txt


def test_testfit_request_accepts_brief_and_industry() -> None:
    """New iter-21a fields on the HTTP payload must round-trip."""

    from app.main import TestFitGenerateRequest
    from app.models import FloorPlan

    # Use the existing Lumen fixture for a valid FloorPlan.
    client = TestClient(app)
    resp = client.get("/api/testfit/fixture?use_vision=false")
    assert resp.status_code == 200
    plan = FloorPlan.model_validate(resp.json())

    req = TestFitGenerateRequest(
        floor_plan=plan,
        programme_markdown="## 1. Postes\n120 desks.",
        client_name="Nordlight Studio",
        brief="Creative agency in Oslo, 40 people, wants a central crit pit.",
        client_industry="creative_agency",
    )
    assert req.brief.startswith("Creative")
    assert req.client_industry == "creative_agency"


def test_parti_pris_proposer_prompt_exists_and_mentions_brief() -> None:
    """The new system prompt shipped for the Proposer must be on disk
    and reference the core inputs — otherwise the agent would hallucinate."""

    path = (
        Path(__file__).resolve().parent.parent
        / "app"
        / "prompts"
        / "agents"
        / "testfit_parti_pris_proposer.md"
    )
    assert path.exists(), "testfit_parti_pris_proposer.md is required for iter-21a"
    content = path.read_text(encoding="utf-8")
    # Non-negotiable : the prompt must pull on the brief AND force 3
    # outputs AND demand project-specificity.
    assert "brief" in content.lower()
    assert "three" in content.lower() or "3" in content
    assert "project-specific" in content.lower() or "tailored" in content.lower()
