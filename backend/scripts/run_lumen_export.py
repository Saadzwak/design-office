"""Render the Lumen approved variant to a real A1 DXF.

Loads the retained (approved_with_notes) variant from
`tests/fixtures/generate_output_sample.json` and runs the Export surface
against it through the `ezdxf` headless backend. Saves a copy of the
produced DXF + manifest as a durable demo artefact.
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

from app.models import FloorPlan, VariantOutput  # noqa: E402
from app.surfaces.export import ExportRequest, ExportSurface  # noqa: E402


def main() -> int:
    fixtures = ROOT / "tests" / "fixtures"
    source = fixtures / "generate_output_sample.json"
    if not source.exists():
        print(f"Missing {source} — run scripts/run_lumen_full.py first.")
        return 2

    data = json.loads(source.read_text(encoding="utf-8"))
    floor_plan = FloorPlan.model_validate(data["floor_plan"])

    approved = next(
        (
            (v, verdict)
            for v, verdict in zip(data["variants"], data["verdicts"])
            if verdict["verdict"] in ("approved", "approved_with_notes")
        ),
        None,
    )
    if approved is None:
        print("No approved variant; falling back to first one.")
        approved = (data["variants"][0], data["verdicts"][0])

    variant_payload, verdict_payload = approved
    variant = VariantOutput.model_validate(variant_payload)
    print(f"Selected variant : {variant.style.value} — {variant.title[:60]}")
    print(f"Reviewer verdict : {verdict_payload['verdict']}")

    surface = ExportSurface()
    req = ExportRequest(
        client_name="Lumen",
        floor_plan=floor_plan,
        variant=variant,
        scale=100,
        project_reference="LUMEN-CAT-B-DEMO",
    )
    resp = surface.generate(req)
    print(f"Export id : {resp.export_id}")
    print(f"DXF bytes : {resp.dxf_bytes:,}")
    print(f"Sheet / scale : {resp.sheet} / {resp.scale}")
    print(f"Layers : {', '.join(resp.layers)}")
    print(f"AutoCad trace length : {resp.trace_length}")

    # Copy the DXF into tests/fixtures so it persists alongside the others.
    src_dxf = ROOT / "app" / "out" / "export" / f"{resp.export_id}.dxf"
    dst_dxf = fixtures / f"lumen_export_{variant.style.value}.dxf"
    if src_dxf.exists():
        shutil.copy2(src_dxf, dst_dxf)
        print(f"Copied to : {dst_dxf}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
