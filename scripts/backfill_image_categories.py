"""Iter-33 follow-up — backfill `{cache_key}.json` sidecars for every
PNG in the NanoBanana cache, using Claude Haiku Vision to classify
each image's content category.

Why
---
The NanoBanana cache is just opaque PNGs (357 of them). Without a
sidecar, the demo fallback used to pick a random aspect-matching image
when fal.ai had no cache hit, so a "European oak" prompt could be
served a plant photograph. With sidecars in place, the fallback can
filter by category.

This script is idempotent : it skips any PNG whose sidecar already has
a known category (anything other than "unknown"). Re-running after a
new fal.ai run only classifies the freshly added images.

Usage
-----
    cd backend
    ANTHROPIC_API_KEY=sk-ant-... python ../scripts/backfill_image_categories.py

Optional flags::

    --concurrency N   number of parallel Haiku calls (default 5)
    --limit N         only process N images (smoke test)
    --force           re-classify even images that already have a sidecar
    --dry-run         classify but don't write sidecars

Cost
----
Roughly $0.001-0.002 per image with Haiku 4.5 → ~$0.50-0.70 for the
whole 357-image cache. Wall-clock is ~3-5 minutes at concurrency 5.
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures as cf
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = REPO_ROOT / "backend" / "app" / "data" / "generated_images"
HAIKU_MODEL = "claude-haiku-4-5-20251001"

# Categories must mirror the constants in `nanobanana_client.py`. We
# duplicate them here as plain strings to keep the script standalone
# (no app-package import required at run time).
KNOWN_CATEGORIES = {
    "material",
    "furniture",
    "plant",
    "light",
    "gallery_atmosphere",
    "gallery_biophilic",
    "gallery_materials",
    "gallery_furniture",
    "hero_composite",
    "unknown",
}

# Map Haiku's free-form one-word answer to one of our categories.
LABEL_ALIASES = {
    "material": "material",
    "materials": "material",
    "swatch": "material",
    "fabric": "material",
    "textile": "material",
    "tile": "material",
    "stone": "material",
    "wood": "material",
    "panel": "material",
    "furniture": "furniture",
    "chair": "furniture",
    "sofa": "furniture",
    "table": "furniture",
    "desk": "furniture",
    "lounge": "furniture",
    "armchair": "furniture",
    "stool": "furniture",
    "shelf": "furniture",
    "plant": "plant",
    "plants": "plant",
    "tree": "plant",
    "flower": "plant",
    "foliage": "plant",
    "light": "light",
    "lamp": "light",
    "lighting": "light",
    "fixture": "light",
    "pendant": "light",
    "sconce": "light",
    "atmosphere": "gallery_atmosphere",
    "interior": "gallery_atmosphere",
    "room": "gallery_atmosphere",
    "scene": "gallery_atmosphere",
    "biophilic": "gallery_biophilic",
    "garden": "gallery_biophilic",
    "moodboard": "gallery_materials",
    "composition": "gallery_materials",
    "spread": "gallery_materials",
    "layout": "gallery_materials",
    "hero": "hero_composite",
    "composite": "hero_composite",
    "collage": "hero_composite",
}

CLASSIFY_PROMPT = (
    "You are classifying an editorial product photograph for an interior "
    "architecture mood board. Reply with ONE WORD ONLY, lowercase, no "
    "punctuation, picked from EXACTLY this list:\n"
    "  material   = a single material swatch / sample (oak panel, "
    "stone tile, fabric, terracotta, plaster, brass)\n"
    "  furniture  = a single furniture piece (chair, table, sofa, "
    "phone booth, lounge)\n"
    "  plant      = a single plant in a pot (no chair, no table)\n"
    "  light      = a single light fixture (pendant, lamp, sconce)\n"
    "  atmosphere = a wide interior scene with multiple elements (room, "
    "studio, hallway)\n"
    "  biophilic  = a wide interior scene where plants are the subject\n"
    "  composition = multiple swatches or items arranged on a surface "
    "(mood-board layout)\n"
    "Reply with one of these words exactly. Nothing else."
)


def _utc_iso_now() -> str:
    return datetime.now(tz=timezone.utc).isoformat(timespec="seconds")


def _read_existing_sidecar(png: Path) -> dict | None:
    sidecar = png.with_suffix(".json")
    if not sidecar.exists():
        return None
    try:
        data = json.loads(sidecar.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def _classify_one(client, png: Path) -> tuple[str, str]:
    """Send the PNG to Haiku Vision, return `(category, raw_label)`."""

    try:
        png_bytes = png.read_bytes()
    except OSError as exc:
        return ("unknown", f"read_error:{exc}")

    if len(png_bytes) > 5 * 1024 * 1024:
        # Anthropic limits images to ~5 MB. Cached fal.ai PNGs are
        # typically 1-2 MB, so this is just a safety net.
        return ("unknown", "image_too_large")

    b64 = base64.standard_b64encode(png_bytes).decode("ascii")
    try:
        resp = client.messages.create(
            model=HAIKU_MODEL,
            max_tokens=20,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/png",
                                "data": b64,
                            },
                        },
                        {"type": "text", "text": CLASSIFY_PROMPT},
                    ],
                }
            ],
        )
    except Exception as exc:  # noqa: BLE001
        return ("unknown", f"api_error:{type(exc).__name__}:{str(exc)[:120]}")

    raw = ""
    for block in resp.content:
        if getattr(block, "type", None) == "text":
            raw = (raw + " " + block.text).strip()
    raw = raw.lower().strip(".,;:!? \n\t")
    # Keep only the first word — Haiku occasionally adds a trailing period.
    first_word = raw.split()[0] if raw else ""
    category = LABEL_ALIASES.get(first_word, "unknown")
    return (category, raw or "(empty)")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--concurrency", type=int, default=5)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--force", action="store_true",
                        help="Re-classify even images that already have a sidecar.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not CACHE_DIR.exists():
        print(f"cache dir not found: {CACHE_DIR}", file=sys.stderr)
        return 2

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY not set", file=sys.stderr)
        return 2

    try:
        from anthropic import Anthropic
    except ImportError:
        print("anthropic SDK not installed — pip install anthropic", file=sys.stderr)
        return 2

    client = Anthropic(api_key=api_key)

    pngs = sorted(CACHE_DIR.glob("*.png"))
    if args.limit:
        pngs = pngs[: args.limit]

    todo: list[Path] = []
    skipped_existing = 0
    for p in pngs:
        if args.force:
            todo.append(p)
            continue
        existing = _read_existing_sidecar(p)
        if existing and existing.get("category") and existing.get("category") != "unknown":
            skipped_existing += 1
            continue
        todo.append(p)

    print(
        f"cache_dir={CACHE_DIR}  total={len(pngs)}  todo={len(todo)}  "
        f"skipped_existing={skipped_existing}  concurrency={args.concurrency}"
    )

    if not todo:
        print("nothing to do — every cached PNG already has a known category.")
        return 0

    counts: dict[str, int] = {}
    started = time.time()

    def _worker(png: Path) -> tuple[Path, str, str]:
        cat, raw = _classify_one(client, png)
        return (png, cat, raw)

    with cf.ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        for i, (png, cat, raw) in enumerate(
            pool.map(_worker, todo), start=1
        ):
            counts[cat] = counts.get(cat, 0) + 1

            sidecar = png.with_suffix(".json")
            existing = _read_existing_sidecar(png) or {}
            payload = {
                "cache_key": png.stem,
                "category": cat,
                "item_key": existing.get("item_key"),
                "prompt": existing.get("prompt"),  # unknown for backfilled
                "model": existing.get("model", "fal-ai/nano-banana-pro"),
                "aspect_ratio": existing.get("aspect_ratio"),
                "generated_at": existing.get("generated_at"),
                "classified_at": _utc_iso_now(),
                "classified_by": HAIKU_MODEL,
                "classifier_raw_label": raw,
                "schema_version": 1,
            }
            if not args.dry_run:
                try:
                    sidecar.write_text(
                        json.dumps(payload, ensure_ascii=False, indent=2),
                        encoding="utf-8",
                    )
                except OSError as exc:
                    print(f"  ! failed to write {sidecar}: {exc}", file=sys.stderr)

            if i % 25 == 0 or i == len(todo):
                elapsed = time.time() - started
                rate = i / max(elapsed, 0.01)
                eta = (len(todo) - i) / max(rate, 0.01)
                print(
                    f"  [{i}/{len(todo)}] last={png.stem[:8]} -> {cat:20s} "
                    f"({elapsed:.1f}s elapsed, ETA {eta:.1f}s)"
                )

    print()
    print("Category breakdown :")
    for cat in sorted(counts):
        print(f"  {cat:25s} {counts[cat]}")
    if args.dry_run:
        print("(dry-run — no sidecars written)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
