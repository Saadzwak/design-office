"""FastAPI entrypoint for the Design Office backend."""

import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

from app import __version__
from app.config import get_settings
from app.models import FloorPlan, TestFitResponse, VariantOutput, VariantStyle
from app.pdf.fixtures import generate_lumen_plan_pdf
from app.pdf.parser import parse_pdf
from app.surfaces.brief import (
    BriefRequest,
    BriefResponse,
    compile_default_surface,
    preview_resources_manifest,
)
from app.chat import ChatRequest, ChatResponse, run_chat, run_chat_stream
from app.surfaces.export import (
    ExportRequest,
    ExportResponse,
    compile_default_surface as compile_export_surface,
    dxf_path_for,
)
from app.surfaces.justify import (
    JustifyRequest,
    JustifyResponse,
    compile_default_surface as compile_justify_surface,
    pdf_path_for,
)
from app.surfaces.justify_pptx import pptx_path_for
from app.surfaces.moodboard import (
    MoodBoardRequest,
    MoodBoardRerenderRequest,
    MoodBoardRerenderResponse,
    MoodBoardResponse,
    compile_default_surface as compile_moodboard_surface,
    pdf_path_for as moodboard_pdf_path_for,
    render_pdf_from_selection as moodboard_render_pdf_from_selection,
)
from app.surfaces.visual_moodboard import (
    VisualMoodBoardGalleryResponse,
    VisualMoodBoardItemTilesResponse,
    VisualMoodBoardRequest,
    VisualMoodBoardResponse,
    compile_default_surface as compile_visual_moodboard_surface,
    generated_image_path as visual_moodboard_path_for,
    list_directions_for as list_moodboard_directions_for,
)
from app.surfaces.zone_overlay import (
    ZoneOverlayRequest,
    ZoneOverlayResponse,
    compile_default_surface as compile_zone_overlay_surface,
)
from app.services.nanobanana_client import NanoBananaError
from app.surfaces.floorplan_svg import render_floorplan_svg
from app.surfaces.testfit import (
    IterateRequest,
    IterateResponse,
    MicroZoningRequest,
    MicroZoningResponse,
    catalog_preview,
    iterate_variant,
    run_micro_zoning,
    run_micro_zoning_structured,
    sketchup_shot_path_for,
)
from app.surfaces.testfit import compile_default_surface as compile_testfit_surface
from pydantic import BaseModel

FIXTURE_PDF = Path(__file__).resolve().parent / "data" / "fixtures" / "lumen_plan.pdf"

settings = get_settings()

app = FastAPI(
    title="Design Office API",
    version=__version__,
    description="Opus 4.7 orchestrator powering the Design Office copilot for office fit-outs.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        f"http://localhost:{settings.frontend_port}",
        f"http://127.0.0.1:{settings.frontend_port}",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str | bool]:
    return {
        "status": "ok",
        "version": __version__,
        "model": settings.anthropic_model,
        "api_key_loaded": bool(settings.anthropic_api_key),
    }


@app.get("/api/integrations/status")
def integrations_status() -> dict:
    """Snapshot of every external integration state. Polled by the frontend
    nav to show a live 'MCP connected' indicator.
    """

    from app.mcp.autocad_client import FileIpcBackend, get_backend as get_autocad_backend
    from app.mcp.sketchup_client import try_connect_tcp

    sketchup_live = try_connect_tcp(
        settings.sketchup_mcp_host, settings.sketchup_mcp_port, timeout_s=0.35
    )
    autocad_backend = get_autocad_backend()
    autocad_mode = (
        "file_ipc_live"
        if isinstance(autocad_backend, FileIpcBackend)
        else "ezdxf_headless"
    )

    return {
        "sketchup": {
            "reachable": sketchup_live,
            "host": settings.sketchup_mcp_host,
            "port": settings.sketchup_mcp_port,
        },
        "autocad": {"mode": autocad_mode},
        "anthropic": {
            "api_key_loaded": bool(settings.anthropic_api_key),
            "model": settings.anthropic_model,
        },
    }


@app.get("/api/brief/manifest")
def brief_manifest() -> dict:
    return preview_resources_manifest()


@app.post("/api/brief/synthesize", response_model=BriefResponse)
def brief_synthesize(payload: BriefRequest) -> BriefResponse:
    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY is not loaded. Check .env at repo root.",
        )
    surface = compile_default_surface()
    return surface.synthesize(payload)


# ---------------------------------------------------------------------------
# Surface 2 — Test Fit
# ---------------------------------------------------------------------------


@app.get("/api/testfit/catalog")
def testfit_catalog() -> dict:
    return catalog_preview()


@app.get("/api/testfit/fixture")
def testfit_fixture(use_vision: bool | None = None) -> FloorPlan:
    """Serve the Lumen fictitious plan. Uses Vision HD when the API key is
    loaded (per P1-a in docs/FLOW_WALKTHROUGH.md), PyMuPDF-only otherwise.

    `?use_vision=false` forces the vision-less path (useful for unit tests
    that don't want to hit the API).
    """

    if not FIXTURE_PDF.exists():
        generate_lumen_plan_pdf(FIXTURE_PDF)
    resolved_use_vision = (
        use_vision if use_vision is not None else bool(settings.anthropic_api_key)
    )
    return parse_pdf(FIXTURE_PDF, use_vision=resolved_use_vision)


_SAMPLE_RESULT_PATH = (
    Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "generate_output_sample.json"
)


@app.get("/api/testfit/sample")
def testfit_sample() -> TestFitResponse:
    """Return the saved live Lumen Test Fit run (3 variants + 3 reviewers).

    Useful as a demo-mode fallback : a judge landing on /justify or /export
    without going Brief → Test Fit first gets a populated page rather than
    an empty state. Payload is identical in shape to what POST
    /api/testfit/generate produces, so the client can feed it straight into
    localStorage.
    """

    if not _SAMPLE_RESULT_PATH.exists():
        raise HTTPException(
            status_code=404,
            detail="Sample fixture not found. Run scripts/run_lumen_full.py first.",
        )
    import json

    data = json.loads(_SAMPLE_RESULT_PATH.read_text(encoding="utf-8"))
    return TestFitResponse.model_validate(data)


class FloorPlanSvgRequest(BaseModel):
    """Iter-17 D : caller-supplied plan + variant → 2D top-down SVG."""

    floor_plan: FloorPlan
    variant: VariantOutput | None = None
    width_px: int = 1440
    show_legend: bool = True


@app.post("/api/testfit/floor-plan-2d")
def testfit_floor_plan_2d_svg(payload: FloorPlanSvgRequest) -> Response:
    """POST the floor plan (and optionally a variant) and receive back an
    SVG with zones coloured by functional category, numbered 1..N, and
    a legend in the bottom-right corner.

    Pure function (no LLM, no MCP), so it's cheap enough to call on
    every variant toggle in the Test Fit 2D viewer.
    """

    svg = render_floorplan_svg(
        plan=payload.floor_plan,
        variant=payload.variant,
        width_px=payload.width_px,
        show_legend=payload.show_legend,
    )
    return Response(
        content=svg,
        media_type="image/svg+xml",
        headers={"Cache-Control": "public, max-age=600"},
    )


@app.get("/api/testfit/sample/variants/{style}/floor-plan-2d")
def testfit_sample_floor_plan_2d_svg(style: str) -> Response:
    """Convenience GET : serve the 2D SVG for one of the three saved
    Lumen variants. Wired for the cold-start demo path — the same
    fixture that /api/testfit/sample returns.
    """

    if not _SAMPLE_RESULT_PATH.exists():
        raise HTTPException(status_code=404, detail="Sample fixture missing.")
    import json

    data = json.loads(_SAMPLE_RESULT_PATH.read_text(encoding="utf-8"))
    sample = TestFitResponse.model_validate(data)
    picked = next(
        (v for v in sample.variants if v.style.value == style),
        None,
    )
    if picked is None:
        raise HTTPException(
            status_code=404, detail=f"Variant '{style}' not in the saved sample."
        )
    svg = render_floorplan_svg(plan=sample.floor_plan, variant=picked)
    return Response(content=svg, media_type="image/svg+xml")


@app.post("/api/testfit/parse")
async def testfit_parse(
    file: UploadFile = File(...),
    # iter-21b (Saad, 2026-04-24) : flip the default to True so the
    # room / wall / opening extraction actually runs on new uploads.
    # Vision HD costs tokens but it IS the whole point — without it the
    # variant generator lays out zones on a bare envelope (the "random
    # rectangles" bug Saad reported). Opt-out explicitly via
    # `use_vision=false` for cheap headless tests.
    use_vision: bool = Form(default=True),
) -> FloorPlan:
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=415, detail=f"Unsupported file type: {file.content_type}")
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file.")
    # iter-21d (Phase B) — persist the PDF before parsing so the variant
    # generator can drop it into SketchUp as a reference layer. The
    # parsing itself still runs on a temp copy to keep PyMuPDF happy
    # with its mutex-y file handles.
    from app.pdf.parser import save_source_pdf

    plan_source_id = save_source_pdf(raw)
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as fh:
        fh.write(raw)
        tmp = Path(fh.name)
    try:
        # iter-27 P2 L2 — pass plan_source_id so any out-of-envelope
        # vision rejection warnings emitted during parsing carry the
        # correlatable upload id in their structured log payload.
        plan = parse_pdf(tmp, use_vision=use_vision, project_id=plan_source_id)
    finally:
        tmp.unlink(missing_ok=True)
    return plan.model_copy(update={"plan_source_id": plan_source_id})


class TestFitGenerateRequest(BaseModel):
    floor_plan: FloorPlan
    programme_markdown: str
    client_name: str = "Client"
    styles: list[VariantStyle] | None = None
    # iter-21a (Saad, 2026-04-24) : the raw brief + client industry are
    # now forwarded so the Parti Pris Proposer can tailor the 3 variants
    # to THIS project. Optional for backward compat — empty strings fall
    # back to the legacy hardcoded archetypes.
    brief: str = ""
    client_industry: str = ""


@app.post("/api/testfit/generate", response_model=TestFitResponse)
def testfit_generate(payload: TestFitGenerateRequest) -> TestFitResponse:
    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY is not loaded.",
        )
    surface = compile_testfit_surface()
    styles = payload.styles or [
        VariantStyle.VILLAGEOIS,
        VariantStyle.ATELIER,
        VariantStyle.HYBRIDE_FLEX,
    ]
    return surface.generate(
        floor_plan=payload.floor_plan,
        programme_markdown=payload.programme_markdown,
        client_name=payload.client_name,
        styles=styles,
        brief=payload.brief,
        client_industry=payload.client_industry,
    )


@app.get("/api/testfit/screenshot/{filename}")
def testfit_screenshot(filename: str) -> FileResponse:
    """Serve a post-iterate SketchUp PNG by filename. Whitelisted against
    `[A-Za-z0-9_-]+.png` so the client can't traverse outside the shots
    directory.
    """

    path = sketchup_shot_path_for(filename)
    if path is None:
        raise HTTPException(status_code=404, detail=f"Screenshot {filename} not found.")
    return FileResponse(path, media_type="image/png")


@app.post("/api/testfit/iterate", response_model=IterateResponse)
def testfit_iterate(payload: IterateRequest) -> IterateResponse:
    """Natural-language iteration on a retained variant — "enlarge the
    boardroom", "push desks toward the south façade", etc.
    """

    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY is not loaded.",
        )
    try:
        return iterate_variant(payload)
    except ValueError as exc:  # malformed JSON from the iterate agent
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/testfit/microzoning", response_model=MicroZoningResponse)
def testfit_microzoning(payload: MicroZoningRequest) -> MicroZoningResponse:
    """Drill into a retained variant and emit a per-zone detail brief
    (furniture SKU, finish choices, acoustic target, light Kelvin,
    biophilic accent). Tuned to the client's industry profile."""

    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY is not loaded.",
        )
    return run_micro_zoning(payload)


@app.post(
    "/api/testfit/microzoning/structured",
    response_model=None,  # typed via Pydantic return, not route-level
)
def testfit_microzoning_structured(payload: MicroZoningRequest):
    """Iter-18i : structured micro-zoning for the frontend drill-down.

    Returns `{ variant_style, zones[], markdown, tokens, duration_ms }`
    where every zone carries `{ n, name, surface_m2, icon, status,
    furniture[], materials[], acoustic, adjacency }`. Consumed by the
    MicroView drawer in /testfit?tab=micro.
    """

    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY is not loaded.",
        )
    return run_micro_zoning_structured(payload)


# ---------------------------------------------------------------------------
# Surface 3 — Justify
# ---------------------------------------------------------------------------


@app.post("/api/justify/generate", response_model=JustifyResponse)
def justify_generate(payload: JustifyRequest) -> JustifyResponse:
    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY is not loaded.",
        )
    surface = compile_justify_surface()
    return surface.generate(payload)


@app.get("/api/justify/pdf/{pdf_id}")
def justify_pdf(pdf_id: str) -> FileResponse:
    path = pdf_path_for(pdf_id)
    if path is None:
        raise HTTPException(status_code=404, detail=f"PDF {pdf_id} not found.")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"design-office-{pdf_id}.pdf",
    )


@app.get("/api/justify/pptx/{pptx_id}")
def justify_pptx(pptx_id: str) -> FileResponse:
    path = pptx_path_for(pptx_id)
    if path is None:
        raise HTTPException(status_code=404, detail=f"PPTX {pptx_id} not found.")
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename=f"design-office-{pptx_id}.pptx",
    )


# ---------------------------------------------------------------------------
# Surface 3 bis — Mood Board
# ---------------------------------------------------------------------------


@app.post("/api/moodboard/generate", response_model=MoodBoardResponse)
def moodboard_generate(payload: MoodBoardRequest) -> MoodBoardResponse:
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY is not loaded.")
    surface = compile_moodboard_surface()
    try:
        return surface.run(payload)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.get("/api/moodboard/pdf/{pdf_id}")
def moodboard_pdf(pdf_id: str) -> FileResponse:
    path = moodboard_pdf_path_for(pdf_id)
    if path is None:
        raise HTTPException(status_code=404, detail=f"Mood board PDF {pdf_id} not found.")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"design-office-moodboard-{pdf_id}.pdf",
    )


@app.post(
    "/api/moodboard/rerender-pdf",
    response_model=MoodBoardRerenderResponse,
)
def moodboard_rerender_pdf(
    payload: MoodBoardRerenderRequest,
) -> MoodBoardRerenderResponse:
    """Iter-20e (Saad #10) : regenerate the A3 PDF with real NanoBanana
    tiles embedded. Called by the frontend once the gallery has landed —
    the PDF then uses the atmosphere photograph as the hero block
    instead of the flat palette wash. Returns a fresh `pdf_id`; the
    old id stays valid (PDFs are content-addressed)."""

    # Resolve cache ids to absolute paths, skipping unsafe / missing ids.
    resolved: dict[str, str] = {}
    for label, image_id in payload.gallery_tile_ids.items():
        if not isinstance(image_id, str):
            continue
        p = visual_moodboard_path_for(image_id)
        if p is not None:
            resolved[label] = str(p)

    # Iter-30B : resolve per-item NanoBanana ids (one per material /
    # furniture / plant / fixture). Keys are canonical `item_key`
    # slugs that the PDF renderer matches in the materials and
    # furniture grids.
    resolved_items: dict[str, str] = {}
    for item_key, image_id in payload.item_tile_ids.items():
        if not isinstance(image_id, str) or not isinstance(item_key, str):
            continue
        p = visual_moodboard_path_for(image_id)
        if p is not None:
            resolved_items[item_key] = str(p)

    pdf_id = moodboard_render_pdf_from_selection(
        client=payload.client,
        variant=payload.variant,
        selection=payload.selection,
        project_reference=payload.project_reference,
        gallery_tile_paths=resolved or None,
        item_tile_paths=resolved_items or None,
        direction=payload.direction,
    )
    return MoodBoardRerenderResponse(pdf_id=pdf_id)


# ---------------------------------------------------------------------------
# iter-17 C : NanoBanana Pro surfaces
# ---------------------------------------------------------------------------

@app.post(
    "/api/moodboard/generate-visual",
    response_model=VisualMoodBoardResponse,
)
def moodboard_generate_visual(payload: VisualMoodBoardRequest) -> VisualMoodBoardResponse:
    """Generate a Pinterest-style composite mood board via NanoBanana Pro.

    Complementary to `/api/moodboard/generate` (the A3 PDF). The visual
    artefact reflects the full project context — industry, retained
    variant, macro-zoning, micro-zoning and the base mood-board selection
    — so judges see ONE coherent identity across the two formats.
    """

    try:
        surface = compile_visual_moodboard_surface()
    except NanoBananaError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    try:
        return surface.generate(payload)
    except NanoBananaError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.get("/api/moodboard/directions")
def moodboard_directions(industry: str = "tech_startup") -> dict:
    """Iter-30B Stage 2 — return the three hardcoded mood-board
    directions for an industry. The frontend renders these as a tab
    bar above the Pinterest collage; each tab fires gallery +
    item-tiles + rerender with `direction=<slug>` so the same
    curator selection reads as three visually distinct mood boards.
    """

    return {"industry": industry, "directions": list_moodboard_directions_for(industry)}


@app.post(
    "/api/moodboard/generate-gallery",
    response_model=VisualMoodBoardGalleryResponse,
)
def moodboard_generate_gallery(
    payload: VisualMoodBoardRequest,
) -> VisualMoodBoardGalleryResponse:
    """Iter-20d (Saad #26) : generate 4 themed NanoBanana tiles —
    atmosphere / materials / furniture / biophilic — each prompted
    from the full moodboard-curator Selection JSON so the images
    reflect THIS project, not a stock mood board. Replaces the
    Pinterest-collage Placeholder hatches on the /moodboard page.
    """

    try:
        surface = compile_visual_moodboard_surface()
    except NanoBananaError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    try:
        return surface.generate_gallery(payload)
    except NanoBananaError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.post(
    "/api/moodboard/generate-item-tiles",
    response_model=VisualMoodBoardItemTilesResponse,
)
def moodboard_generate_item_tiles(
    payload: VisualMoodBoardRequest,
) -> VisualMoodBoardItemTilesResponse:
    """Iter-30B : generate ONE editorial product photograph per item in
    the curator selection (per material, per furniture piece, per
    plant, per fixture). These replace the hatched <Placeholder> tiles
    in the Pinterest collage with real magazine-grade product shots,
    and are embedded in the A3 PDF.

    Cache-aware: NanoBanana keys by (model, prompt, aspect_ratio) sha256
    so reruns of the same selection cost nothing. Per-item failures are
    isolated — a single timeout never aborts the batch.
    """

    try:
        surface = compile_visual_moodboard_surface()
    except NanoBananaError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    try:
        return surface.generate_item_tiles(payload)
    except NanoBananaError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.get("/api/moodboard/visual/{image_id}")
def moodboard_visual(image_id: str) -> FileResponse:
    """Stream back a generated visual-moodboard PNG by its cache id."""

    path = visual_moodboard_path_for(image_id)
    if path is None:
        raise HTTPException(
            status_code=404, detail=f"Visual moodboard {image_id} not found."
        )
    return FileResponse(
        path,
        media_type="image/png",
        filename=f"design-office-visual-moodboard-{image_id}.png",
    )


@app.post(
    "/api/testfit/variants/zone-overlay",
    response_model=ZoneOverlayResponse,
)
def testfit_zone_overlay(payload: ZoneOverlayRequest) -> ZoneOverlayResponse:
    """Generate a 2D overlay of the floor plan with zones coloured by
    category. Falls back transparently to the pure-SVG artefact when
    NanoBanana Pro is unavailable (no FAL_KEY, no cairosvg, network
    failure) — the endpoint always returns a usable path.
    """

    surface = compile_zone_overlay_surface()
    return surface.generate(payload)


@app.get("/api/generated-images/{image_id}")
def generated_image(image_id: str) -> FileResponse:
    """Serve any cached NanoBanana artefact by its 32-hex id. Whitelisted
    to `.png` / `.svg` / `_base.png` suffixes the surfaces produce.
    """

    from app.surfaces.zone_overlay import OUT_DIR

    if not image_id or len(image_id) > 40 or any(
        c not in "0123456789abcdef_" for c in image_id
    ):
        raise HTTPException(status_code=400, detail="Bad image id.")
    for suffix, media in (
        (".png", "image/png"),
        (".svg", "image/svg+xml"),
        ("_base.png", "image/png"),
    ):
        candidate = OUT_DIR / f"{image_id}{suffix}"
        if candidate.exists():
            return FileResponse(candidate, media_type=media)
    raise HTTPException(status_code=404, detail=f"Image {image_id} not found.")


# ---------------------------------------------------------------------------
# Surface 4 — Technical Export (DWG / DXF)
# ---------------------------------------------------------------------------


@app.post("/api/export/dwg", response_model=ExportResponse)
def export_dwg(payload: ExportRequest) -> ExportResponse:
    """Generate an A1 DXF from the retained variant + floor plan.

    Always succeeds headlessly via ezdxf — switches to the live AutoCAD
    backend once `AUTOCAD_MCP_WATCH_DIR` is set and AutoCAD is running with
    the `mcp_dispatch.lsp` loaded.
    """

    surface = compile_export_surface()
    return surface.generate(payload)


@app.get("/api/export/dxf/{export_id}")
def export_dxf(export_id: str) -> FileResponse:
    path = dxf_path_for(export_id)
    if path is None:
        raise HTTPException(status_code=404, detail=f"Export {export_id} not found.")
    return FileResponse(
        path,
        media_type="application/acad",
        filename=f"design-office-{export_id}.dxf",
    )


# ---------------------------------------------------------------------------
# Cross-page chat — "Ask Design Office"
# ---------------------------------------------------------------------------


@app.post("/api/chat/message", response_model=ChatResponse)
def chat_message(payload: ChatRequest) -> ChatResponse:
    """Non-streaming chat turn. Simple path for tests and clients that
    don't want to handle SSE.
    """

    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not loaded.")
    try:
        return run_chat(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/chat/stream")
def chat_stream(payload: ChatRequest) -> StreamingResponse:
    """Server-sent event stream. Events : `token` (deltas) then `end`."""

    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not loaded.")
    return StreamingResponse(
        run_chat_stream(payload),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
