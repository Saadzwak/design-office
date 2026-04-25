"""iter-29 furniture smoke — re-load the plugin in SketchUp and
exercise every realistic builder so we can eyeball the iso render
before running the full testfit pipeline.

  1. Connect to SketchUp MCP
  2. Re-load design_office_extensions.rb
  3. Clear the model
  4. Toggle realistic mode ON, place one of every entity kind across
     a 30×20 m demo plate
  5. Apply materials + style + shadows
  6. Capture a top-down + iso PNG so we can visually compare

Then a second pass with realistic mode OFF, captured to a sister
PNG so we can A/B the toggle.
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

from app.mcp.sketchup_client import TcpJsonBackend, try_connect_tcp  # noqa: E402

PLUGIN_PATH = (
    Path(__file__).resolve().parents[2]
    / "sketchup-plugin" / "design_office_extensions.rb"
)
OUT_DIR = ROOT / "out" / "iter29_smoke"


def _eval(backend: TcpJsonBackend, code: str) -> str:
    resp = backend.call("eval_ruby", code=code)
    content = resp.get("content", [])
    if isinstance(content, list) and content:
        return content[0].get("text", "") or ""
    return ""


def _populate_demo_scene(backend: TcpJsonBackend) -> None:
    code = r"""
    Sketchup.active_model.entities.clear!
    DesignOffice.draw_envelope(points_mm: [[0, 0], [30000, 0], [30000, 20000], [0, 20000]])
    # Workstation cluster — 6 desks horizontal in the south band.
    DesignOffice.create_workstation_cluster(
      origin_mm: [2000, 1500], orientation_deg: 0, count: 6, row_spacing_mm: 1700
    )
    # Meeting room (8p) — central north
    DesignOffice.create_meeting_room(
      corner1_mm: [12000, 12000], corner2_mm: [17000, 17000],
      capacity: 8, name: 'meet_8p'
    )
    # Boardroom (12p) — east
    DesignOffice.create_meeting_room(
      corner1_mm: [20000, 12000], corner2_mm: [28000, 17000],
      capacity: 12, name: 'boardroom_12p'
    )
    # Phone booth — centre south
    DesignOffice.create_phone_booth(position_mm: [13500, 6500])
    DesignOffice.create_phone_booth(position_mm: [15500, 6500])
    # Collab styles — 4 across north
    DesignOffice.create_collab_zone(bbox_mm: [500, 12000, 5500, 17500], style: 'cafe')
    DesignOffice.create_collab_zone(bbox_mm: [6000, 12000, 11000, 17500], style: 'lounge')
    DesignOffice.create_collab_zone(bbox_mm: [500, 7500, 5500, 11500], style: 'huddle_cluster')
    DesignOffice.create_collab_zone(bbox_mm: [6000, 7500, 11000, 11500], style: 'townhall')
    # Biophilic zone — east band
    DesignOffice.apply_biophilic_zone(bbox_mm: [21000, 7500, 28000, 11500])
    # Partition wall (acoustic) + glazed
    DesignOffice.create_partition_wall(start_mm: [12000, 6500], end_mm: [17000, 6500], kind: 'acoustic')
    DesignOffice.create_partition_wall(start_mm: [12000, 11500], end_mm: [17000, 11500], kind: 'glazed')
    # 2 humans + 2 plants + 1 hero piece
    DesignOffice.place_human(position_mm: [4000, 4000], pose: 'standing')
    DesignOffice.place_human(position_mm: [10000, 4000], pose: 'walking')
    DesignOffice.place_plant(position_mm: [16000, 4000], species: 'monstera')
    DesignOffice.place_plant(position_mm: [18000, 4000], species: 'ficus_lyrata')
    DesignOffice.place_hero(slug: 'sofa_mags', position_mm: [22000, 4000], orientation_deg: 0)
    DesignOffice.apply_materials_from_palette
    DesignOffice.apply_architectural_style
    DesignOffice.enable_afternoon_shadows
    'populated'
    """
    print(f"     {_eval(backend, code)}")


def _capture(backend: TcpJsonBackend, label: str) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{label}.png"
    p_str = str(path).replace("\\", "/")
    code = f"""
    require 'json'
    DesignOffice.capture_multi_angle_renders(
      variant_id: '{label}', out_dir: '{OUT_DIR.as_posix()}'
    ).to_json
    """
    print(f"     {_eval(backend, code)}")


def main() -> int:
    if not try_connect_tcp("127.0.0.1", 9876, timeout_s=1.5):
        print("SketchUp MCP NOT reachable.", file=sys.stderr)
        return 2
    backend = TcpJsonBackend(host="127.0.0.1", port=9876, timeout_s=120.0)

    print(f"[1/4] Re-loading {PLUGIN_PATH.name}…")
    rb = str(PLUGIN_PATH).replace("\\", "/")
    print(f"     {_eval(backend, f"load '{rb}'; 'reloaded'")}")

    print("[2/4] Realistic mode ON — populating demo scene + capturing…")
    print(f"     {_eval(backend, 'DesignOffice.set_realistic_furniture(true).to_s')}")
    _populate_demo_scene(backend)
    _capture(backend, "iter29_realistic_on")

    print("[3/4] Realistic mode OFF — re-populating demo scene + capturing…")
    print(f"     {_eval(backend, 'DesignOffice.set_realistic_furniture(false).to_s')}")
    _populate_demo_scene(backend)
    _capture(backend, "iter29_realistic_off")

    # Restore default ON so subsequent runs aren't surprised.
    _eval(backend, "DesignOffice.set_realistic_furniture(true).to_s")

    print(f"[4/4] PNGs in {OUT_DIR}")
    for p in sorted(OUT_DIR.glob("*.png")):
        print(f"      {p.name}  ({p.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
