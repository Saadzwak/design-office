"""Render the Lumen Justify pitch deck from the saved fixture.

Loads `tests/fixtures/justify_output_sample.json` + the approved variant
from `tests/fixtures/generate_output_sample.json`, then calls
`render_pitch_deck` to produce a real 6-slide PowerPoint. No Opus calls —
cheap to re-run whenever the renderer changes.
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass

from app.models import VariantOutput  # noqa: E402
from app.surfaces.justify_pptx import render_pitch_deck  # noqa: E402


def main() -> int:
    fixtures = ROOT / "tests" / "fixtures"
    just = fixtures / "justify_output_sample.json"
    gen = fixtures / "generate_output_sample.json"
    if not just.exists() or not gen.exists():
        print("Missing fixtures. Run run_lumen_full.py + run_lumen_justify.py first.")
        return 2

    just_data = json.loads(just.read_text(encoding="utf-8"))
    gen_data = json.loads(gen.read_text(encoding="utf-8"))

    # Atelier was the approved_with_notes variant in the saved fixture.
    variant_payload = next(
        v for v in gen_data["variants"] if v["style"] == "atelier"
    )
    variant = VariantOutput.model_validate(variant_payload)

    build = render_pitch_deck(
        client_name="Lumen",
        variant=variant,
        argumentaire_markdown=just_data["argumentaire"],
        project_reference="LUMEN-CAT-B-DEMO",
    )
    print(f"pptx_id   : {build.pptx_id}")
    print(f"slides    : {build.slide_count}")
    print(f"bytes     : {build.bytes:,}")
    print(f"path      : {build.path}")

    dst = fixtures / "lumen_justify_pitch_deck.pptx"
    shutil.copy2(build.path, dst)
    print(f"copied to : {dst}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
