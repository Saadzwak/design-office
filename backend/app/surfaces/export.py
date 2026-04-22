"""Surface 4 — Technical DWG export.

Translates a `FloorPlan` + retained `VariantOutput` into a DXF file with :

- The five Design Office layers (AGENCEMENT, MOBILIER, COTATIONS, CLOISONS,
  CIRCULATIONS).
- The plan geometry (envelope, columns, cores, stairs) on AGENCEMENT.
- The variant zones (workstation clusters, meeting rooms, phone booths,
  collab zones, biophilic zones, partitions) on MOBILIER / CLOISONS.
- Overall dimensions on COTATIONS.
- A sheet border sized to A1 (1:100) and a title block cartouche.

The backend is selected automatically — `EzdxfHeadlessBackend` when AutoCAD
isn't running (default), `FileIpcBackend` when the watch folder exists.
Both write a real DXF file openable in AutoCAD, BricsCAD, Illustrator, etc.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from app.mcp.autocad_client import AutoCadFacade, get_backend
from app.models import FloorPlan, VariantOutput

OUT_DIR = Path(__file__).resolve().parent.parent / "out" / "export"

# A1 paper size (mm) and default scale 1:100 → model-space sheet frame.
A1_SHEET_MM = (841.0, 594.0)
DEFAULT_SCALE = 100  # 1:100
CARTOUCHE_MM = (180.0, 55.0)  # width, height of the title block

LAYER_STANDARD: dict[str, int] = {
    "AGENCEMENT": 7,  # white / black
    "MOBILIER": 5,  # blue
    "COTATIONS": 3,  # green
    "CLOISONS": 1,  # red
    "CIRCULATIONS": 8,  # light grey
}


class ExportRequest(BaseModel):
    client_name: str = Field(default="Client")
    floor_plan: FloorPlan
    variant: VariantOutput
    scale: int = Field(default=DEFAULT_SCALE, ge=50, le=500)
    project_reference: str | None = Field(
        default=None, description="Project reference for title block, e.g. 'LUMEN-CAT-B'."
    )
    drawer_initials: str = Field(default="DO")


class ExportResponse(BaseModel):
    export_id: str
    dxf_filename: str
    dxf_bytes: int
    sheet: str
    scale: str
    layers: list[str]
    trace_length: int
    plot_pdf_available: bool


@dataclass
class ExportSurface:
    """Stateless wrapper around `AutoCadFacade`. Kept as a dataclass for
    symmetry with Brief / TestFit / Justify surfaces and easy mocking.
    """

    def generate(self, req: ExportRequest) -> ExportResponse:
        export_id = _make_export_id(req)
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        dxf_path = OUT_DIR / f"{export_id}.dxf"

        backend = get_backend(force="ezdxf", default_out=dxf_path)
        facade = AutoCadFacade(backend=backend)
        facade.new_drawing(name=dxf_path.name)
        facade.add_layers(LAYER_STANDARD)

        _draw_sheet_frame(facade, scale=req.scale)
        _draw_floor_plan(facade, req.floor_plan)
        _draw_variant(facade, req.floor_plan, req.variant)
        _draw_overall_dimensions(facade, req.floor_plan)
        _draw_title_block(
            facade,
            client_name=req.client_name,
            variant=req.variant,
            scale=req.scale,
            project_reference=req.project_reference or f"DO-{export_id[:8].upper()}",
            drawer_initials=req.drawer_initials,
        )

        save_result = facade.save()
        trace = facade.trace()
        plot_pdf_available = False
        try:
            plot_result = facade.plot_pdf(sheet="A1")
            # plot is a no-op on ezdxf, real on File IPC
            plot_pdf_available = bool(plot_result.get("path") and Path(plot_result["path"]).exists())
        except Exception:  # noqa: BLE001
            plot_pdf_available = False

        dxf_bytes = dxf_path.stat().st_size if dxf_path.exists() else 0

        _write_manifest(
            export_id=export_id,
            req=req,
            trace=trace,
            dxf_bytes=dxf_bytes,
            dxf_path=dxf_path,
            save_result=save_result,
        )

        return ExportResponse(
            export_id=export_id,
            dxf_filename=dxf_path.name,
            dxf_bytes=dxf_bytes,
            sheet="A1",
            scale=f"1:{req.scale}",
            layers=list(LAYER_STANDARD.keys()),
            trace_length=len(trace),
            plot_pdf_available=plot_pdf_available,
        )


def compile_default_surface() -> ExportSurface:
    return ExportSurface()


def dxf_path_for(export_id: str) -> Path | None:
    candidate = OUT_DIR / f"{export_id}.dxf"
    return candidate if candidate.exists() else None


def _make_export_id(req: ExportRequest) -> str:
    payload = (
        f"{req.client_name}:{req.variant.style.value}:"
        f"{len(req.floor_plan.columns)}:{req.variant.metrics.workstation_count}:"
        f"{datetime.now(tz=timezone.utc).date().isoformat()}"
    )
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Sheet frame at 1:SCALE — model-space rectangle sized to A1 × scale
# ---------------------------------------------------------------------------


def _sheet_extents_mm(scale: int) -> tuple[float, float]:
    w_mm = A1_SHEET_MM[0] * scale
    h_mm = A1_SHEET_MM[1] * scale
    return w_mm, h_mm


def _draw_sheet_frame(facade: AutoCadFacade, *, scale: int) -> None:
    """Draw an A1-at-1:SCALE sheet border. The border is placed to enclose the
    plan area ; the plan sits inside, with some margin for the title block.
    """

    w, h = _sheet_extents_mm(scale)
    # Origin-aligned with the plan (0, 0) in the bottom-left, sheet in +X/+Y.
    facade.draw_rectangle(
        corner1_mm=(0, 0), corner2_mm=(w, h), layer="AGENCEMENT"
    )
    # Secondary frame 10 mm × scale (= 1000 mm at 1:100) inside.
    margin = 10 * scale
    facade.draw_rectangle(
        corner1_mm=(margin, margin),
        corner2_mm=(w - margin, h - margin),
        layer="AGENCEMENT",
    )


# ---------------------------------------------------------------------------
# Geometry from FloorPlan
# ---------------------------------------------------------------------------


def _draw_floor_plan(facade: AutoCadFacade, plan: FloorPlan) -> None:
    env_points = [(p.x, p.y) for p in plan.envelope.points]
    facade.draw_envelope(env_points, layer="AGENCEMENT")

    for col in plan.columns:
        facade.draw_column(col.center.x, col.center.y, col.radius_mm, layer="AGENCEMENT")

    for core in plan.cores:
        points = [(p.x, p.y) for p in core.outline.points]
        if len(points) >= 2:
            xs = [p[0] for p in points]
            ys = [p[1] for p in points]
            facade.draw_rectangle(
                corner1_mm=(min(xs), min(ys)),
                corner2_mm=(max(xs), max(ys)),
                layer="AGENCEMENT",
            )
            label_at = (sum(xs) / len(xs), sum(ys) / len(ys))
            facade.add_label(
                position_mm=label_at,
                text=f"NOYAU {core.kind.upper()}",
                height_mm=200,
                layer="AGENCEMENT",
            )

    for stair in plan.stairs:
        points = [(p.x, p.y) for p in stair.outline.points]
        if len(points) >= 2:
            xs = [p[0] for p in points]
            ys = [p[1] for p in points]
            facade.draw_rectangle(
                corner1_mm=(min(xs), min(ys)),
                corner2_mm=(max(xs), max(ys)),
                layer="AGENCEMENT",
            )
            facade.draw_partition(
                start_mm=(min(xs), min(ys)),
                end_mm=(max(xs), max(ys)),
                layer="AGENCEMENT",
            )
            facade.add_label(
                position_mm=(sum(xs) / len(xs), sum(ys) / len(ys)),
                text="ESCALIER",
                height_mm=180,
                layer="AGENCEMENT",
            )

    for window in plan.windows:
        facade.draw_partition(
            start_mm=(window.start.x, window.start.y),
            end_mm=(window.end.x, window.end.y),
            layer="AGENCEMENT",
        )


# ---------------------------------------------------------------------------
# Variant zones from sketchup_trace
# ---------------------------------------------------------------------------


def _draw_variant(facade: AutoCadFacade, plan: FloorPlan, variant: VariantOutput) -> None:
    for entry in variant.sketchup_trace:
        tool = entry.get("tool")
        params = entry.get("params", {})
        if tool == "create_workstation_cluster":
            _draw_workstation_cluster(facade, params)
        elif tool == "create_meeting_room":
            _draw_meeting_room(facade, params)
        elif tool == "create_phone_booth":
            _draw_phone_booth(facade, params)
        elif tool == "create_partition_wall":
            _draw_partition(facade, params)
        elif tool == "create_collab_zone":
            _draw_collab_zone(facade, params)
        elif tool == "apply_biophilic_zone":
            _draw_biophilic_zone(facade, params)
        # `new_scene`, `place_column`, etc. are already drawn from the FloorPlan.


def _draw_workstation_cluster(facade: AutoCadFacade, params: dict[str, Any]) -> None:
    ox, oy = _xy(params.get("origin_mm", (0, 0)))
    orientation = float(params.get("orientation_deg", 0))
    count = int(params.get("count", 1) or 1)
    spacing = float(params.get("row_spacing_mm", 1600))
    product = params.get("product_id", "desk")

    # Simple horizontal / vertical desk rows; we ignore diagonal orientations
    # for the DXF (the demo clients can nudge to degrees later via AutoCAD).
    if orientation in (0, 180):
        dx, dy = spacing, 0
    elif orientation in (90, 270):
        dx, dy = 0, spacing
    else:
        dx, dy = spacing, 0

    for i in range(count):
        x = ox + i * dx
        y = oy + i * dy
        facade.draw_furniture(
            position_mm=(x, y),
            width_mm=1600,
            depth_mm=800,
            product_id=str(product),
            layer="MOBILIER",
        )


def _draw_meeting_room(facade: AutoCadFacade, params: dict[str, Any]) -> None:
    c1 = _xy(params.get("corner1_mm", (0, 0)))
    c2 = _xy(params.get("corner2_mm", (0, 0)))
    if c1 == c2:
        return
    facade.draw_rectangle(corner1_mm=c1, corner2_mm=c2, layer="CLOISONS")
    cx = (c1[0] + c2[0]) / 2
    cy = (c1[1] + c2[1]) / 2
    capacity = params.get("capacity", "?")
    name = str(params.get("name", "Salle"))[:28]
    facade.add_label(
        position_mm=(cx, cy),
        text=f"{name} ({capacity}p)",
        height_mm=220,
        layer="CLOISONS",
    )
    table_product = params.get("table_product")
    if table_product:
        facade.draw_furniture(
            position_mm=(cx - 1200, cy - 600),
            width_mm=2400,
            depth_mm=1200,
            product_id=str(table_product),
            layer="MOBILIER",
        )


def _draw_phone_booth(facade: AutoCadFacade, params: dict[str, Any]) -> None:
    x, y = _xy(params.get("position_mm", (0, 0)))
    product = str(params.get("product_id", "framery_one_compact"))
    # Framery One Compact footprint 1030 × 1000 mm.
    facade.draw_furniture(
        position_mm=(x, y),
        width_mm=1030,
        depth_mm=1000,
        product_id=product,
        layer="MOBILIER",
    )


def _draw_partition(facade: AutoCadFacade, params: dict[str, Any]) -> None:
    a = _xy(params.get("start_mm", (0, 0)))
    b = _xy(params.get("end_mm", (0, 0)))
    if a == b:
        return
    facade.draw_partition(start_mm=a, end_mm=b, layer="CLOISONS")


def _draw_collab_zone(facade: AutoCadFacade, params: dict[str, Any]) -> None:
    bbox = params.get("bbox_mm")
    if not bbox or len(bbox) != 4:
        return
    x0, y0, x1, y1 = (float(v) for v in bbox)
    facade.draw_rectangle(
        corner1_mm=(x0, y0), corner2_mm=(x1, y1), layer="CIRCULATIONS"
    )
    facade.add_label(
        position_mm=((x0 + x1) / 2, (y0 + y1) / 2),
        text=f"COLLAB — {params.get('style', '')}".strip(),
        height_mm=220,
        layer="CIRCULATIONS",
    )


def _draw_biophilic_zone(facade: AutoCadFacade, params: dict[str, Any]) -> None:
    bbox = params.get("bbox_mm")
    if not bbox or len(bbox) != 4:
        return
    x0, y0, x1, y1 = (float(v) for v in bbox)
    facade.draw_rectangle(
        corner1_mm=(x0, y0), corner2_mm=(x1, y1), layer="CIRCULATIONS"
    )
    facade.add_label(
        position_mm=((x0 + x1) / 2, (y0 + y1) / 2),
        text="BIOPHILIE",
        height_mm=200,
        layer="CIRCULATIONS",
    )


def _xy(raw: Any) -> tuple[float, float]:
    if isinstance(raw, (list, tuple)) and len(raw) >= 2:
        return float(raw[0]), float(raw[1])
    return 0.0, 0.0


# ---------------------------------------------------------------------------
# Dimensions
# ---------------------------------------------------------------------------


def _draw_overall_dimensions(facade: AutoCadFacade, plan: FloorPlan) -> None:
    if len(plan.envelope.points) < 3:
        return
    xs = [p.x for p in plan.envelope.points]
    ys = [p.y for p in plan.envelope.points]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)

    facade.add_dimension(
        p1_mm=(minx, miny),
        p2_mm=(maxx, miny),
        offset_mm=1500,
        layer="COTATIONS",
    )
    facade.add_dimension(
        p1_mm=(minx, miny),
        p2_mm=(minx, maxy),
        offset_mm=1500,
        layer="COTATIONS",
    )


# ---------------------------------------------------------------------------
# Title block (cartouche) in the bottom-right of the sheet
# ---------------------------------------------------------------------------


def _draw_title_block(
    facade: AutoCadFacade,
    *,
    client_name: str,
    variant: VariantOutput,
    scale: int,
    project_reference: str,
    drawer_initials: str,
) -> None:
    w, h = _sheet_extents_mm(scale)
    cw = CARTOUCHE_MM[0] * scale
    ch = CARTOUCHE_MM[1] * scale
    margin = 10 * scale
    # Bottom-right corner, inside the inner frame.
    x1 = w - margin
    y0 = margin
    x0 = x1 - cw
    y1 = y0 + ch

    facade.draw_rectangle(corner1_mm=(x0, y0), corner2_mm=(x1, y1), layer="AGENCEMENT")

    # Horizontal divider for header.
    header_y = y1 - ch / 3
    facade.draw_partition(
        start_mm=(x0, header_y), end_mm=(x1, header_y), layer="AGENCEMENT"
    )
    # Vertical divider for info columns.
    mid_x = x0 + cw / 2
    facade.draw_partition(
        start_mm=(mid_x, y0), end_mm=(mid_x, header_y), layer="AGENCEMENT"
    )

    today = datetime.now(tz=timezone.utc).date().isoformat()
    text_height = 300  # mm in model space (= 3 mm on sheet at 1:100)

    facade.add_label(
        position_mm=(x0 + 500, y1 - ch * 0.18),
        text=f"{client_name} — {variant.title}",
        height_mm=text_height + 100,
        layer="AGENCEMENT",
    )
    # Left column.
    col_a_x = x0 + 500
    # Right column.
    col_b_x = mid_x + 500

    rows = [
        (col_a_x, header_y - ch * 0.25, f"Projet : {project_reference}"),
        (col_a_x, header_y - ch * 0.45, f"Niveau : {variant.style.value.replace('_', ' ').title()}"),
        (col_a_x, header_y - ch * 0.65, f"Dessiné : {drawer_initials}"),
        (col_b_x, header_y - ch * 0.25, f"Échelle : 1:{scale} — A1"),
        (col_b_x, header_y - ch * 0.45, f"Date : {today}"),
        (col_b_x, header_y - ch * 0.65, f"Postes : {variant.metrics.workstation_count}"),
    ]
    for x, y, text in rows:
        facade.add_label(
            position_mm=(x, y), text=text, height_mm=text_height, layer="AGENCEMENT"
        )

    # Bottom tag line.
    facade.add_label(
        position_mm=(x0 + 500, y0 + ch * 0.10),
        text="Design Office — Built with Opus 4.7 — MIT License",
        height_mm=text_height - 50,
        layer="AGENCEMENT",
    )


# ---------------------------------------------------------------------------
# Manifest (for debugging + auditability)
# ---------------------------------------------------------------------------


def _write_manifest(
    *,
    export_id: str,
    req: ExportRequest,
    trace: list[dict[str, Any]],
    dxf_bytes: int,
    dxf_path: Path,
    save_result: dict[str, Any],
) -> None:
    manifest = OUT_DIR / f"{export_id}.manifest.json"
    payload = {
        "export_id": export_id,
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        "client_name": req.client_name,
        "variant_style": req.variant.style.value,
        "variant_title": req.variant.title,
        "scale": req.scale,
        "sheet": "A1",
        "dxf_path": str(dxf_path),
        "dxf_bytes": dxf_bytes,
        "trace_length": len(trace),
        "layers": list(LAYER_STANDARD.keys()),
        "save_result": save_result,
    }
    manifest.write_text(json.dumps(payload, indent=2), encoding="utf-8")
