"""Hybrid PDF parser for floor plans.

Primary path : Opus 4.7 Vision HD on a re-rendered PNG at 2576 px.
Complementary path : PyMuPDF vector extraction for validation / fallback.
Fusion step : reconcile the two into a single FloorPlan.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import math
import re
from pathlib import Path
from typing import Any

# iter-21d (Phase B) — persist parsed source PDFs so the variant
# generator can drop them into SketchUp as a reference layer underneath
# the zones. Indexed by content hash to dedupe re-uploads.
BACKEND_ROOT = Path(__file__).resolve().parent.parent
PLANS_DIR = BACKEND_ROOT / "out" / "plans"

import fitz
from PIL import Image

from app.claude_client import ClaudeClient
from app.config import get_settings
from app.models import (
    Column,
    FloorPlan,
    InteriorWall,
    Point2D,
    Polygon2D,
    Room,
    TechnicalCore,
    WallOpening,
    Window,
)

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
- **Interior rooms and partitions** — the most project-specific information
  on the plan. For each enclosed cell of the plate, emit a `rooms_px`
  polygon with its label (when visible). For each internal wall segment
  (every line that divides two rooms, NOT part of the envelope), emit an
  `interior_walls_px` entry. For each door / passage opening within an
  interior wall, emit an `openings_px` entry.

Return a strict JSON payload matching the schema in the user message. If you
are uncertain about a geometry, include it under `uncertainties` rather than
inventing coordinates. Do NOT leave `windows_px` empty if the plan clearly
shows window hatching along the envelope — err on inclusion, flag low
confidence in `uncertainties`. Do NOT leave `rooms_px` empty if the plan
shows rooms — err on inclusion, the downstream space planner NEEDS to see
the existing partitioning to reason about keep / merge / repurpose."""

_VISION_USER = """Extract the floor plan. Return JSON only (no prose) matching:

{
  "scale_label": "...",                 // raw text of any scale annotation (e.g. "1:200", "échelle 1:100")
  "envelope_real_dimensions_m": {       // MANDATORY — real-world dimensions of the plate
    "width_m": 24.5,                    // envelope bounding box width in METRES
    "height_m": 36.0,                   // envelope bounding box height in METRES
    "source": "scale_label|inferred|unknown",  // how you derived this
    "confidence": 0.0                   // 0..1
  },
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
  "rooms_px": [
    // One entry per enclosed interior cell. Exclude circulation spines
    // that are clearly corridors (include those under kind="corridor").
    {"points_px": [[x,y], ...],
     "label": "Chambre|Cuisine|Salle d'eau|Entrée|Lot 4|Open space|Boardroom|...",
     "kind": "room|corridor|wc|kitchen|stairwell|terrace|unknown",
     "area_hint_m2": 18.0}
  ],
  "interior_walls_px": [
    // One entry per wall segment between two rooms, NOT part of the envelope.
    {"x1": ..., "y1": ..., "x2": ..., "y2": ...,
     "thickness_hint_mm": 150,
     "is_load_bearing_hint": false}
  ],
  "openings_px": [
    // Door or passage openings cut INTO an interior_walls_px segment.
    {"center_px": [x,y], "width_px": w,
     "kind": "door|passage|sliding|double_door|unknown",
     "in_wall_index_hint": 2}          // index into interior_walls_px if known
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
- **`envelope_real_dimensions_m` is MANDATORY and calibrates the whole pipeline.**
  Derivation priority:
  1. If a scale bar or scale label ("1:100", "échelle 1:200") + a dimension
     annotation is visible, derive width_m and height_m from them (source =
     "scale_label", confidence 0.9–1.0).
  2. Else if cotations are visible on the envelope, sum them up (source =
     "scale_label", confidence 0.8).
  3. Else infer from room sizes : a haussmannian residential floor is
     typically 15–25 m wide × 20–35 m deep ; a tertiary office plate
     typically 18–40 m wide × 25–80 m deep. Use the plan's architectural
     type + rough aspect ratio (source = "inferred", confidence 0.4–0.6).
  4. Last resort : source = "unknown", confidence 0. Still emit your best
     guess — the consumer applies a sanity clamp.
- Only include a column if you are at least 75% confident.
- Classify facades by position against the envelope bounding box if no
  orientation arrow: top=north, bottom=south, left=west, right=east.
- If an orientation arrow is present, re-classify facades accordingly.
- `windows_px` MUST include every hatched or double-line wall segment that
  reads as a window in the drawing.
- `rooms_px` polygons MUST be closed (repeat the first point at the end, OR
  the consumer will auto-close them). Counter-clockwise preferred but not
  required.
- `interior_walls_px` are SEGMENTS (start + end) — do NOT emit polylines.
  If a single wall bends, emit one segment per straight run.
- `openings_px` positions are the CENTRE of the door/passage along its wall.
- If the plan shows no interior partitions (bare plate), return empty
  arrays for rooms_px / interior_walls_px / openings_px and flag in
  `uncertainties`.
- Return valid JSON only. No markdown fences, no prose.
"""


# iter-22a — tolerant JSON cleaner shared across the Vision + testfit
# agents. Opus sometimes emits trailing commas, inline comments, or a
# stray fragment after the outer `}` on its larger outputs.
_JSON_TRAILING_COMMA_RE = re.compile(r",(\s*[\]}])")
_JSON_LINE_COMMENT_RE = re.compile(r"//[^\n]*")
_JSON_BLOCK_COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)


def _robust_json_parse(text: str) -> dict:
    """Parse a JSON object from text with heuristic repair.

    Tries raw json.loads first (fast path). On failure, applies :
      1. markdown fence strip
      2. outer-brace extraction
      3. inline + block comment strip
      4. trailing-comma strip
      5. last-balanced close truncation (drops garbage after outer `}`)

    Raises the ORIGINAL JSONDecodeError if every repair fails, so
    callers see the underlying token position in the error message.
    """

    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.split("```", 2)[1]
        if stripped.startswith("json"):
            stripped = stripped[len("json") :]

    # Fast path : try directly on the unmodified payload.
    try:
        return json.loads(stripped)
    except json.JSONDecodeError as first_error:
        pass

    # Outer-brace extraction.
    start = stripped.find("{")
    end = stripped.rfind("}")
    candidate = stripped[start : end + 1] if (start != -1 and end != -1 and end > start) else stripped
    candidate = _JSON_BLOCK_COMMENT_RE.sub("", candidate)
    candidate = _JSON_LINE_COMMENT_RE.sub("", candidate)
    candidate = _JSON_TRAILING_COMMA_RE.sub(r"\1", candidate)

    # Last-balanced truncation (handles stray token after outer `}`).
    depth = 0
    in_string = False
    escape = False
    last_close = -1
    for i, ch in enumerate(candidate):
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch in "{[":
            depth += 1
        elif ch in "}]":
            depth -= 1
            if depth == 0:
                last_close = i
    if last_close >= 0:
        candidate = candidate[: last_close + 1]

    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        # Re-raise the original error so the stack trace points at the
        # true offending position in the raw LLM output.
        raise first_error


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
    # iter-22a (Saad, 2026-04-24) — share the tolerant JSON cleaner
    # used by the testfit agents. Opus' Vision HD on a big plan emits
    # ~15 KB of JSON with occasional stray commas / comments / trailing
    # fragments, which the old two-line stripper couldn't handle. The
    # cleaner handles : markdown fences, trailing commas before ] / },
    # // and /* … */ comments, and most importantly a last-balanced
    # brace truncation that recovers the payload when Opus emits a
    # stray token after the outer `}`.
    return _robust_json_parse(text)


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


# ---------------------------------------------------------------------------
# iter-21b — interior partitioning extraction
# ---------------------------------------------------------------------------
#
# These three helpers convert Vision's pixel-space rooms / walls /
# openings into the FloorPlan's mm plan-local frame. Kept separate from
# `fuse()` so they stay unit-testable without a full PDF round-trip.

_MIN_ROOM_AREA_M2 = 1.0          # drop sub-1 m² polygons — always noise
_MIN_WALL_LEN_MM = 500.0         # drop sub-50 cm walls — Vision fragments
_DEFAULT_WALL_THICKNESS = 150.0  # mm, reasonable cloison placo-sur-ossature


def _polygon_area_mm2(pts: list[Point2D]) -> float:
    """Shoelace, absolute value."""
    if len(pts) < 3:
        return 0.0
    total = 0.0
    n = len(pts)
    for i in range(n):
        a = pts[i]
        b = pts[(i + 1) % n]
        total += a.x * b.y - b.x * a.y
    return abs(total) / 2.0


def _ensure_closed(pts: list[Point2D]) -> list[Point2D]:
    """Drop a trailing duplicate (Vision often repeats the first point)."""
    if len(pts) >= 2:
        first, last = pts[0], pts[-1]
        if abs(first.x - last.x) < 1.0 and abs(first.y - last.y) < 1.0:
            return pts[:-1]
    return pts


def _extract_rooms_from_vision(
    vision: dict,
    image_size: tuple[int, int],
    plate_mm: tuple[float, float],
) -> list[Room]:
    """Convert `vision["rooms_px"]` into a list of `Room` in mm.

    Filters :
    - polygon must have ≥ 3 unique points
    - computed area ≥ 1 m² (parasitic polygons otherwise)
    - label string is preserved verbatim when present — this is what the
      variant generator will reference ("Lot 4", "Chambre", "Entrée").
    """

    raw = vision.get("rooms_px") or []
    if not isinstance(raw, list):
        return []
    out: list[Room] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        pts_px = entry.get("points_px")
        if not isinstance(pts_px, list) or len(pts_px) < 3:
            continue
        pts_mm: list[Point2D] = []
        for p in pts_px:
            if not isinstance(p, (list, tuple)) or len(p) < 2:
                continue
            try:
                x_mm, y_mm = _rescale_px_to_mm(float(p[0]), float(p[1]), image_size, plate_mm)
            except (TypeError, ValueError):
                continue
            pts_mm.append(Point2D(x=x_mm, y=y_mm))
        pts_mm = _ensure_closed(pts_mm)
        if len(pts_mm) < 3:
            continue
        area_mm2 = _polygon_area_mm2(pts_mm)
        area_m2 = area_mm2 / 1_000_000.0
        if area_m2 < _MIN_ROOM_AREA_M2:
            continue
        label = entry.get("label")
        kind = entry.get("kind", "unknown")
        if kind not in {
            "room", "corridor", "wc", "kitchen", "stairwell",
            "terrace", "utility", "unknown",
        }:
            kind = "unknown"
        out.append(
            Room(
                polygon=Polygon2D(points=pts_mm),
                label=str(label) if label else None,
                kind=kind,
                area_m2=round(area_m2, 2),
            )
        )
    return out


def _extract_interior_walls_from_vision(
    vision: dict,
    image_size: tuple[int, int],
    plate_mm: tuple[float, float],
) -> list[InteriorWall]:
    """Convert `vision["interior_walls_px"]` into InteriorWall (mm).

    Filters out segments shorter than 500 mm (Vision fragmentation).
    Does NOT dedupe — the variant generator is happy to see a few
    overlaps, and dedup heuristics on fragmented walls tend to create
    more false merges than real wins at this stage. We can add a
    proper line-merge pass later if it becomes noisy."""

    raw = vision.get("interior_walls_px") or []
    if not isinstance(raw, list):
        return []
    out: list[InteriorWall] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        try:
            x1_mm, y1_mm = _rescale_px_to_mm(
                float(entry["x1"]), float(entry["y1"]), image_size, plate_mm
            )
            x2_mm, y2_mm = _rescale_px_to_mm(
                float(entry["x2"]), float(entry["y2"]), image_size, plate_mm
            )
        except (KeyError, TypeError, ValueError):
            continue
        length = math.hypot(x2_mm - x1_mm, y2_mm - y1_mm)
        if length < _MIN_WALL_LEN_MM:
            continue
        thickness = entry.get("thickness_hint_mm")
        try:
            thickness_mm = float(thickness) if thickness is not None else _DEFAULT_WALL_THICKNESS
        except (TypeError, ValueError):
            thickness_mm = _DEFAULT_WALL_THICKNESS
        thickness_mm = max(50.0, min(500.0, thickness_mm))
        load_bearing = entry.get("is_load_bearing_hint")
        out.append(
            InteriorWall(
                start=Point2D(x=x1_mm, y=y1_mm),
                end=Point2D(x=x2_mm, y=y2_mm),
                thickness_mm=thickness_mm,
                is_load_bearing=load_bearing if isinstance(load_bearing, bool) else None,
            )
        )
    return out


def _extract_openings_from_vision(
    vision: dict,
    image_size: tuple[int, int],
    plate_mm: tuple[float, float],
    *,
    wall_count: int,
) -> list[WallOpening]:
    """Convert `vision["openings_px"]` into WallOpening (mm).

    `wall_count` is used to validate the `in_wall_index_hint` — an
    out-of-range index is coerced to None so downstream doesn't trust
    a bad pointer."""

    raw = vision.get("openings_px") or []
    if not isinstance(raw, list):
        return []
    out: list[WallOpening] = []
    # pixel → mm scale factor for widths (use X axis ; a real architectural
    # plan is close to isotropic so either axis is fine within 1 %).
    img_w, _ = image_size
    pw_mm, _ = plate_mm
    px_to_mm = pw_mm / img_w if img_w > 0 else 1.0
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        center_px = entry.get("center_px")
        if not isinstance(center_px, (list, tuple)) or len(center_px) < 2:
            continue
        try:
            cx_mm, cy_mm = _rescale_px_to_mm(
                float(center_px[0]), float(center_px[1]), image_size, plate_mm
            )
        except (TypeError, ValueError):
            continue
        width_px = entry.get("width_px")
        try:
            width_mm = float(width_px) * px_to_mm if width_px is not None else 900.0
        except (TypeError, ValueError):
            width_mm = 900.0
        width_mm = max(500.0, min(4000.0, width_mm))
        kind_raw = entry.get("kind", "door")
        kind = kind_raw if kind_raw in {
            "door", "passage", "sliding", "double_door", "unknown",
        } else "door"
        wall_idx = entry.get("in_wall_index_hint")
        if not isinstance(wall_idx, int) or wall_idx < 0 or wall_idx >= wall_count:
            wall_idx = None
        out.append(
            WallOpening(
                wall_index=wall_idx,
                center=Point2D(x=cx_mm, y=cy_mm),
                width_mm=width_mm,
                kind=kind,  # type: ignore[arg-type]
            )
        )
    return out


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

    # iter-21c — Calibrate the mm-per-pt scale from Vision's real-world
    # envelope dimensions. The fixture uses MM_PER_PT=500 (a synthetic
    # scale baked into the generator), but real PDFs come in with
    # arbitrary printing scales. Without this, a 25 m × 36 m residential
    # plate like the "Lovable" sample gets rendered as 392 m × 577 m,
    # room areas are 100× too big, and the 2D PlanSvg strokes disappear
    # because they're calibrated for the fixture scale.
    mm_per_pt = MM_PER_PT
    pymupdf_w_mm = (x1_pt - x0_pt) * MM_PER_PT
    pymupdf_h_mm = (y1_pt - y0_pt) * MM_PER_PT
    calibration_note = "scale_calibration: skipped (no Vision dims)"
    if vision and isinstance(vision.get("envelope_real_dimensions_m"), dict):
        real = vision["envelope_real_dimensions_m"]
        try:
            real_w_mm = float(real.get("width_m", 0)) * 1000.0
            real_h_mm = float(real.get("height_m", 0)) * 1000.0
        except (TypeError, ValueError):
            real_w_mm = real_h_mm = 0.0
        # iter-21f (Saad, 2026-04-24) : widened the sanity clamp from
        # [150, 8 000] m² to [30, 50 000] m². Opus sometimes returns
        # slightly undersized estimates for small residential plates
        # (30–80 m²) and oversized ones for commercial floors
        # (10k-40k m²). We only bail out on truly absurd values.
        real_area_m2 = (real_w_mm * real_h_mm) / 1_000_000.0
        if 30.0 <= real_area_m2 <= 50_000.0:
            # Use width-based ratio (height-based would be equivalent
            # within rounding because PyMuPDF aspect ratio is preserved).
            if pymupdf_w_mm > 0:
                mm_per_pt = MM_PER_PT * (real_w_mm / pymupdf_w_mm)
                calibration_note = (
                    f"scale_calibration: vision dims "
                    f"{real_w_mm/1000:.1f}×{real_h_mm/1000:.1f} m"
                    f" → mm_per_pt={mm_per_pt:.2f}"
                )
        else:
            calibration_note = (
                f"scale_calibration: Vision dims out of clamp "
                f"(area={real_area_m2:.0f} m², expected 30-50000)"
            )
    # iter-21f — Secondary fallback : if Vision gave us a scale_label
    # like "1:100" or "1:200", derive the scale from the PDF point
    # dimensions directly. PDF pt = 1/72 inch = 0.352778 mm, so a
    # 1:100 plan drawn at 1 pt = 1/72 inch has 1 pt = 35.28 mm of
    # real-world distance.
    if mm_per_pt == MM_PER_PT and vision:
        label = str(vision.get("scale_label", "")).strip()
        m = re.search(r"1\s*[:/]\s*(\d{1,5})", label)
        if m:
            try:
                denom = int(m.group(1))
                if 20 <= denom <= 2000:
                    mm_per_pt = denom * (25.4 / 72.0)
                    calibration_note = (
                        f"scale_calibration: from label '{label}' "
                        f"→ 1:{denom} → mm_per_pt={mm_per_pt:.2f}"
                    )
            except ValueError:
                pass

    # Flip Y so that plan origin is bottom-left, plate-relative.
    def to_plan_mm(x_pt: float, y_pt: float) -> tuple[float, float]:
        x_mm = (x_pt - x0_pt) * mm_per_pt
        y_mm = ((page_h_pt - y_pt) - (page_h_pt - y1_pt)) * mm_per_pt
        return x_mm, y_mm

    plate_w_mm = (x1_pt - x0_pt) * mm_per_pt
    plate_h_mm = (y1_pt - y0_pt) * mm_per_pt

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
        r_mm = c["r"] * mm_per_pt
        if 0 <= cx_mm <= plate_w_mm and 0 <= cy_mm <= plate_h_mm and 50 < r_mm < 1_200:
            columns_out.append(
                Column(center=Point2D(x=cx_mm, y=cy_mm), radius_mm=r_mm)
            )

    # Cores, stairs from rectangles.
    cores_out: list[TechnicalCore] = []
    stairs_out: list[Stair] = []
    for r in vectors["rects"]:
        w_mm = r["w"] * mm_per_pt
        h_mm = r["h"] * mm_per_pt
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

    # iter-21b — pull existing interior partitioning from Vision. The
    # shell-only pipeline was handing the variant generator a blank box,
    # so the "Lovable" residential plan's 6 apartments got ignored and
    # zones landed at random. With these 3 lists populated, the prompt
    # now passes them downstream as KEEP / MERGE / REPURPOSE inputs.
    rooms_out: list[Room] = []
    interior_walls_out: list[InteriorWall] = []
    openings_out: list[WallOpening] = []
    if vision and image_size:
        rooms_out = _extract_rooms_from_vision(
            vision, image_size, (plate_w_mm, plate_h_mm)
        )
        interior_walls_out = _extract_interior_walls_from_vision(
            vision, image_size, (plate_w_mm, plate_h_mm)
        )
        openings_out = _extract_openings_from_vision(
            vision,
            image_size,
            (plate_w_mm, plate_h_mm),
            wall_count=len(interior_walls_out),
        )

    confidence = 0.9 if vision else 0.7
    base_notes = "Vision HD + PyMuPDF fusion" if vision else "PyMuPDF only (Vision skipped)"
    # iter-21f — surface the scale-calibration decision in source_notes so
    # it's visible in the /api/testfit/generate response and debuggable
    # without re-running the parse.
    notes = f"{base_notes} · {calibration_note}" if vision else base_notes
    # iter-21d — surface the real-world dimensions on the FloorPlan so
    # downstream (SketchUp import, PPT export, dashboards) can label
    # the plate in m² without having to recompute. plate_w/h_mm are
    # already post-scale-calibration above.
    real_width_m = round(plate_w_mm / 1000.0, 3) if plate_w_mm > 0 else None
    real_height_m = round(plate_h_mm / 1000.0, 3) if plate_h_mm > 0 else None
    return FloorPlan(
        level=0,
        name="Lumen plateau (fixture)",
        envelope=envelope,
        columns=columns_out,
        cores=cores_out,
        windows=windows_out,
        stairs=stairs_out,
        rooms=rooms_out,
        interior_walls=interior_walls_out,
        openings=openings_out,
        source_confidence=confidence,
        source_notes=notes,
        real_width_m=real_width_m,
        real_height_m=real_height_m,
    )


def save_source_pdf(raw_bytes: bytes) -> str:
    """Persist an uploaded PDF under `out/plans/{sha256}.pdf` and
    return its content-hash id. Dedupes automatically on re-uploads
    of the same file — the id is deterministic. Returns the id, not
    the path ; callers use `resolve_source_pdf(id)` to get the path."""

    PLANS_DIR.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(raw_bytes).hexdigest()[:32]
    target = PLANS_DIR / f"{digest}.pdf"
    if not target.exists():
        target.write_bytes(raw_bytes)
    return digest


def resolve_source_pdf(plan_source_id: str | None) -> Path | None:
    """Look up the on-disk PDF path for a content-hash id. Returns None
    if the id is unsafe (not 32 hex chars) or the file has been purged."""

    if not plan_source_id:
        return None
    if len(plan_source_id) != 32 or any(
        c not in "0123456789abcdef" for c in plan_source_id
    ):
        return None
    candidate = PLANS_DIR / f"{plan_source_id}.pdf"
    return candidate if candidate.exists() else None


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
