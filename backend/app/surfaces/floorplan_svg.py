"""2D top-down SVG rendering of a `FloorPlan` + `VariantOutput`.

Iter-17 D (P0). Saad asked for a clean 2D view in Test Fit, on top of
the 3D SketchUp screenshots. This module is the backend generator ;
the frontend 2D/3D toggle lands in iter-18 with the Claude Design
handoff.

The SVG is designed to double as :

- the Test Fit 2D viewer (zoomable, light grey plan + coloured zones),
- the input image for the NanoBanana zone-overlay pipeline
  (`zone_overlay.py`, iter-17 C) — we hand it a coloured plan and ask
  it to paint over the architectural drawing's real PDF while
  preserving the line work.

Design decisions :

- viewBox in millimetres, origin bottom-left (matches FloorPlan).
  We flip Y for SVG by negating the coordinate and offsetting by the
  envelope height — keeps the rest of the code in mm.
- Each zone gets a unique 1-based number; the legend at the bottom
  right enumerates them. The micro-zoning output can reference
  "zone 3" etc. deterministically.
- Palette matches `design://adjacency-rules` functional colours
  (forest / sand / clay / sun / mint) and the Organic Modern tokens
  used by the frontend.
- Pure stdlib — no matplotlib, no cairosvg. Keeps the pipeline cheap
  and deterministic.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from app.models import FloorPlan, VariantOutput


# Functional category → fill colour.  Matches the Organic Modern palette
# and the informal legend in design://adjacency-rules.
_CATEGORY_FILL: dict[str, str] = {
    "work": "#3A5A4F",          # forest — desks, focus clusters
    "collab": "#C9B79C",         # sand — meeting, huddle, project rooms
    "support": "#A0522D",        # clay — phone booths, print, storage
    "hospitality": "#E8C547",    # sun — café, kitchen, town hall
    "biophilic": "#6B8F7F",      # mint — planting, wellness pods
    "circulation": "#E8E4DC",    # mist — pure visual indicator, rarely labelled
    "unknown": "#B8B1A5",        # warm grey fallback
}

_CATEGORY_LABEL: dict[str, str] = {
    "work": "Work",
    "collab": "Collab",
    "support": "Support",
    "hospitality": "Hospitality",
    "biophilic": "Biophilic",
    "circulation": "Circulation",
    "unknown": "Other",
}

# SketchUp tool name → functional category.  Anything missing collapses
# to "unknown" — the renderer still draws the zone, just in warm grey.
_TOOL_CATEGORY: dict[str, str] = {
    "create_workstation_cluster": "work",
    "create_focus_room": "work",
    "create_meeting_room": "collab",
    "create_huddle": "collab",
    "create_training_room": "collab",
    "create_collab_zone": "collab",
    "create_phone_booth": "support",
    "create_print_alcove": "support",
    "create_storage_wall": "support",
    "create_partition_wall": "support",
    "create_cafe": "hospitality",
    "create_kitchenette": "hospitality",
    "create_town_hall": "hospitality",
    "create_hospitality_zone": "hospitality",
    "apply_biophilic_zone": "biophilic",
    "create_wellness_pod": "biophilic",
}


@dataclass(frozen=True)
class _ZoneShape:
    """Internal — a rectangle in mm coordinates, indexed by display number."""

    number: int
    label: str
    category: str
    x_mm: float
    y_mm: float
    w_mm: float
    h_mm: float


def _tool_to_category(tool: str) -> str:
    return _TOOL_CATEGORY.get(tool, "unknown")


def _extract_rect(params: dict[str, Any]) -> tuple[float, float, float, float] | None:
    """Turn the many shapes of SketchUp params into (x, y, w, h) in mm."""

    bbox = params.get("bbox_mm")
    if isinstance(bbox, (list, tuple)) and len(bbox) == 4:
        x, y, w, h = bbox
        return float(x), float(y), float(w), float(h)

    c1 = params.get("corner1_mm")
    c2 = params.get("corner2_mm")
    if (
        isinstance(c1, (list, tuple))
        and len(c1) == 2
        and isinstance(c2, (list, tuple))
        and len(c2) == 2
    ):
        x1, y1 = float(c1[0]), float(c1[1])
        x2, y2 = float(c2[0]), float(c2[1])
        return min(x1, x2), min(y1, y2), abs(x2 - x1), abs(y2 - y1)

    origin = params.get("origin_mm") or params.get("position_mm")
    if isinstance(origin, (list, tuple)) and len(origin) == 2:
        x, y = float(origin[0]), float(origin[1])
        # Workstation clusters carry count + row spacing ; synthesise a bbox
        # from these when they're present.
        count = int(params.get("count", 1) or 1)
        row_spacing = float(params.get("row_spacing_mm", 1600) or 1600)
        # A single desk footprint ≈ 1.6 m × 0.8 m; grow along row_spacing.
        w = max(1600.0, count * 1600.0)
        h = row_spacing
        return x, y, w, h

    pos = params.get("position_mm")
    if isinstance(pos, (list, tuple)) and len(pos) == 2:
        x, y = float(pos[0]), float(pos[1])
        return x - 600.0, y - 600.0, 1200.0, 1200.0  # 1.2 m × 1.2 m default

    return None


def _collect_zone_shapes(variant: VariantOutput) -> list[_ZoneShape]:
    shapes: list[_ZoneShape] = []
    for i, entry in enumerate(variant.sketchup_trace, start=1):
        tool = str(entry.get("tool", ""))
        params = entry.get("params") or {}
        rect = _extract_rect(params)
        if rect is None:
            continue
        x, y, w, h = rect
        if w <= 0 or h <= 0:
            continue
        category = _tool_to_category(tool)
        label = (
            params.get("name")
            or params.get("label")
            or tool.replace("create_", "").replace("_", " ").strip()
        )
        shapes.append(
            _ZoneShape(
                number=len(shapes) + 1,  # renumber after filtering
                label=str(label),
                category=category,
                x_mm=x,
                y_mm=y,
                w_mm=w,
                h_mm=h,
            )
        )
    return shapes


def _envelope_bbox(plan: FloorPlan) -> tuple[float, float, float, float]:
    xs = [p.x for p in plan.envelope.points]
    ys = [p.y for p in plan.envelope.points]
    return min(xs), min(ys), max(xs), max(ys)


def _flip(points: Iterable[Any], *, y_max: float) -> str:
    """SVG path coordinates — flip Y around `y_max` so north appears up."""

    return " ".join(f"{p.x:.1f},{y_max - p.y:.1f}" for p in points)


def render_floorplan_svg(
    plan: FloorPlan,
    variant: VariantOutput | None = None,
    *,
    width_px: int = 1440,
    show_legend: bool = True,
) -> str:
    """Render a floor plan (with optional variant overlay) as an SVG string.

    Coordinates in mm, origin bottom-left. We flip Y to SVG's top-left
    convention inline so north is up on screen.
    """

    x0, y0, x1, y1 = _envelope_bbox(plan)
    w_mm = x1 - x0
    h_mm = y1 - y0
    pad = 2000.0  # 2 m padding around the envelope
    view_x = x0 - pad
    view_y = -pad
    view_w = w_mm + 2 * pad
    view_h = h_mm + 2 * pad

    aspect = view_w / view_h if view_h else 1.78
    height_px = max(320, int(round(width_px / aspect)))

    zones = _collect_zone_shapes(variant) if variant else []

    lines: list[str] = []
    lines.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{width_px}" height="{height_px}" '
        f'viewBox="{view_x:.1f} {view_y:.1f} {view_w:.1f} {view_h:.1f}" '
        f'font-family="Inter, system-ui, sans-serif" '
        f'role="img" aria-label="Floor plan 2D top-down">'
    )
    lines.append(
        '<defs>'
        '<style type="text/css"><![CDATA[\n'
        '.env { fill: #FAF7F2; stroke: #6C6960; stroke-width: 60; }\n'
        '.core { fill: #CFC9BE; stroke: #6C6960; stroke-width: 40; }\n'
        '.stair { fill: #E8E4DC; stroke: #6C6960; stroke-width: 40; }\n'
        '.win { stroke: #2F4A3F; stroke-width: 80; }\n'
        '.col { fill: #6C6960; }\n'
        '.zone-label { fill: #FAF7F2; font-size: 360px; font-weight: 600; dominant-baseline: central; text-anchor: middle; }\n'
        '.legend-bg { fill: #FAF7F2; stroke: #6C6960; stroke-width: 20; }\n'
        '.legend-text { fill: #1C1F1A; font-size: 300px; }\n'
        '.legend-heading { fill: #1C1F1A; font-size: 320px; font-weight: 700; letter-spacing: 40px; }\n'
        ']]></style>'
        '</defs>'
    )

    # --- Envelope shell -----------------------------------------------------
    lines.append(
        f'<polygon class="env" points="{_flip(plan.envelope.points, y_max=y1)}" />'
    )

    # --- Cores --------------------------------------------------------------
    for core in plan.cores:
        klass = "stair" if core.kind == "stair" else "core"
        lines.append(
            f'<polygon class="{klass}" points="{_flip(core.outline.points, y_max=y1)}" />'
        )

    # --- Stairs (when modelled as separate objects) ------------------------
    for stair in plan.stairs:
        lines.append(
            f'<polygon class="stair" points="{_flip(stair.outline.points, y_max=y1)}" />'
        )

    # --- Windows ------------------------------------------------------------
    for win in plan.windows:
        lines.append(
            f'<path class="win" d="M {win.start.x:.1f},{y1 - win.start.y:.1f} '
            f'L {win.end.x:.1f},{y1 - win.end.y:.1f}" />'
        )

    # --- Columns ------------------------------------------------------------
    for col in plan.columns:
        r = max(150.0, col.radius_mm)
        if col.square:
            lines.append(
                f'<rect class="col" x="{col.center.x - r:.1f}" '
                f'y="{y1 - col.center.y - r:.1f}" width="{2 * r:.1f}" height="{2 * r:.1f}" />'
            )
        else:
            lines.append(
                f'<circle class="col" cx="{col.center.x:.1f}" '
                f'cy="{y1 - col.center.y:.1f}" r="{r:.1f}" />'
            )

    # --- Zones --------------------------------------------------------------
    for z in zones:
        fill = _CATEGORY_FILL.get(z.category, _CATEGORY_FILL["unknown"])
        lines.append(
            f'<g opacity="0.86">'
            f'<rect x="{z.x_mm:.1f}" y="{y1 - z.y_mm - z.h_mm:.1f}" '
            f'width="{z.w_mm:.1f}" height="{z.h_mm:.1f}" '
            f'fill="{fill}" stroke="#1C1F1A" stroke-width="30" rx="120" />'
            f'<text class="zone-label" x="{z.x_mm + z.w_mm / 2:.1f}" '
            f'y="{y1 - z.y_mm - z.h_mm / 2:.1f}">{z.number}</text>'
            f'</g>'
        )

    # --- Legend -------------------------------------------------------------
    if show_legend and zones:
        # Bottom-right corner, stacked rows. One row = 500 mm.
        categories_present = []
        seen = set()
        for z in zones:
            if z.category not in seen:
                seen.add(z.category)
                categories_present.append(z.category)
        rows = len(categories_present)
        legend_w = 8000.0
        legend_h = 1200.0 + rows * 700.0
        legend_x = x1 - legend_w
        legend_y_top = -pad + 600.0
        lines.append(
            f'<rect class="legend-bg" x="{legend_x:.1f}" y="{legend_y_top:.1f}" '
            f'width="{legend_w:.1f}" height="{legend_h:.1f}" rx="120" />'
        )
        lines.append(
            f'<text class="legend-heading" x="{legend_x + 400:.1f}" '
            f'y="{legend_y_top + 700:.1f}">LEGEND · ZONES</text>'
        )
        for i, cat in enumerate(categories_present):
            ry = legend_y_top + 1200.0 + i * 700.0
            lines.append(
                f'<rect x="{legend_x + 400:.1f}" y="{ry:.1f}" '
                f'width="500" height="500" fill="{_CATEGORY_FILL.get(cat, _CATEGORY_FILL["unknown"])}" '
                f'stroke="#1C1F1A" stroke-width="30" rx="80" />'
            )
            lines.append(
                f'<text class="legend-text" x="{legend_x + 1100:.1f}" '
                f'y="{ry + 400:.1f}">{_CATEGORY_LABEL.get(cat, cat.title())}</text>'
            )

    # --- North marker --------------------------------------------------------
    north_x = x0 + 800.0
    north_y = -pad + 1400.0
    lines.append(
        f'<g><circle cx="{north_x:.1f}" cy="{north_y:.1f}" r="380" fill="#FAF7F2" '
        f'stroke="#1C1F1A" stroke-width="50" />'
        f'<text x="{north_x:.1f}" y="{north_y + 120:.1f}" text-anchor="middle" '
        f'font-size="420" font-weight="700" fill="#1C1F1A">N</text></g>'
    )

    lines.append("</svg>")
    return "".join(lines)
