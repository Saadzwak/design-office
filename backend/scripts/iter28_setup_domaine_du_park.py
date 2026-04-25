"""iter-28 — cache the new working plan (SDC Domaine du Park).

One-shot setup script :
  1. Read the PDF from Saad's Downloads folder.
  2. Hand it to save_source_pdf (creates the .pdf + sister .png in
     backend/app/out/plans/<sha32>.{pdf,png}).
  3. Parse it with Vision HD on, print envelope dims + room count
     so Saad can confirm the calibration looks reasonable before
     we run the full testfit chain on it.
"""

from __future__ import annotations

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
    parse_pdf,
    resolve_source_pdf,
    resolve_source_png,
    save_source_pdf,
)


SOURCE_PDF = Path(r"C:\Users\redaz\Downloads\SDC DOMAINE DU PARK_REP GT-5.pdf")


def main() -> int:
    if not SOURCE_PDF.exists():
        print(f"PDF missing at {SOURCE_PDF}", file=sys.stderr)
        return 2

    raw = SOURCE_PDF.read_bytes()
    print(f"[1/3] Source PDF : {SOURCE_PDF.name} ({len(raw):,} bytes)")

    plan_id = save_source_pdf(raw)
    pdf_path = resolve_source_pdf(plan_id)
    png_path = resolve_source_png(plan_id)
    print(f"[2/3] Cached as {plan_id}")
    print(f"      PDF : {pdf_path}")
    print(f"      PNG : {png_path}")

    print(f"[3/3] Parsing with Vision HD on …")
    plan = parse_pdf(pdf_path, use_vision=True, project_id=plan_id)
    print(
        f"      envelope : {plan.real_width_m} × {plan.real_height_m} m"
    )
    print(f"      rooms : {len(plan.rooms)}")
    print(f"      columns : {len(plan.columns)}")
    print(f"      cores : {len(plan.cores)}")
    print(f"      stairs : {len(plan.stairs)}")
    print(f"      windows : {len(plan.windows)}")
    print(f"      interior_walls : {len(plan.interior_walls)}")
    print(f"      notes : {plan.source_notes}")
    print(f"\n      plan_source_id (note for live tests) : {plan_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
