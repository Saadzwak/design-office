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


# iter-21c/22c → iter-23 : JSON defensive patches (_strip_json,
# _close_unterminated_json, _truncate_to_last_balanced) were DELETED
# when the variant / reviewer / adjacency / iterate / micro-zoning
# agents migrated to tool_use. Schema validation happens on the
# Anthropic API side ; there's nothing to parse or repair. The old
# tests that covered those repair helpers are removed with them.


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


# iter-26 P1 (Saad, 2026-04-25) — PDF→PNG cache for SketchUp underlay


def _real_minimal_pdf_bytes() -> bytes:
    """Return a tiny but actually valid 1-page PDF (≈210×297 mm, A4).
    Hand-rolled rather than imported so the test stays self-contained.
    Just enough to make PyMuPDF render a non-trivial pixmap."""

    return (
        b"%PDF-1.4\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n"
        b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]"
        b"/Resources<<>>/Contents 4 0 R>>endobj\n"
        b"4 0 obj<</Length 12>>stream\nBT ET\nendstream\nendobj\n"
        b"xref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n"
        b"0000000052 00000 n \n0000000095 00000 n \n0000000170 00000 n \n"
        b"trailer<</Size 5/Root 1 0 R>>\nstartxref\n216\n%%EOF\n"
    )


def test_save_source_pdf_also_writes_png_sister() -> None:
    """iter-26 P1 — `save_source_pdf` must render a sister PNG at the
    same hash so SketchUp's `add_image` (raster only) has something
    valid to load. Idempotent : re-saving the same bytes does NOT
    re-render the PNG."""

    from app.pdf.parser import PLANS_DIR, save_source_pdf

    raw = _real_minimal_pdf_bytes()
    pdf_id = save_source_pdf(raw)
    pdf_path = PLANS_DIR / f"{pdf_id}.pdf"
    png_path = PLANS_DIR / f"{pdf_id}.png"
    assert pdf_path.exists(), "PDF should be persisted"
    assert png_path.exists(), "PNG sister should be rendered alongside"
    assert png_path.stat().st_size > 100, "PNG must contain real bytes"

    # Idempotency : re-save shouldn't change the PNG mtime.
    mtime_before = png_path.stat().st_mtime
    assert save_source_pdf(raw) == pdf_id
    mtime_after = png_path.stat().st_mtime
    assert mtime_before == mtime_after, "PNG must not be re-rendered on re-save"


def test_resolve_source_png_lazy_backfill_for_legacy_pdfs() -> None:
    """iter-26 P1 — pre-iter-26 caches only have the .pdf on disk.
    On first `resolve_source_png(id)` call, the PNG must be lazily
    rendered from the sister PDF so the SketchUp underlay works
    without a server restart."""

    from app.pdf.parser import PLANS_DIR, resolve_source_png

    raw = _real_minimal_pdf_bytes()
    # Manually persist the PDF without going through save_source_pdf
    # (mimicking the iter-21d on-disk state pre-iter-26).
    import hashlib

    digest = hashlib.sha256(raw).hexdigest()[:32]
    PLANS_DIR.mkdir(parents=True, exist_ok=True)
    pdf_path = PLANS_DIR / f"{digest}.pdf"
    png_path = PLANS_DIR / f"{digest}.png"
    if png_path.exists():
        png_path.unlink()  # ensure backfill kicks in
    pdf_path.write_bytes(raw)

    resolved = resolve_source_png(digest)
    assert resolved is not None and resolved == png_path
    assert png_path.exists()


def test_resolve_source_png_returns_none_for_missing_pdf() -> None:
    """When neither .png nor .pdf are on disk, the resolver returns
    None — the import helper then silently skips."""

    from app.pdf.parser import resolve_source_png

    # 32 hex but never persisted.
    assert resolve_source_png("0" * 32) is None
    # Unsafe ids never even hit the disk.
    assert resolve_source_png(None) is None
    assert resolve_source_png("../../../etc/passwd") is None
    assert resolve_source_png("g" * 32) is None  # not hex


def test_save_source_pdf_png_preserves_pdf_aspect_ratio() -> None:
    """A4 portrait (210×297 mm) must produce a PNG whose pixel
    aspect ratio matches the page aspect (≈0.707, h>w). The Ruby
    side then re-stretches to `real_width_m × real_height_m` for
    zone overlay alignment ; here we just guarantee the renderer
    didn't squish or rotate the page."""

    import hashlib

    from PIL import Image

    from app.pdf.parser import PLANS_DIR, save_source_pdf

    raw = _real_minimal_pdf_bytes()
    pdf_id = save_source_pdf(raw)
    png_path = PLANS_DIR / f"{pdf_id}.png"
    with Image.open(png_path) as im:
        w, h = im.size
    aspect_pdf = 595.0 / 842.0  # MediaBox in our minimal PDF (A4 portrait pts)
    aspect_png = w / h
    # Allow 1 % tolerance for sub-pixel rounding from get_pixmap.
    assert abs(aspect_png - aspect_pdf) < 0.01, (
        f"PNG aspect {aspect_png:.4f} should match PDF page aspect "
        f"{aspect_pdf:.4f} ; got w={w} h={h}"
    )


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


# iter-24 P3 (Saad, 2026-04-24) — SketchUp scene reset invariant


def test_new_scene_precedes_any_geometry_call() -> None:
    """Regression guard for iter-24 P3 : every variant (or iterate)
    build MUST call `new_scene` BEFORE it places any geometry, so
    the previous variant's entities don't stack on the next one.

    The Ruby side (DesignOffice.new_scene in design_office_extensions.rb)
    implements the reset via model.entities.clear! — verified live
    by counting entities before/after : 54 → 0 → 18 across 3
    sequential builds. This unit test only protects the invariant
    at the Python call-sequence level (mock backend).
    """

    from app.mcp.sketchup_client import RecordingMockBackend, SketchUpFacade

    facade = SketchUpFacade(backend=RecordingMockBackend())
    # Mirror what _replay_zones + screenshot do.
    facade.new_scene(name="run1")
    facade.create_meeting_room(
        corner1_mm=(2000, 2000),
        corner2_mm=(6000, 6000),
        capacity=8,
        name="Board",
        table_product="vitra_eames_segmented_4000",
    )
    facade.new_scene(name="run2")
    facade.create_phone_booth(position_mm=(1000, 1000), product_id="framery_one")

    trace = facade.trace()
    # For every non-new_scene call, the MOST RECENT earlier call must
    # include at least one new_scene — i.e. new_scene gates every
    # geometry call on the same facade.
    seen_new_scene = False
    for entry in trace:
        tool = entry["tool"]
        if tool == "new_scene":
            seen_new_scene = True
            continue
        # All geometry tools go here.
        assert seen_new_scene, (
            f"geometry tool {tool!r} called before any new_scene — "
            "iter-24 P3 invariant violated"
        )
    # And at least one new_scene per run.
    new_scene_calls = [e for e in trace if e["tool"] == "new_scene"]
    assert len(new_scene_calls) == 2, (
        f"expected 2 new_scene calls (one per run), got {len(new_scene_calls)}"
    )


def test_import_reference_image_if_available_no_crash_without_pdf() -> None:
    """The helper must silently no-op when plan_source_id is missing
    or when the PDF has been purged — a variant must never crash on
    a missing reference layer."""

    from app.mcp.sketchup_client import RecordingMockBackend, SketchUpFacade
    from app.models import FloorPlan, Point2D, Polygon2D
    from app.surfaces.testfit import _import_reference_image_if_available

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
    _import_reference_image_if_available(facade, plan)
    assert not any(c["tool"] == "import_plan_pdf" for c in facade.trace())


def test_import_reference_image_if_available_fires_with_png() -> None:
    """iter-26 P1 — with a valid plan_source_id + real dims, the
    helper must fire the import_plan_pdf MCP call but pass the
    sister .PNG path (since SketchUp's add_image only accepts raster
    formats). The kwarg name on the wire stays `pdf_path` for
    backward-compat with the existing Ruby + mock signatures."""

    from app.mcp.sketchup_client import RecordingMockBackend, SketchUpFacade
    from app.models import FloorPlan, Point2D, Polygon2D
    from app.pdf.parser import save_source_pdf
    from app.surfaces.testfit import _import_reference_image_if_available

    pdf_id = save_source_pdf(_real_minimal_pdf_bytes())
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
    _import_reference_image_if_available(facade, plan)
    import_calls = [c for c in facade.trace() if c["tool"] == "import_plan_pdf"]
    assert len(import_calls) == 1
    params = import_calls[0]["params"]
    assert params["width_m"] == 25.0
    assert params["height_m"] == 36.0
    # iter-26 P1 — path now points at the rendered PNG, not the source PDF.
    assert params["pdf_path"].endswith(".png"), (
        f"iter-26 P1 must pass PNG path to SketchUp ; got "
        f"{params['pdf_path']!r}"
    )


# iter-21f test `test_strip_json_truncates_at_last_balanced_close`
# deleted with the `_truncate_to_last_balanced` helper in iter-23.
