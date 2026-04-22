"""Real-ops SketchUp smoke test.

Beyond the cube: exercises every DesignOffice high-level tool against the
live MCP server, materialising a mini office scene. Produces an iso
screenshot at `tests/fixtures/sketchup_designoffice_smoke.png` so we can
eye-ball the result.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass

from app.mcp.sketchup_client import SketchUpFacade, TcpJsonBackend, try_connect_tcp  # noqa: E402


def _eval(backend: TcpJsonBackend, code: str) -> str:
    resp = backend.call("eval_ruby", code=code)
    content = resp.get("content")
    if isinstance(content, list) and content:
        return content[0].get("text", "")
    return ""


def main() -> int:
    host, port = "127.0.0.1", 9876
    if not try_connect_tcp(host, port, timeout_s=1.5):
        print(f"SketchUp MCP unreachable on {host}:{port}. Extensions → MCP Server → Start Server.")
        return 2

    backend = TcpJsonBackend(host=host, port=port, timeout_s=30)
    facade = SketchUpFacade(backend=backend)

    print("[1/8] Clearing scene…")
    _eval(
        backend,
        "Sketchup.active_model.start_operation('do_smoke_reset', true);"
        "Sketchup.active_model.entities.clear!;"
        "Sketchup.active_model.commit_operation;'ok'",
    )

    print("[2/8] Envelope 20 × 14 m plate…")
    facade.draw_envelope([(0, 0), (20_000, 0), (20_000, 14_000), (0, 14_000)])

    print("[3/8] Column grid (3 × 2 at 7 m pitch)…")
    for cx in range(3_500, 20_000, 7_000):
        for cy in range(3_500, 14_000, 7_000):
            facade.place_column(cx, cy, 200)

    print("[4/8] Workstation cluster — 6 desks, facing south façade…")
    facade.create_workstation_cluster(
        origin_mm=(2_000, 12_000),
        orientation_deg=0,
        count=6,
        row_spacing_mm=1_700,
        product_id="steelcase_migration_se_1600",
    )

    print("[5/8] Meeting room 6×8p + partition wall…")
    facade.create_meeting_room(
        corner1_mm=(1_500, 1_500),
        corner2_mm=(7_500, 5_500),
        capacity=8,
        name="Board",
        table_product="hm_everywhere_1800",
    )
    facade.create_partition_wall(
        start_mm=(7_500, 1_500),
        end_mm=(7_500, 5_500),
        kind="glazed",
    )

    print("[6/8] Phone booths × 3 at the junction…")
    for i in range(3):
        facade.create_phone_booth(
            position_mm=(9_000 + i * 1_200, 2_000),
            product_id="framery_one_compact",
        )

    print("[7/8] Collab zone + biophilic anchor…")
    facade.create_collab_zone(
        bbox_mm=(11_000, 5_500, 18_000, 10_500),
        style="cafe",
    )
    facade.apply_biophilic_zone(bbox_mm=(14_000, 6_500, 16_000, 9_500))

    print("[8/8] Iso screenshot…")
    shot = ROOT / "tests" / "fixtures" / "sketchup_designoffice_smoke.png"
    shot.parent.mkdir(parents=True, exist_ok=True)
    path_ruby = str(shot).replace("\\", "\\\\")
    _eval(
        backend,
        f"""
model = Sketchup.active_model
view = model.active_view
view.zoom_extents
view.write_image({{:filename => '{path_ruby}', :width => 1600, :height => 1000, :antialias => true}})
'ok'
""",
    )
    time.sleep(0.5)

    if shot.exists() and shot.stat().st_size > 1000:
        print(f"       PNG saved : {shot} ({shot.stat().st_size:,} bytes)")
    else:
        print(f"       PNG MISSING at {shot}")
        return 3

    print("\nAll 6 DesignOffice ops exercised successfully :")
    for tool in (
        "draw_envelope",
        "place_column",
        "create_workstation_cluster",
        "create_meeting_room",
        "create_partition_wall",
        "create_phone_booth",
        "create_collab_zone",
        "apply_biophilic_zone",
    ):
        print(f"  - {tool}")
    print("\nOpen SketchUp to look at the result.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
