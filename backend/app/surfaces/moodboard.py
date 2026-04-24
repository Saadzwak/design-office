"""Mood Board surface (Surface 3, between Test Fit and Justify).

Runs the Mood Board Curator agent against the retained variant, the
client's industry profile, and the relevant MCP resources. Renders the
JSON selection as an A3 landscape PDF (ReportLab) and returns a stable
id the frontend can stream back via GET /api/moodboard/pdf/{id}.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.agents.orchestrator import Orchestration, StructuredSubAgent, SubAgent
from app.schemas import MoodBoardLLMOutput
from app.claude_client import ClaudeClient
from app.models import VariantOutput

BACKEND_ROOT = Path(__file__).resolve().parent.parent
RESOURCES_DIR = BACKEND_ROOT / "data" / "resources"
PROMPTS_DIR = BACKEND_ROOT / "prompts" / "agents"
CATALOG_PATH = BACKEND_ROOT / "data" / "furniture" / "catalog.json"
OUT_DIR = BACKEND_ROOT / "out" / "moodboard"

CURATOR_RESOURCES = [
    "client-profiles.md",
    "material-finishes.md",
    "mood-board-method.md",
    "biophilic-office.md",
    "collaboration-spaces.md",
]

Industry = Literal[
    "tech_startup",
    "law_firm",
    "bank_insurance",
    "consulting",
    "creative_agency",
    "healthcare",
    "public_sector",
    "other",
]


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _load_resources(filenames: list[str]) -> str:
    blocks = []
    for name in filenames:
        p = RESOURCES_DIR / name
        blocks.append(f"# FILE: design://{p.stem}\n\n{_read(p)}")
    return "\n\n---\n\n".join(blocks)


def _catalog_json() -> str:
    if not CATALOG_PATH.exists():
        return "[]"
    return _read(CATALOG_PATH)


class ClientInfo(BaseModel):
    name: str = "Client"
    industry: Industry = "tech_startup"
    logo_data_url: str | None = None
    tagline: str | None = None


class MoodBoardRequest(BaseModel):
    client: ClientInfo
    brief: str = Field(..., min_length=40)
    programme_markdown: str
    variant: VariantOutput
    project_reference: str | None = None


class MoodBoardRerenderRequest(BaseModel):
    """Iter-20e (Saad #10) : re-render the A3 PDF from an already-curated
    selection + a NanoBanana gallery. Lets the frontend upgrade the PDF
    once the tiles land, without re-running the (expensive) curator.
    """

    client: ClientInfo
    variant: VariantOutput
    selection: dict[str, Any]
    project_reference: str | None = None
    gallery_tile_ids: dict[str, str] = Field(
        default_factory=dict,
        description=(
            "Keys: atmosphere|materials|furniture|biophilic → NanoBanana "
            "cache ids (32 hex chars). Resolved server-side to absolute "
            "image paths so the PDF can embed them."
        ),
    )


class MoodBoardRerenderResponse(BaseModel):
    pdf_id: str


class MoodBoardResponse(BaseModel):
    pdf_id: str
    selection: dict[str, Any]  # parsed curator JSON (for preview + debugging)
    tokens: dict[str, int]
    duration_ms: int


@dataclass
class MoodBoardSurface:
    client: ClaudeClient

    _USER_TEMPLATE = """Client profile:

<client>
{client_json}
</client>

Brief:

<brief>
{brief}
</brief>

Consolidated programme:

<programme>
{programme}
</programme>

Retained variant:

<retained_variant>
{variant_json}
</retained_variant>

MCP resources (you MUST curate from these only — no fabrication):

<resources_excerpts>
{resources}
</resources_excerpts>

Furniture catalogue (pick product_id from here):

<catalog_json>
{catalog_json}
</catalog_json>

Return the JSON selection as specified in your system instructions."""

    def _agent(self) -> StructuredSubAgent:
        # iter-23 — tool_use schema guarantees MoodBoardLLMOutput shape.
        system = _read(PROMPTS_DIR / "moodboard_curator.md")
        return StructuredSubAgent(
            name="MoodBoardCurator",
            system_prompt=system,
            user_template=self._USER_TEMPLATE,
            output_schema=MoodBoardLLMOutput.model_json_schema(),
            tool_name="emit_mood_board",
            tool_description=(
                "Emit the curated mood-board selection: header (tagline, "
                "industry_note), atmosphere (hero_image_theme + palette), "
                "materials, furniture (pick product_id from the catalogue), "
                "planting, light. Every item must come from the MCP resources "
                "or the catalogue ; no fabrication."
            ),
            max_tokens=6000,
        )

    def run(self, req: MoodBoardRequest) -> MoodBoardResponse:
        orch = Orchestration(client=self.client)
        context = {
            "client_json": json.dumps(req.client.model_dump(), ensure_ascii=False),
            "brief": req.brief,
            "programme": req.programme_markdown,
            "variant_json": json.dumps(
                req.variant.model_dump(mode="json"), ensure_ascii=False
            ),
            "resources": _load_resources(CURATOR_RESOURCES),
            "catalog_json": _catalog_json(),
        }
        t0 = time.time()
        try:
            out = orch.run_structured_subagent(
                self._agent(), context, tag="moodboard.curate"
            )
        except Exception as exc:  # noqa: BLE001
            raise ValueError(f"Mood Board Curator API error: {exc}") from exc
        duration_ms = int((time.time() - t0) * 1000)
        selection = out.data

        pdf_id = _render_moodboard_pdf(
            client=req.client,
            variant=req.variant,
            selection=selection,
            project_reference=req.project_reference,
        )
        return MoodBoardResponse(
            pdf_id=pdf_id,
            selection=selection,
            tokens={
                "input": out.input_tokens,
                "output": out.output_tokens,
            },
            duration_ms=duration_ms,
        )


def compile_default_surface() -> MoodBoardSurface:
    return MoodBoardSurface(client=ClaudeClient())


# ---------------------------------------------------------------------------
# A3 landscape PDF renderer (ReportLab)
# ---------------------------------------------------------------------------


def _render_moodboard_pdf(
    *,
    client: ClientInfo,
    variant: VariantOutput,
    selection: dict[str, Any],
    project_reference: str | None,
    gallery_tile_paths: dict[str, str] | None = None,
) -> str:
    """Lay out the six mandatory sections from design://mood-board-method on
    a single A3 landscape page. Returns the pdf_id (hash) the endpoint uses
    to stream the file back.

    iter-20e (Saad #10, #26, #27) : when `gallery_tile_paths` is
    supplied (keys `atmosphere|materials|furniture|biophilic` → absolute
    image path), the renderer uses the real NanoBanana tiles instead of
    the flat palette wash. Fallback is the legacy block-colour layout,
    so the function stays safe in offline / test contexts.
    """

    from reportlab.lib.colors import HexColor
    from reportlab.lib.pagesizes import A3, landscape
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # iter-20e : include the gallery signature in the hash so a richer
    # PDF (same selection, new tiles) gets a distinct pdf_id.
    gallery_sig = ",".join(
        f"{k}:{Path(v).name}" for k, v in sorted((gallery_tile_paths or {}).items())
    )
    pdf_id = hashlib.sha1(
        f"moodboard:{client.name}:{variant.style.value}:{json.dumps(selection, sort_keys=True)[:500]}:{gallery_sig}".encode(
            "utf-8"
        )
    ).hexdigest()[:16]
    path = OUT_DIR / f"{pdf_id}.pdf"

    page_w, page_h = landscape(A3)  # 420 x 297 mm
    c = canvas.Canvas(str(path), pagesize=landscape(A3))
    c.setTitle(f"Design Office — Mood Board — {client.name}")
    c.setAuthor("Design Office")

    # Organic Modern palette — mirrors tailwind.config.ts.
    INK = HexColor("#1C1F1A")
    INK_SOFT = HexColor("#3E4240")
    INK_MUTED = HexColor("#7F837D")
    CANVAS_BG = HexColor("#FAF7F2")
    HAIRLINE = HexColor("#E8E3D8")
    FOREST = HexColor("#2F4A3F")
    SAND = HexColor("#C9B79C")
    SAND_DEEP = HexColor("#A08863")

    # Page background
    c.setFillColor(CANVAS_BG)
    c.rect(0, 0, page_w, page_h, fill=1, stroke=0)

    margin = 16 * mm
    gutter = 10 * mm
    usable_w = page_w - 2 * margin
    usable_h = page_h - 2 * margin

    # ---- HEADER (full width, 35 mm tall) ---------------------------------
    header_h = 35 * mm
    header_top = page_h - margin
    # Client + Industry eyebrow
    c.setFillColor(FOREST)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(margin, header_top - 6 * mm, f"MOOD BOARD  ·  {client.industry.upper().replace('_', ' ')}")
    # Client name
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 28)
    c.drawString(margin, header_top - 18 * mm, client.name)
    # Tagline
    tagline = (
        selection.get("header", {}).get("tagline")
        or client.tagline
        or variant.title
    )
    c.setFillColor(INK_SOFT)
    c.setFont("Helvetica-Oblique", 11)
    c.drawString(margin, header_top - 28 * mm, str(tagline)[:140])

    # Date + reference on the right
    from datetime import date
    c.setFillColor(INK_MUTED)
    c.setFont("Helvetica", 8)
    date_line = f"{date.today().isoformat()}"
    if project_reference:
        date_line += f"  ·  {project_reference}"
    c.drawRightString(page_w - margin, header_top - 6 * mm, date_line.upper())
    # DO wordmark, bottom-right of header
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(page_w - margin, header_top - 28 * mm, "Design Office")

    # Separator hairline under the header
    header_bottom = header_top - header_h
    c.setStrokeColor(HAIRLINE)
    c.setLineWidth(0.6)
    c.line(margin, header_bottom, page_w - margin, header_bottom)

    # ---- Two-row body ----------------------------------------------------
    # Row 1 — Atmosphere (left) + Palette (right)
    row1_h = 90 * mm
    row1_top = header_bottom - gutter
    row1_bot = row1_top - row1_h

    # Atmosphere — 7/12 columns
    col_w = (usable_w - gutter) / 2
    atm_left = margin
    atm_top = row1_top
    atm_bottom = atm_top - row1_h
    palette_list = selection.get("atmosphere", {}).get("palette", [])
    if palette_list:
        hero_hex = palette_list[0].get("hex", "#2F4A3F")
    else:
        hero_hex = "#2F4A3F"

    # iter-20e (Saad #10) : use the NanoBanana atmosphere tile if
    # available — real photograph-grade mood. Fallback is the legacy
    # block-colour wash so the PDF still lays out without images.
    atmosphere_image_path = (gallery_tile_paths or {}).get("atmosphere")
    atmosphere_image_used = False
    if atmosphere_image_path and Path(atmosphere_image_path).exists():
        try:
            c.drawImage(
                atmosphere_image_path,
                atm_left,
                atm_bottom,
                width=col_w,
                height=row1_h,
                preserveAspectRatio=True,
                anchor="c",
                mask="auto",
            )
            atmosphere_image_used = True
        except Exception:  # noqa: BLE001
            atmosphere_image_used = False

    if not atmosphere_image_used:
        # Legacy flat-colour wash (kept for offline / test / no-API runs).
        c.setFillColor(HexColor(hero_hex))
        c.rect(atm_left, atm_bottom, col_w, row1_h, fill=1, stroke=0)
    else:
        # iter-20e : paint a narrow ink scrim at the top (eyebrow + theme)
        # and bottom (industry note) so the overlay text is legible
        # regardless of the photograph's luminance. 22 mm top, 22 mm
        # bottom, 25 % opacity simulated via a low-alpha fill.
        scrim_color = HexColor("#1C1F1A")
        try:
            c.saveState()
            c.setFillColorRGB(0.11, 0.12, 0.10, alpha=0.55)
            c.rect(atm_left, atm_top - 26 * mm, col_w, 26 * mm, fill=1, stroke=0)
            c.setFillColorRGB(0.11, 0.12, 0.10, alpha=0.45)
            c.rect(atm_left, atm_bottom, col_w, 22 * mm, fill=1, stroke=0)
        finally:
            c.restoreState()
    # Pick the overlay text colour so it reads on the hero fill. Use
    # relative luminance (WCAG) — a dark hero (Chambers green, Atelier ink)
    # takes ivory text; a light hero (Linen canvas, Parchment) takes ink
    # text. Without this the Lumen mood board had invisible ivory-on-ivory
    # text in the ATMOSPHERE block.
    # When we have an image we draw a dark scrim, so force ivory text.
    if atmosphere_image_used:
        overlay_text_color = CANVAS_BG
        overlay_muted_color = HAIRLINE
    else:
        overlay_text_color = _contrast_overlay(hero_hex, on_dark=CANVAS_BG, on_light=INK)
        overlay_muted_color = _contrast_overlay(hero_hex, on_dark=HAIRLINE, on_light=INK_SOFT)
    c.setFillColor(overlay_text_color)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(atm_left + 8 * mm, atm_top - 12 * mm, "ATMOSPHERE")
    # Put the hero image theme as a wrapped decorative caption (was a
    # 60-char hard-truncation that cut mid-word).
    hero_theme = selection.get("atmosphere", {}).get("hero_image_theme", "")
    if hero_theme:
        c.setFont("Helvetica-Oblique", 10)
        _wrap_text(
            c,
            str(hero_theme),
            atm_left + 8 * mm,
            atm_top - 22 * mm,
            col_w - 16 * mm,
            leading=13,
        )
    # Industry note, anchored to the bottom of the hero block.
    industry_note = selection.get("header", {}).get("industry_note", "")
    if industry_note:
        c.setFillColor(overlay_muted_color)
        c.setFont("Helvetica", 8)
        _wrap_text(
            c,
            str(industry_note)[:320],
            atm_left + 8 * mm,
            atm_bottom + 18 * mm,
            col_w - 16 * mm,
            leading=10,
        )

    # Palette — 5 swatches stacked vertically in the right column
    pal_left = margin + col_w + gutter
    pal_top = row1_top
    pal_h = row1_h
    swatch_h = (pal_h - 4 * mm) / max(len(palette_list), 1)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(pal_left, pal_top + 2 * mm, "PALETTE")
    for i, swatch in enumerate(palette_list[:5]):
        y = pal_top - (i + 1) * swatch_h
        hex_ = swatch.get("hex", "#FFFFFF")
        try:
            c.setFillColor(HexColor(hex_))
        except Exception:  # noqa: BLE001
            c.setFillColor(INK_MUTED)
        c.rect(pal_left, y, 30 * mm, swatch_h - 1 * mm, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(pal_left + 34 * mm, y + swatch_h * 0.6, str(swatch.get("name", "—"))[:30])
        c.setFillColor(INK_MUTED)
        c.setFont("Helvetica", 8)
        c.drawString(pal_left + 34 * mm, y + swatch_h * 0.3, f"{hex_}  ·  {swatch.get('role', '')}")

    # Row 2 — Materials (left) + Furniture (right)
    row2_h = 95 * mm
    row2_top = row1_bot - gutter
    row2_bot = row2_top - row2_h

    # Materials — 6/12 columns
    mat_left = margin
    _draw_section_title(c, "MATERIALS", mat_left, row2_top, col_w, INK)
    materials = selection.get("materials", [])[:8]
    _draw_materials_grid(c, materials, mat_left, row2_top - 8 * mm, col_w, row2_h - 8 * mm, INK, INK_MUTED, HAIRLINE)

    # Furniture — 6/12 columns
    fur_left = margin + col_w + gutter
    _draw_section_title(c, "FURNITURE", fur_left, row2_top, col_w, INK)
    furniture = selection.get("furniture", [])[:6]
    _draw_furniture_grid(c, furniture, fur_left, row2_top - 8 * mm, col_w, row2_h - 8 * mm, INK, INK_SOFT, INK_MUTED, HAIRLINE, SAND)

    # ---- Row 3 — Planting + Light stacked at the bottom ------------------
    row3_h = usable_h - header_h - gutter - row1_h - gutter - row2_h - gutter
    if row3_h < 45 * mm:
        row3_h = 45 * mm
    row3_top = row2_bot - gutter
    row3_bot = row3_top - row3_h

    # Planting
    plant_left = margin
    _draw_section_title(c, "PLANTING", plant_left, row3_top, col_w, INK)
    plant_strategy = selection.get("planting", {}).get("strategy", "")
    species = selection.get("planting", {}).get("species", [])
    c.setFillColor(INK_SOFT)
    c.setFont("Helvetica-Oblique", 9)
    _wrap_text(c, str(plant_strategy)[:260], plant_left, row3_top - 14 * mm, col_w, leading=11)
    c.setFillColor(INK)
    c.setFont("Helvetica", 8)
    for i, sp in enumerate(species[:4]):
        y = row3_top - 30 * mm - i * 9 * mm
        c.setFillColor(FOREST)
        c.circle(plant_left + 2 * mm, y + 1 * mm, 1.3 * mm, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(plant_left + 6 * mm, y + 0.5 * mm, str(sp.get("name", "—"))[:40])
        c.setFillColor(INK_MUTED)
        c.setFont("Helvetica", 8)
        c.drawString(
            plant_left + 6 * mm,
            y - 3 * mm,
            f"{sp.get('light', '')}  ·  care {sp.get('care', '—')}",
        )

    # Light
    light_left = margin + col_w + gutter
    _draw_section_title(c, "LIGHT", light_left, row3_top, col_w, INK)
    light_strategy = selection.get("light", {}).get("strategy", "")
    fixtures = selection.get("light", {}).get("fixtures", [])
    c.setFillColor(INK_SOFT)
    c.setFont("Helvetica-Oblique", 9)
    _wrap_text(c, str(light_strategy)[:260], light_left, row3_top - 14 * mm, col_w, leading=11)
    for i, fx in enumerate(fixtures[:3]):
        y = row3_top - 30 * mm - i * 10 * mm
        c.setFillColor(SAND_DEEP)
        c.rect(light_left, y, 4 * mm, 6 * mm, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(
            light_left + 6 * mm,
            y + 3 * mm,
            f"{fx.get('brand', '—')} — {fx.get('model', '')}"[:50],
        )
        c.setFillColor(INK_MUTED)
        c.setFont("Helvetica", 8)
        c.drawString(
            light_left + 6 * mm,
            y - 1 * mm,
            f"{fx.get('category', '')}  ·  {fx.get('application', '')}"[:60],
        )

    # ---- Footer ----------------------------------------------------------
    c.setFillColor(INK_MUTED)
    c.setFont("Helvetica", 7)
    c.drawString(margin, margin - 8, f"Curated by Design Office for {client.name}")
    c.drawRightString(
        page_w - margin,
        margin - 8,
        f"Variant: {variant.style.value.replace('_', ' ')} · {variant.title}"[:80],
    )

    c.showPage()
    c.save()
    return pdf_id


def pdf_path_for(pdf_id: str) -> Path | None:
    candidate = OUT_DIR / f"{pdf_id}.pdf"
    return candidate if candidate.exists() else None


def render_pdf_from_selection(
    *,
    client: ClientInfo,
    variant: VariantOutput,
    selection: dict[str, Any],
    project_reference: str | None = None,
    gallery_tile_paths: dict[str, str] | None = None,
) -> str:
    """Public wrapper around `_render_moodboard_pdf`.

    Used by iter-20e's re-render endpoint : once the NanoBanana gallery
    has landed on the frontend, we POST the curator selection + the 4
    image ids back to the server so the A3 PDF regenerates with real
    photographs in the ATMOSPHERE block instead of the block-colour
    wash. Returns the fresh `pdf_id` (stable hash of inputs).
    """

    return _render_moodboard_pdf(
        client=client,
        variant=variant,
        selection=selection,
        project_reference=project_reference,
        gallery_tile_paths=gallery_tile_paths,
    )


# ---------------------------------------------------------------------------
# ReportLab helpers
# ---------------------------------------------------------------------------


def _draw_section_title(
    c: Any, title: str, x: float, y: float, w: float, ink: Any
) -> None:
    c.setFillColor(ink)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x, y + 2, title)
    c.setLineWidth(0.4)
    c.line(x, y - 2, x + w, y - 2)


def _contrast_overlay(hex_color: str, *, on_dark: Any, on_light: Any) -> Any:
    """Pick an overlay colour that reads on top of `hex_color`.

    Uses WCAG relative luminance — the same formula every contrast checker
    uses. Returns `on_dark` (a light ivory) for dark backgrounds and
    `on_light` (a dark ink) for light backgrounds. Threshold 0.5 matches
    the conventional "dark mode" / "light mode" split.
    """

    s = hex_color.lstrip("#")
    if len(s) != 6:
        return on_dark
    try:
        r = int(s[0:2], 16) / 255.0
        g = int(s[2:4], 16) / 255.0
        b = int(s[4:6], 16) / 255.0
    except ValueError:
        return on_dark

    def _linear(ch: float) -> float:
        return ch / 12.92 if ch <= 0.03928 else ((ch + 0.055) / 1.055) ** 2.4

    luminance = 0.2126 * _linear(r) + 0.7152 * _linear(g) + 0.0722 * _linear(b)
    return on_dark if luminance < 0.5 else on_light


def _wrap_text(
    c: Any,
    text: str,
    x: float,
    y_top: float,
    max_width: float,
    leading: float = 11,
) -> None:
    words = text.split()
    line = ""
    y = y_top
    for w in words:
        candidate = f"{line} {w}".strip()
        if c.stringWidth(candidate) > max_width:
            c.drawString(x, y, line)
            y -= leading
            line = w
        else:
            line = candidate
    if line:
        c.drawString(x, y, line)


def _draw_materials_grid(
    c: Any,
    materials: list[dict[str, Any]],
    x: float,
    y_top: float,
    w: float,
    h: float,
    ink: Any,
    ink_muted: Any,
    hairline: Any,
) -> None:
    from reportlab.lib.colors import HexColor
    from reportlab.lib.units import mm

    if not materials:
        c.setFillColor(ink_muted)
        c.setFont("Helvetica-Oblique", 9)
        c.drawString(x, y_top - 6 * mm, "No material selection yet.")
        return
    cols = min(4, max(2, len(materials)))
    rows = max(1, (len(materials) + cols - 1) // cols)
    cell_w = (w - (cols - 1) * 4 * mm) / cols
    cell_h = (h - (rows - 1) * 4 * mm) / rows
    for i, mat in enumerate(materials):
        r = i // cols
        cc = i % cols
        cx = x + cc * (cell_w + 4 * mm)
        cy = y_top - (r + 1) * cell_h - r * 4 * mm
        # Swatch block
        swatch_hex = mat.get("swatch_hex") or "#C9B79C"
        try:
            c.setFillColor(HexColor(swatch_hex))
        except Exception:  # noqa: BLE001
            c.setFillColor(HexColor("#C9B79C"))
        c.rect(cx, cy + cell_h - 22 * mm, cell_w, 22 * mm, fill=1, stroke=0)
        # Text below swatch
        c.setFillColor(ink)
        c.setFont("Helvetica-Bold", 8)
        name = str(mat.get("name", "—"))
        c.drawString(cx, cy + cell_h - 26 * mm, name[:40])
        c.setFillColor(ink_muted)
        c.setFont("Helvetica", 7)
        application = str(mat.get("application", ""))
        c.drawString(cx, cy + cell_h - 29 * mm, f"{mat.get('category', '')} · {application}"[:45])
        sus = str(mat.get("sustainability", ""))
        if sus:
            c.drawString(cx, cy + cell_h - 32 * mm, sus[:45])
    _ = hairline


def _draw_furniture_grid(
    c: Any,
    furniture: list[dict[str, Any]],
    x: float,
    y_top: float,
    w: float,
    h: float,
    ink: Any,
    ink_soft: Any,
    ink_muted: Any,
    hairline: Any,
    sand: Any,
) -> None:
    from reportlab.lib.units import mm

    if not furniture:
        c.setFillColor(ink_muted)
        c.setFont("Helvetica-Oblique", 9)
        c.drawString(x, y_top - 6 * mm, "No furniture selection yet.")
        return
    cols = min(3, max(2, len(furniture)))
    rows = max(1, (len(furniture) + cols - 1) // cols)
    cell_w = (w - (cols - 1) * 4 * mm) / cols
    cell_h = (h - (rows - 1) * 4 * mm) / rows
    for i, f in enumerate(furniture):
        r = i // cols
        cc = i % cols
        cx = x + cc * (cell_w + 4 * mm)
        cy = y_top - (r + 1) * cell_h - r * 4 * mm
        # Hairline frame with a sand accent bar on the left
        c.setFillColor(sand)
        c.rect(cx, cy, 3 * mm, cell_h, fill=1, stroke=0)
        c.setStrokeColor(hairline)
        c.setLineWidth(0.4)
        c.rect(cx, cy, cell_w, cell_h, fill=0, stroke=1)
        # Brand + model
        c.setFillColor(ink)
        c.setFont("Helvetica-Bold", 9)
        header = f"{f.get('brand', '')} — {f.get('model', '')}"
        c.drawString(cx + 6 * mm, cy + cell_h - 6 * mm, header[:42])
        # Category + application
        c.setFillColor(ink_soft)
        c.setFont("Helvetica", 8)
        c.drawString(cx + 6 * mm, cy + cell_h - 11 * mm, str(f.get("category", ""))[:38])
        c.setFillColor(ink_muted)
        c.setFont("Helvetica-Oblique", 7)
        c.drawString(cx + 6 * mm, cy + cell_h - 15 * mm, str(f.get("application", ""))[:60])
        # Dimensions
        dims = f.get("dimensions_mm") or {}
        if dims:
            dim_str = f"{dims.get('w', '—')} × {dims.get('d', '—')} × {dims.get('h', '—')} mm"
            c.setFillColor(ink_muted)
            c.setFont("Helvetica", 7)
            c.drawString(cx + 6 * mm, cy + 4 * mm, dim_str)
