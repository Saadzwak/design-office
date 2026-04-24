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


# iter-21c — Harden _strip_json against LLM JSON slip-ups


def test_strip_json_tolerates_trailing_commas() -> None:
    """Opus sometimes emits `[…, ]` or `{…, }`. The adjacency audit
    was going to score=0 whenever that happened on the Lovable plan."""

    import json as _json

    from app.surfaces.testfit import _strip_json

    raw = """```json
{
  "score": 70,
  "violations": [
    {"rule_id": "a"},
    {"rule_id": "b"},
  ],
  "recommendations": ["foo", "bar",],
}
```"""
    cleaned = _strip_json(raw)
    parsed = _json.loads(cleaned)
    assert parsed["score"] == 70
    assert len(parsed["violations"]) == 2
    assert len(parsed["recommendations"]) == 2


def test_strip_json_tolerates_inline_comments() -> None:
    import json as _json

    from app.surfaces.testfit import _strip_json

    raw = """{
      "score": 85,  // overall score
      /* summary commented on purpose */
      "summary": "ok",
      "violations": [],
      "recommendations": []
    }"""
    parsed = _json.loads(_strip_json(raw))
    assert parsed["score"] == 85
    assert parsed["summary"] == "ok"


# iter-21d — Phase B : SketchUp MCP reference-plan + read-scene-state


def test_save_and_resolve_source_pdf_round_trip(tmp_path) -> None:
    """Persistence of the uploaded PDF so the variant generator can
    drop it into SketchUp. Same content → same id (dedupe); unsafe
    ids (non-hex) resolve to None."""

    from app.pdf.parser import resolve_source_pdf, save_source_pdf

    raw = b"%PDF-1.4\n\n(fake content for test)\n%%EOF"
    pdf_id = save_source_pdf(raw)
    assert len(pdf_id) == 32
    # Same bytes → same id.
    assert save_source_pdf(raw) == pdf_id
    # File exists on disk.
    path = resolve_source_pdf(pdf_id)
    assert path is not None and path.exists()
    assert path.read_bytes() == raw
    # Unsafe ids get None.
    assert resolve_source_pdf(None) is None
    assert resolve_source_pdf("../../../etc/passwd") is None
    assert resolve_source_pdf("g" * 32) is None  # not hex


def test_sketchup_facade_import_plan_pdf_on_mock() -> None:
    """Mock backend must absorb import_plan_pdf without raising and
    return a recognisable payload so the caller can still log."""

    from app.mcp.sketchup_client import RecordingMockBackend, SketchUpFacade

    backend = RecordingMockBackend()
    facade = SketchUpFacade(backend=backend)
    result = facade.import_plan_pdf(
        pdf_path="/tmp/fake.pdf", width_m=25.5, height_m=36.2
    )
    assert result["ok"] is True
    assert result.get("mock") is True
    assert result["width_m"] == 25.5
    assert result["height_m"] == 36.2
    # The call was recorded in the trace.
    trace = facade.trace()
    assert any(c["tool"] == "import_plan_pdf" for c in trace)


def test_sketchup_facade_read_scene_state_on_mock() -> None:
    """Mock returns the canonical empty-scene payload so iterate's
    prompt template handles the shape without crashing."""

    from app.mcp.sketchup_client import RecordingMockBackend, SketchUpFacade

    facade = SketchUpFacade(backend=RecordingMockBackend())
    state = facade.read_scene_state()
    assert state["ok"] is True
    assert state["zone_count"] == 0
    assert state["zones"] == []
    assert "envelope_bbox_mm" in state


def test_import_reference_plan_if_available_no_crash_without_pdf() -> None:
    """The helper must silently no-op when plan_source_id is missing
    or when the PDF has been purged — a variant must never crash on
    a missing reference layer."""

    from app.mcp.sketchup_client import RecordingMockBackend, SketchUpFacade
    from app.models import FloorPlan, Point2D, Polygon2D
    from app.surfaces.testfit import _import_reference_plan_if_available

    plan = FloorPlan(
        envelope=Polygon2D(
            points=[
                Point2D(x=0, y=0),
                Point2D(x=10_000, y=0),
                Point2D(x=10_000, y=10_000),
                Point2D(x=0, y=10_000),
            ]
        ),
        # No plan_source_id → helper should skip.
    )
    facade = SketchUpFacade(backend=RecordingMockBackend())
    _import_reference_plan_if_available(facade, plan)
    assert not any(c["tool"] == "import_plan_pdf" for c in facade.trace())


def test_import_reference_plan_if_available_fires_with_pdf() -> None:
    """With a valid plan_source_id + real dims, the helper must fire
    the import_plan_pdf MCP call."""

    from app.mcp.sketchup_client import RecordingMockBackend, SketchUpFacade
    from app.models import FloorPlan, Point2D, Polygon2D
    from app.pdf.parser import save_source_pdf
    from app.surfaces.testfit import _import_reference_plan_if_available

    pdf_id = save_source_pdf(b"%PDF-1.4\n(iter-21d test)\n%%EOF")
    plan = FloorPlan(
        envelope=Polygon2D(
            points=[
                Point2D(x=0, y=0),
                Point2D(x=25_000, y=0),
                Point2D(x=25_000, y=36_000),
                Point2D(x=0, y=36_000),
            ]
        ),
        plan_source_id=pdf_id,
        real_width_m=25.0,
        real_height_m=36.0,
    )
    facade = SketchUpFacade(backend=RecordingMockBackend())
    _import_reference_plan_if_available(facade, plan)
    import_calls = [c for c in facade.trace() if c["tool"] == "import_plan_pdf"]
    assert len(import_calls) == 1
    params = import_calls[0]["params"]
    assert params["width_m"] == 25.0
    assert params["height_m"] == 36.0
    assert params["pdf_path"].endswith(".pdf")


def test_strip_json_truncates_at_last_balanced_close() -> None:
    """iter-21f : when Opus emits a stray fragment after the outer `}`,
    the parser must still recover the intended object. Reproduces the
    'Expecting ,' delimiter' error that hit the Lovable adjacency audits."""

    import json as _json

    from app.surfaces.testfit import _strip_json

    raw = (
        '{"score": 82, "violations": [{"rule_id": "a", "severity": "major"},'
        '{"rule_id": "b"}], "recommendations": ["fix a"]}  , stray garbage }'
    )
    parsed = _json.loads(_strip_json(raw))
    assert parsed["score"] == 82
    assert len(parsed["violations"]) == 2
