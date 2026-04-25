"""iter-27 P2 L3 live verification on Bâtiment A.

Runs the full hybrid parse pipeline (PyMuPDF + Vision HD) on the
cached Bâtiment A PDF and prints :

  1. Whether Vision returned `envelope_bbox_px` and its values
  2. Every WARNING the parser emitted (room / wall / opening rejection,
     malformed envelope_bbox_px) with the full structured payload
  3. Final FloorPlan stats : room count, wall count, plate dimensions
  4. Coordinate bounds — every room polygon must sit inside
     [0, plate_w_mm] × [0, plate_h_mm]

Then re-runs on the Lumen fixture (no Vision payload by default since
fixture path skips it) to prove non-regression.
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass

from app.pdf.parser import (  # noqa: E402
    PLANS_DIR,
    call_vision_hd,
    extract_vectors_pymupdf,
    fuse,
    render_page_to_png_bytes,
)


BATIMENT_A_HASH = "f616c5f508eacfc7deac6f311f31ceaa"
LUMEN_FIXTURE = (
    Path(__file__).resolve().parents[1]
    / "app" / "data" / "fixtures" / "lumen_plan.pdf"
)


class _StructuredHandler(logging.Handler):
    """Capture WARNING records with their `extra=` payload intact."""

    def __init__(self) -> None:
        super().__init__(level=logging.WARNING)
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


def _attach_handler() -> _StructuredHandler:
    handler = _StructuredHandler()
    parser_logger = logging.getLogger("design_office.pdf.parser")
    parser_logger.setLevel(logging.WARNING)
    parser_logger.addHandler(handler)
    return handler


def _print_records(handler: _StructuredHandler, label: str) -> None:
    print(f"\n[{label}] structured warnings : {len(handler.records)}")
    for rec in handler.records:
        # Pull every extra attribute (anything not in the standard
        # LogRecord set is from `extra=`).
        std = set(logging.LogRecord(
            "x", logging.WARNING, "x", 0, "x", None, None
        ).__dict__.keys()) | {"message"}
        extras = {k: v for k, v in rec.__dict__.items() if k not in std}
        print(f"  · {rec.message}")
        print(f"    {json.dumps(extras, default=str, ensure_ascii=False)}")


def _bounds_of_floor_plan(plan: object) -> dict:
    """Walk every polygon-bearing collection and report mm bounds."""

    xs: list[float] = []
    ys: list[float] = []

    for room in getattr(plan, "rooms", []) or []:
        for p in room.polygon.points:
            xs.append(p.x)
            ys.append(p.y)
    for wall in getattr(plan, "interior_walls", []) or []:
        xs.extend([wall.start.x, wall.end.x])
        ys.extend([wall.start.y, wall.end.y])

    if not xs or not ys:
        return {"rooms_walls_count": 0, "min": None, "max": None}
    return {
        "rooms_walls_count": len(xs),
        "x_min": round(min(xs), 1), "x_max": round(max(xs), 1),
        "y_min": round(min(ys), 1), "y_max": round(max(ys), 1),
    }


def _run_one(label: str, pdf_path: Path, *, use_vision: bool) -> dict:
    print(f"\n{'='*70}\n  {label} — {pdf_path.name}\n{'='*70}")
    handler = _attach_handler()
    try:
        # Parse hybrid manually so we can intercept the Vision dict.
        vectors = extract_vectors_pymupdf(pdf_path)
        vision = None
        image_size = None
        if use_vision:
            from PIL import Image
            import io

            png = render_page_to_png_bytes(pdf_path)
            img = Image.open(io.BytesIO(png))
            image_size = img.size
            print(f"  Image size : {image_size[0]} × {image_size[1]} px")
            print(f"  Calling Vision HD …")
            vision = call_vision_hd(png, tag=f"iter27.live.{label.lower()}")
            print(f"  Vision returned. Top-level keys : {sorted(vision.keys())}")
            # iter-27 P2 L3 — surface the envelope_bbox_px field.
            ebbox = vision.get("envelope_bbox_px")
            print(f"  envelope_bbox_px : {ebbox!r}")
            print(
                f"  rooms_px count : {len(vision.get('rooms_px') or [])}"
            )
            print(
                f"  interior_walls_px count : "
                f"{len(vision.get('interior_walls_px') or [])}"
            )
            print(
                f"  openings_px count : "
                f"{len(vision.get('openings_px') or [])}"
            )
        plan = fuse(
            vectors, vision, image_size=image_size,
            project_id=pdf_path.stem,
        )
        print(f"\n  FloorPlan summary :")
        print(f"    plate (mm) : {plan.real_width_m} × {plan.real_height_m} m")
        print(f"    rooms : {len(plan.rooms)}")
        print(f"    interior_walls : {len(plan.interior_walls)}")
        print(f"    openings : {len(plan.openings)}")
        print(f"    notes : {plan.source_notes}")
        bounds = _bounds_of_floor_plan(plan)
        print(f"    coords bounds : {bounds}")
        # CRITICAL invariant — no room polygon vertex outside the plate.
        plate_w_mm = (plan.real_width_m or 0) * 1000.0
        plate_h_mm = (plan.real_height_m or 0) * 1000.0
        if bounds.get("x_min") is not None:
            tolerance_mm = 50.0
            assert bounds["x_min"] >= -tolerance_mm, (
                f"x_min {bounds['x_min']} < 0 — clamp/reject failed"
            )
            assert bounds["y_min"] >= -tolerance_mm, (
                f"y_min {bounds['y_min']} < 0 — clamp/reject failed"
            )
            assert bounds["x_max"] <= plate_w_mm + tolerance_mm, (
                f"x_max {bounds['x_max']} > plate_w {plate_w_mm} — overflow"
            )
            assert bounds["y_max"] <= plate_h_mm + tolerance_mm, (
                f"y_max {bounds['y_max']} > plate_h {plate_h_mm} — overflow"
            )
            print(f"    ✓ all coords inside [0, plate]")
        _print_records(handler, label)
        return {
            "label": label,
            "vision_envelope_bbox_px": vision.get("envelope_bbox_px") if vision else None,
            "rooms_count": len(plan.rooms),
            "walls_count": len(plan.interior_walls),
            "openings_count": len(plan.openings),
            "warnings_count": len(handler.records),
            "bounds": bounds,
            "plate_w_m": plan.real_width_m,
            "plate_h_m": plan.real_height_m,
        }
    finally:
        logging.getLogger("design_office.pdf.parser").removeHandler(handler)


def main() -> int:
    batiment_a = PLANS_DIR / f"{BATIMENT_A_HASH}.pdf"
    if not batiment_a.exists():
        print(f"Bâtiment A PDF not found at {batiment_a}", file=sys.stderr)
        return 2
    if not LUMEN_FIXTURE.exists():
        print(f"Lumen fixture not found at {LUMEN_FIXTURE}", file=sys.stderr)
        return 3

    bat = _run_one("Bâtiment A", batiment_a, use_vision=True)
    lum = _run_one("Lumen fixture (no Vision)", LUMEN_FIXTURE, use_vision=False)

    print(f"\n{'='*70}\n  Summary\n{'='*70}")
    print(json.dumps([bat, lum], indent=2, ensure_ascii=False, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
