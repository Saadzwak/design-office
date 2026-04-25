"""Render side-by-side PNG previews of the three Stage-2 mood-board
directions for the Lumen fixture.

Usage:
    python scripts/moodboard_three_dir_preview.py

Reads `.env` for FAL_KEY, runs the visual moodboard surface for each
direction, lays out the resulting A3 PDFs into a single comparison
PNG saved at `docs/screenshots/iter30b-stage2-three-directions.png`.

Designed for offline visual review — no fal.ai calls when the cache
is warm. Stage 3 prompt iteration uses the same script: tweak the
prompts in `app/surfaces/visual_moodboard.py`, re-run, compare.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

# Load .env so FAL_KEY is available without manual export.
env_path = REPO_ROOT / ".env"
if env_path.exists():
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key.strip(), val.strip())


from app.models import VariantMetrics, VariantOutput  # noqa: E402
from app.services.nanobanana_client import NanoBananaClient  # noqa: E402
from app.surfaces.moodboard import (  # noqa: E402
    ClientInfo,
    render_pdf_from_selection,
)
from app.surfaces.visual_moodboard import (  # noqa: E402
    VisualMoodBoardRequest,
    VisualMoodBoardSurface,
    list_directions_for,
)

FIXTURE_PATH = REPO_ROOT / "frontend" / "public" / "moodboard-fixtures" / "lumen_atelier.json"
PDF_DIR = REPO_ROOT / "backend" / "app" / "out" / "moodboard"
OUT_PATH = REPO_ROOT / "docs" / "screenshots" / "iter30b-stage2-three-directions.png"


def main() -> int:
    if not FIXTURE_PATH.exists():
        print(f"Lumen fixture not found at {FIXTURE_PATH}", file=sys.stderr)
        return 1
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    metrics = VariantMetrics(
        workstation_count=0,
        meeting_room_count=0,
        phone_booth_count=0,
        collab_surface_m2=0,
        amenity_surface_m2=0,
        circulation_m2=0,
        total_programmed_m2=0,
        flex_ratio_applied=0,
    )
    variant = VariantOutput(
        style="atelier",
        title="The Workshop",
        narrative="Focused craft.",
        metrics=metrics,
        zones=[],
    )
    client_info = ClientInfo(name="Lumen", industry="tech_startup")

    nb = NanoBananaClient()
    surf = VisualMoodBoardSurface(client=nb)

    pdf_paths: list[tuple[str, str, Path]] = []

    for direction in list_directions_for("tech_startup"):
        slug = direction["slug"]
        name = direction["name"]
        print(f"== {name} ({slug}) ==")
        gallery = surf.generate_gallery(
            VisualMoodBoardRequest(
                client_name=client_info.name,
                industry=client_info.industry,
                variant=variant,
                mood_board_selection=fixture,
                aspect_ratio="3:2",
                direction=slug,
            )
        )
        print(
            f"  gallery: {len(gallery.tiles)} tiles, "
            f"{gallery.cache_hits} cache hits"
        )
        items = surf.generate_item_tiles(
            VisualMoodBoardRequest(
                client_name=client_info.name,
                industry=client_info.industry,
                variant=variant,
                mood_board_selection=fixture,
                aspect_ratio="4:3",
                direction=slug,
            )
        )
        print(
            f"  items:   {len(items.tiles)} tiles, "
            f"{items.cache_hits} cache hits, {len(items.skipped_errors)} errors"
        )
        gallery_paths = {
            t.label: str(nb.cache_dir / f"{t.visual_image_id}.png")
            for t in gallery.tiles
        }
        item_paths = {
            t.item_key: str(nb.cache_dir / f"{t.visual_image_id}.png")
            for t in items.tiles
        }
        pdf_id = render_pdf_from_selection(
            client=client_info,
            variant=variant,
            selection=fixture,
            gallery_tile_paths=gallery_paths,
            item_tile_paths=item_paths,
            direction=slug,
        )
        print(f"  pdf_id:  {pdf_id}")
        pdf_paths.append((slug, name, PDF_DIR / f"{pdf_id}.pdf"))

    # Render the 3 PDFs side-by-side at uniform width.
    import pymupdf  # type: ignore[import-not-found]
    from PIL import Image, ImageDraw, ImageFont  # type: ignore[import-not-found]

    page_pixmaps = []
    for slug, name, pdf_path in pdf_paths:
        if not pdf_path.exists():
            print(f"  ! PDF missing: {pdf_path}", file=sys.stderr)
            continue
        d = pymupdf.open(str(pdf_path))
        # 1.6× zoom keeps each tile around ~1900×1340 px — readable
        # without bloating the comparison file past ~3 MB total.
        pix = d[0].get_pixmap(matrix=pymupdf.Matrix(1.6, 1.6))
        page_pixmaps.append((slug, name, pix))

    if not page_pixmaps:
        print("No PDFs rendered — nothing to compare.", file=sys.stderr)
        return 2

    # Vertical stack with a 32px gutter and a small caption per page.
    pages = [
        Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        for _, _, pix in page_pixmaps
    ]
    caption_h = 56
    gutter = 32
    width = max(p.width for p in pages)
    total_h = sum(p.height + caption_h for p in pages) + gutter * (len(pages) - 1)
    canvas = Image.new("RGB", (width, total_h), (250, 247, 242))
    try:
        font = ImageFont.truetype("arial.ttf", 28)
    except OSError:
        font = ImageFont.load_default()
    y = 0
    for (slug, name, _), page in zip(page_pixmaps, pages):
        draw = ImageDraw.Draw(canvas)
        draw.text((24, y + 12), f"{name} — {slug}", fill=(28, 31, 26), font=font)
        canvas.paste(page, (0, y + caption_h))
        y += page.height + caption_h + gutter

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT_PATH, format="PNG", optimize=True)
    print(f"\nSaved comparison: {OUT_PATH}")
    print(f"  size: {OUT_PATH.stat().st_size / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
