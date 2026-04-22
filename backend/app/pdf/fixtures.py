"""Generate the fictitious Lumen floor plan used in tests and demos.

Per CLAUDE.md §5 : rectangle 60 m × 40 m, columns every 7 m, two technical
cores (elevators + sanitaries), central stair.
"""

from __future__ import annotations

from pathlib import Path

import fitz

# Geometry in millimetres (stored canonically in mm).
PLATE_WIDTH_MM = 60_000
PLATE_HEIGHT_MM = 40_000
COLUMN_SPACING_MM = 7_000
COLUMN_RADIUS_MM = 200
CORE_SIZE_MM = (6_000, 6_000)
STAIR_SIZE_MM = (4_000, 5_000)
WINDOW_LENGTH_MM = 3_000
WINDOW_SPACING_MM = 6_000

# 1 mm on plan → POINTS_PER_MM PostScript points in the PDF (output scale).
POINTS_PER_MM = 0.002  # => 60m becomes 120 pt wide → tight but re-rendered HD later.


def mm_to_pt(mm: float) -> float:
    return mm * POINTS_PER_MM


def generate_lumen_plan_pdf(target: Path) -> Path:
    """Create the reference PDF at `target`. Returns the target path."""

    target.parent.mkdir(parents=True, exist_ok=True)

    # Add some margin around the plan so text labels fit.
    margin_mm = 3_000
    page_w_pt = mm_to_pt(PLATE_WIDTH_MM + 2 * margin_mm)
    page_h_pt = mm_to_pt(PLATE_HEIGHT_MM + 2 * margin_mm)

    doc = fitz.open()
    page = doc.new_page(width=page_w_pt, height=page_h_pt)

    def to_pt(x_mm: float, y_mm: float) -> tuple[float, float]:
        """Convert plan-mm to PDF points, flipping Y (PDF origin at bottom-left)."""
        x_pt = mm_to_pt(x_mm + margin_mm)
        y_pt = page_h_pt - mm_to_pt(y_mm + margin_mm)
        return x_pt, y_pt

    shape = page.new_shape()

    # Envelope (full perimeter).
    corners = [
        (0, 0),
        (PLATE_WIDTH_MM, 0),
        (PLATE_WIDTH_MM, PLATE_HEIGHT_MM),
        (0, PLATE_HEIGHT_MM),
    ]
    pts = [to_pt(*c) for c in corners]
    for i in range(4):
        shape.draw_line(fitz.Point(*pts[i]), fitz.Point(*pts[(i + 1) % 4]))

    # Columns — grid every 7 m, starting 3.5 m from each edge.
    for cx in range(3_500, PLATE_WIDTH_MM, COLUMN_SPACING_MM):
        for cy in range(3_500, PLATE_HEIGHT_MM, COLUMN_SPACING_MM):
            px, py = to_pt(cx, cy)
            r = mm_to_pt(COLUMN_RADIUS_MM)
            shape.draw_circle(fitz.Point(px, py), r)

    # Two technical cores (elevators + WC blocks) at left/right third boundaries.
    core_positions_mm = [
        (18_000, 17_000),  # left core
        (PLATE_WIDTH_MM - 18_000 - CORE_SIZE_MM[0], 17_000),  # right core
    ]
    for cx, cy in core_positions_mm:
        rect_pts = [
            to_pt(cx, cy),
            to_pt(cx + CORE_SIZE_MM[0], cy),
            to_pt(cx + CORE_SIZE_MM[0], cy + CORE_SIZE_MM[1]),
            to_pt(cx, cy + CORE_SIZE_MM[1]),
        ]
        for i in range(4):
            shape.draw_line(
                fitz.Point(*rect_pts[i]),
                fitz.Point(*rect_pts[(i + 1) % 4]),
            )

    # Central stair.
    stair_cx = (PLATE_WIDTH_MM - STAIR_SIZE_MM[0]) / 2
    stair_cy = (PLATE_HEIGHT_MM - STAIR_SIZE_MM[1]) / 2
    stair_pts = [
        to_pt(stair_cx, stair_cy),
        to_pt(stair_cx + STAIR_SIZE_MM[0], stair_cy),
        to_pt(stair_cx + STAIR_SIZE_MM[0], stair_cy + STAIR_SIZE_MM[1]),
        to_pt(stair_cx, stair_cy + STAIR_SIZE_MM[1]),
    ]
    for i in range(4):
        shape.draw_line(
            fitz.Point(*stair_pts[i]),
            fitz.Point(*stair_pts[(i + 1) % 4]),
        )
    # Diagonal line to signal a stair.
    shape.draw_line(fitz.Point(*stair_pts[0]), fitz.Point(*stair_pts[2]))

    # South windows (along y=0).
    x = 3_000
    while x + WINDOW_LENGTH_MM <= PLATE_WIDTH_MM - 3_000:
        start = to_pt(x, 0)
        end = to_pt(x + WINDOW_LENGTH_MM, 0)
        shape.draw_line(fitz.Point(*start), fitz.Point(*end))
        x += WINDOW_LENGTH_MM + WINDOW_SPACING_MM

    # North windows (along y=PLATE_HEIGHT_MM).
    x = 3_000
    while x + WINDOW_LENGTH_MM <= PLATE_WIDTH_MM - 3_000:
        start = to_pt(x, PLATE_HEIGHT_MM)
        end = to_pt(x + WINDOW_LENGTH_MM, PLATE_HEIGHT_MM)
        shape.draw_line(fitz.Point(*start), fitz.Point(*end))
        x += WINDOW_LENGTH_MM + WINDOW_SPACING_MM

    shape.finish(color=(0, 0, 0), width=0.8, closePath=False)
    shape.commit()

    # Text annotations (scale, orientations, label).
    page.insert_text(
        fitz.Point(mm_to_pt(margin_mm), mm_to_pt(margin_mm / 2)),
        "LUMEN — Plateau niveau 1 (60 m x 40 m) — échelle 1:200",
        fontsize=7,
    )
    page.insert_text(
        fitz.Point(mm_to_pt(margin_mm), page_h_pt - mm_to_pt(margin_mm + PLATE_HEIGHT_MM + 1000)),
        "Facade Sud (rue)",
        fontsize=6,
    )
    page.insert_text(
        fitz.Point(mm_to_pt(margin_mm), mm_to_pt(margin_mm)),
        "Facade Nord (cour)",
        fontsize=6,
    )

    doc.save(target)
    doc.close()
    return target


if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "data" / "fixtures" / "lumen_plan.pdf"
    generate_lumen_plan_pdf(out)
    print(f"Wrote {out}")
