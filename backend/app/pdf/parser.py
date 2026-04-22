"""Hybrid PDF parser for floor plans.

Primary path : Opus 4.7 Vision HD on a re-rendered PNG at 2576 px.
Complementary path : PyMuPDF vector extraction for validation / fallback.
Fusion step : reconcile the two into a single FloorPlan.
"""

from __future__ import annotations

import base64
import io
import json
import math
from pathlib import Path
from typing import Any

import fitz
from PIL import Image

from app.claude_client import ClaudeClient
from app.config import get_settings
from app.models import Column, FloorPlan, Point2D, Polygon2D, TechnicalCore, Window

# Target maximum resolution for Vision HD.
HD_TARGET_PX = 2576


def render_page_to_png_bytes(pdf_path: Path, page_index: int = 0, max_side: int = HD_TARGET_PX) -> bytes:
    """Render a PDF page to PNG bytes, scaled so max(width, height) == max_side."""

    doc = fitz.open(pdf_path)
    page = doc.load_page(page_index)
    r = page.rect
    scale = max_side / max(r.width, r.height)
    matrix = fitz.Matrix(scale, scale)
    pix = page.get_pixmap(matrix=matrix, alpha=False)
    png_bytes = pix.tobytes("png")
    doc.close()
    return png_bytes


def extract_vectors_pymupdf(pdf_path: Path, page_index: int = 0) -> dict[str, Any]:
    """Extract raw drawing primitives (lines, rectangles, circles) with PyMuPDF.

    PyMuPDF serialises drawings as a flat sequence of items whose kind is one of
    ``l`` (line), ``re`` (explicit rectangle), ``qu`` (quad, 4 points) or ``c``
    (cubic Bezier, used to approximate arcs / circles). We scan sequentially and
    group runs of 4 cubic Beziers as a circle (the canonical output of
    ``shape.draw_circle`` since PyMuPDF 1.23).
    """

    doc = fitz.open(pdf_path)
    page = doc.load_page(page_index)
    drawings = page.get_drawings()

    lines: list[dict] = []
    rects: list[dict] = []
    circles: list[dict] = []

    # Flatten all items across drawings.
    flat: list[tuple] = []
    for d in drawings:
        flat.extend(d.get("items", []))

    i = 0
    while i < len(flat):
        item = flat[i]
        kind = item[0]
        if kind == "l":  # explicit line segment
            _, p1, p2 = item
            lines.append({"x1": p1.x, "y1": p1.y, "x2": p2.x, "y2": p2.y})
            i += 1
        elif kind == "re":
            rect = item[1]
            rects.append({
                "x": rect.x0,
                "y": rect.y0,
                "w": rect.width,
                "h": rect.height,
            })
            i += 1
        elif kind == "qu":
            # Quad → convert to a rectangle by bounding box of the 4 points.
            quad = item[1]
            pts = [quad.ul, quad.ur, quad.lr, quad.ll]
            xs = [p.x for p in pts]
            ys = [p.y for p in pts]
            rects.append({
                "x": min(xs),
                "y": min(ys),
                "w": max(xs) - min(xs),
                "h": max(ys) - min(ys),
            })
            i += 1
        elif kind == "c" and i + 3 < len(flat) and all(flat[i + k][0] == "c" for k in range(4)):
            # Run of 4 cubic Beziers = canonical circle.
            pts: list[tuple[float, float]] = []
            for k in range(4):
                bez = flat[i + k]
                for p in bez[1:]:
                    pts.append((p.x, p.y))
            cx = sum(x for x, _ in pts) / len(pts)
            cy = sum(y for _, y in pts) / len(pts)
            xs = [x for x, _ in pts]
            ys = [y for _, y in pts]
            r = (max(xs) - min(xs) + max(ys) - min(ys)) / 4
            circles.append({"cx": cx, "cy": cy, "r": r})
            i += 4
        else:
            i += 1  # skip unknown

    page_w_pt = page.rect.width
    page_h_pt = page.rect.height
    doc.close()
    return {
        "page_width_pt": page_w_pt,
        "page_height_pt": page_h_pt,
        "lines": lines,
        "rects": rects,
        "circles": circles,
    }


# ---------------------------------------------------------------------------
# Vision HD path
# ---------------------------------------------------------------------------

_VISION_SYSTEM = """You are the Design Office plan reader, a senior architect who has interpreted
thousands of architectural drawings. Extract the floor plan geometry AND the
architectural symbols and labels from the image. Your output is the semantic
layer that will be fused with a separate PyMuPDF vector extraction.

Focus on what PyMuPDF CANNOT see:
- Text labels (room names, area notes, scale markings, orientation arrows)
- Architectural symbols (WC, stair arrows, elevator squares with diagonals,
  door swings, window hatching styles)
- Facade semantics (which edge of the envelope is which cardinal direction,
  inferred from "N↑" arrow, sun diagrams, or labels)

Return a strict JSON payload matching the schema in the user message. If you
are uncertain about a geometry, include it under `uncertainties` rather than
inventing coordinates. Do NOT leave `windows_px` empty if the plan clearly
shows window hatching along the envelope — err on inclusion, flag low
confidence in `uncertainties`."""

_VISION_USER = """Extract the floor plan. Return JSON only (no prose) matching:

{
  "scale_label": "...",                 // raw text of any scale annotation (e.g. "1:200", "échelle 1:100")
  "orientation_arrow": {"label": "N", "from_px": [x,y], "to_px": [x,y]}, // or null
  "envelope_points_px": [[x, y], ...],  // outer polygon in image pixel space (required)
  "columns_px": [{"cx": x, "cy": y, "r": radius_px}, ...],
  "cores": [
    {"kind": "elevator|wc|shaft|mep|stair|unknown",
     "points_px": [[x,y], ...],
     "label": "...?"}
  ],
  "windows_px": [
    {"x1": ..., "y1": ..., "x2": ..., "y2": ...,
     "facade": "north|south|east|west|unknown",
     "style": "single|double|curtain_wall|unknown"}
  ],
  "doors_px": [
    {"center_px": [x,y], "width_px": w,
     "leaves": "single|double",
     "swing_side": "left|right|both|unknown",
     "fire_rated": false}
  ],
  "stairs_px": [
    {"points_px": [[x,y], ...],
     "direction_hint": "up|down|both|unknown",
     "is_fire_escape": false}
  ],
  "text_labels": [
    {"text": "...", "center_px": [x,y], "purpose": "room_name|dimension|scale|orientation|other"}
  ],
  "symbols_detected": [
    // Any architectural symbol you recognise — e.g. WC icons, kitchen sinks,
    // compass rose, title-block frames. Use the type string you think most
    // accurate.
    {"type": "wc|sink|compass|title_block|section_cut|unknown", "center_px": [x,y]}
  ],
  "uncertainties": ["free-text note 1", "..."]
}

Rules:
- Use the image pixel coordinate system (origin at top-left of the rendered image).
- Only include a column if you are at least 75% confident.
- Classify facades by position against the envelope bounding box if no
  orientation arrow: top=north, bottom=south, left=west, right=east.
- If an orientation arrow is present, re-classify facades accordingly.
- `windows_px` MUST include every hatched or double-line wall segment that
  reads as a window in the drawing.
- Return valid JSON only. No markdown fences, no prose.
"""


def call_vision_hd(
    png_bytes: bytes,
    client: ClaudeClient | None = None,
    tag: str = "pdf.vision",
    max_tokens: int = 8192,
) -> dict:
    """Send the image to Opus 4.7 and parse the returned JSON."""

    client = client or ClaudeClient()
    b64 = base64.standard_b64encode(png_bytes).decode("ascii")
    response = client.messages_create(
        tag=tag,
        system=_VISION_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": "image/png", "data": b64},
                    },
                    {"type": "text", "text": _VISION_USER},
                ],
            }
        ],
        max_tokens=max_tokens,
    )
    text = "".join(
        block.text for block in response.content if getattr(block, "type", None) == "text"
    )
    # Strip markdown fences if present.
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.split("```", 2)[1]
        if stripped.startswith("json"):
            stripped = stripped[len("json") :]
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start != -1 and end != -1:
            return json.loads(stripped[start : end + 1])
        raise


# ---------------------------------------------------------------------------
# Fusion step
# ---------------------------------------------------------------------------


def _rescale_px_to_mm(x_px: float, y_px: float, image_size: tuple[int, int], plate_mm: tuple[float, float]) -> tuple[float, float]:
    """Assume the rendered plate fills most of the image — linear rescale.
    image origin is top-left with y increasing down; plan origin is bottom-left
    with y increasing up. Flip Y during rescale.
    """
    img_w, img_h = image_size
    pw_mm, ph_mm = plate_mm
    x_mm = (x_px / img_w) * pw_mm
    y_mm = (1 - y_px / img_h) * ph_mm
    return x_mm, y_mm


MM_PER_PT = 500.0  # matches fixture generator POINTS_PER_MM=0.002


def _primitives_bbox(vectors: dict) -> tuple[float, float, float, float] | None:
    """Return the axis-aligned bounding box (x0, y0, x1, y1) in PDF points of
    every extracted primitive. Used to locate the plate inside the page.
    """

    xs: list[float] = []
    ys: list[float] = []
    for line in vectors["lines"]:
        xs.extend([line["x1"], line["x2"]])
        ys.extend([line["y1"], line["y2"]])
    for r in vectors["rects"]:
        xs.extend([r["x"], r["x"] + r["w"]])
        ys.extend([r["y"], r["y"] + r["h"]])
    for c in vectors["circles"]:
        xs.extend([c["cx"] - c["r"], c["cx"] + c["r"]])
        ys.extend([c["cy"] - c["r"], c["cy"] + c["r"]])
    if not xs:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def fuse(
    vectors: dict,
    vision: dict | None,
    image_size: tuple[int, int] | None = None,
    plate_mm: tuple[float, float] | None = None,
) -> FloorPlan:
    """Reconcile PyMuPDF vector extraction with Vision HD output.

    The fusion treats PDF-vector primitives as authoritative for geometry
    (envelope, columns, cores, stairs) and uses Vision HD to fill in the
    semantic labels (window facades, room names) when available.
    """

    from app.models import Stair

    bbox = _primitives_bbox(vectors)
    if bbox is None:
        raise ValueError("No primitives found in the PDF.")
    x0_pt, y0_pt, x1_pt, y1_pt = bbox
    page_h_pt = vectors["page_height_pt"]

    # Flip Y so that plan origin is bottom-left, plate-relative.
    def to_plan_mm(x_pt: float, y_pt: float) -> tuple[float, float]:
        x_mm = (x_pt - x0_pt) * MM_PER_PT
        y_mm = ((page_h_pt - y_pt) - (page_h_pt - y1_pt)) * MM_PER_PT
        return x_mm, y_mm

    plate_w_mm = (x1_pt - x0_pt) * MM_PER_PT
    plate_h_mm = (y1_pt - y0_pt) * MM_PER_PT

    envelope = Polygon2D(
        points=[
            Point2D(x=0, y=0),
            Point2D(x=plate_w_mm, y=0),
            Point2D(x=plate_w_mm, y=plate_h_mm),
            Point2D(x=0, y=plate_h_mm),
        ]
    )

    # Columns.
    columns_out: list[Column] = []
    for c in vectors["circles"]:
        cx_mm, cy_mm = to_plan_mm(c["cx"], c["cy"])
        r_mm = c["r"] * MM_PER_PT
        if 0 <= cx_mm <= plate_w_mm and 0 <= cy_mm <= plate_h_mm and 50 < r_mm < 1_200:
            columns_out.append(
                Column(center=Point2D(x=cx_mm, y=cy_mm), radius_mm=r_mm)
            )

    # Cores, stairs from rectangles.
    cores_out: list[TechnicalCore] = []
    stairs_out: list[Stair] = []
    for r in vectors["rects"]:
        w_mm = r["w"] * MM_PER_PT
        h_mm = r["h"] * MM_PER_PT
        x0_mm, _y_top = to_plan_mm(r["x"], r["y"])
        _x_left, y0_mm = to_plan_mm(r["x"], r["y"] + r["h"])
        # Skip anything coinciding with the envelope itself.
        if w_mm >= plate_w_mm * 0.95 and h_mm >= plate_h_mm * 0.95:
            continue
        if w_mm < 1_000 or h_mm < 1_000:
            continue
        corners = [
            Point2D(x=x0_mm, y=y0_mm),
            Point2D(x=x0_mm + w_mm, y=y0_mm),
            Point2D(x=x0_mm + w_mm, y=y0_mm + h_mm),
            Point2D(x=x0_mm, y=y0_mm + h_mm),
        ]
        poly = Polygon2D(points=corners)
        cx_mm = x0_mm + w_mm / 2
        cy_mm = y0_mm + h_mm / 2
        if (
            abs(cx_mm - plate_w_mm / 2) < plate_w_mm * 0.15
            and abs(cy_mm - plate_h_mm / 2) < plate_h_mm * 0.15
            and 3_000 <= w_mm <= 6_000
            and 3_000 <= h_mm <= 8_000
        ):
            stairs_out.append(Stair(outline=poly, connects_levels=[0, 1]))
        else:
            cores_out.append(TechnicalCore(kind="elevator", outline=poly))

    # Windows: always run the PyMuPDF line detection as a baseline, then
    # merge Vision HD windows on top (Vision contributes facade semantics and
    # labels PyMuPDF can't see). Windows that overlap within ~500 mm are
    # deduplicated, preferring the one with a non-"unknown" facade.
    windows_out: list[Window] = []

    for line in vectors["lines"]:
        a_mm = to_plan_mm(line["x1"], line["y1"])
        b_mm = to_plan_mm(line["x2"], line["y2"])
        dx = abs(a_mm[0] - b_mm[0])
        dy = abs(a_mm[1] - b_mm[1])
        length = math.hypot(dx, dy)
        if length < 500 or length > 5_000:
            continue
        if dy < 100 and (min(a_mm[1], b_mm[1]) < 200 or max(a_mm[1], b_mm[1]) > plate_h_mm - 200):
            y_avg = (a_mm[1] + b_mm[1]) / 2
            facade = "south" if y_avg < 200 else "north"
            windows_out.append(
                Window(
                    start=Point2D(x=a_mm[0], y=y_avg),
                    end=Point2D(x=b_mm[0], y=y_avg),
                    facade=facade,
                )
            )
        elif dx < 100 and (min(a_mm[0], b_mm[0]) < 200 or max(a_mm[0], b_mm[0]) > plate_w_mm - 200):
            x_avg = (a_mm[0] + b_mm[0]) / 2
            facade = "west" if x_avg < 200 else "east"
            windows_out.append(
                Window(
                    start=Point2D(x=x_avg, y=a_mm[1]),
                    end=Point2D(x=x_avg, y=b_mm[1]),
                    facade=facade,
                )
            )

    if vision and image_size:
        vision_windows: list[Window] = []
        for w in vision.get("windows_px", []) or []:
            try:
                x1_mm, y1_mm = _rescale_px_to_mm(
                    w["x1"], w["y1"], image_size, (plate_w_mm, plate_h_mm)
                )
                x2_mm, y2_mm = _rescale_px_to_mm(
                    w["x2"], w["y2"], image_size, (plate_w_mm, plate_h_mm)
                )
            except KeyError:
                continue
            facade = w.get("facade", "unknown")
            style = w.get("style") or None
            vision_windows.append(
                Window(
                    start=Point2D(x=x1_mm, y=y1_mm),
                    end=Point2D(x=x2_mm, y=y2_mm),
                    facade=facade if facade in ("north", "south", "east", "west") else "unknown",
                    note=style,
                )
            )
        # Upgrade facade labels on PyMuPDF-detected windows using vision.
        for i, w in enumerate(windows_out):
            mid = ((w.start.x + w.end.x) / 2, (w.start.y + w.end.y) / 2)
            for vw in vision_windows:
                vmid = ((vw.start.x + vw.end.x) / 2, (vw.start.y + vw.end.y) / 2)
                if abs(mid[0] - vmid[0]) < 500 and abs(mid[1] - vmid[1]) < 500:
                    if vw.facade != "unknown":
                        windows_out[i] = w.model_copy(update={"facade": vw.facade, "note": vw.note})
                    break
        # Add any vision window far from any existing one.
        for vw in vision_windows:
            vmid = ((vw.start.x + vw.end.x) / 2, (vw.start.y + vw.end.y) / 2)
            if not any(
                abs(vmid[0] - (w.start.x + w.end.x) / 2) < 500
                and abs(vmid[1] - (w.start.y + w.end.y) / 2) < 500
                for w in windows_out
            ):
                windows_out.append(vw)

    confidence = 0.9 if vision else 0.7
    notes = "Vision HD + PyMuPDF fusion" if vision else "PyMuPDF only (Vision skipped)"
    return FloorPlan(
        level=0,
        name="Lumen plateau (fixture)",
        envelope=envelope,
        columns=columns_out,
        cores=cores_out,
        windows=windows_out,
        stairs=stairs_out,
        source_confidence=confidence,
        source_notes=notes,
    )


def parse_pdf(pdf_path: Path, use_vision: bool | None = None) -> FloorPlan:
    """Top-level helper: run the hybrid pipeline, return a FloorPlan.

    `use_vision=None` (default) : call Vision HD iff `ANTHROPIC_API_KEY` is
    loaded. `True` forces, `False` disables (useful for unit tests).
    """

    vectors = extract_vectors_pymupdf(pdf_path)

    vision: dict | None = None
    image_size: tuple[int, int] | None = None
    if use_vision is None:
        use_vision = bool(get_settings().anthropic_api_key)
    if use_vision:
        png = render_page_to_png_bytes(pdf_path)
        img = Image.open(io.BytesIO(png))
        image_size = img.size
        vision = call_vision_hd(png)

    return fuse(vectors, vision, image_size=image_size)
