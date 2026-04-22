"""FastAPI entrypoint for the Design Office backend."""

import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app import __version__
from app.config import get_settings
from app.models import FloorPlan, TestFitResponse, VariantStyle
from app.pdf.fixtures import generate_lumen_plan_pdf
from app.pdf.parser import parse_pdf
from app.surfaces.brief import (
    BriefRequest,
    BriefResponse,
    compile_default_surface,
    preview_resources_manifest,
)
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
from app.surfaces.testfit import (
    IterateRequest,
    IterateResponse,
    catalog_preview,
    iterate_variant,
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
def testfit_fixture() -> FloorPlan:
    if not FIXTURE_PDF.exists():
        generate_lumen_plan_pdf(FIXTURE_PDF)
    return parse_pdf(FIXTURE_PDF, use_vision=False)


@app.post("/api/testfit/parse")
async def testfit_parse(
    file: UploadFile = File(...),
    use_vision: bool = Form(default=False),
) -> FloorPlan:
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=415, detail=f"Unsupported file type: {file.content_type}")
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file.")
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as fh:
        fh.write(raw)
        tmp = Path(fh.name)
    try:
        plan = parse_pdf(tmp, use_vision=use_vision)
    finally:
        tmp.unlink(missing_ok=True)
    return plan


class TestFitGenerateRequest(BaseModel):
    floor_plan: FloorPlan
    programme_markdown: str
    client_name: str = "Client"
    styles: list[VariantStyle] | None = None


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
    )


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
