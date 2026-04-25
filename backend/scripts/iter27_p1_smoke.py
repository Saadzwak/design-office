"""iter-27 P1 live smoke — verify _safe_pushpull_up extrudes upward.

Workflow :

  1. Connect to running SketchUp MCP (port 9876).
  2. `load` the modified design_office_extensions.rb so the new helper
     is in effect without restarting SketchUp.
  3. Clear the model and call every flavour of extruded geometry :
     - place_column         (cylinder, low-level)
     - place_core           (rectangle face, low-level)
     - place_stair          (rectangle face, low-level)
     - create_workstation_cluster  (rectangle face, high-level)
     - create_meeting_room  (rectangle face, high-level)
     - create_phone_booth   (rectangle face, high-level)
     - create_partition_wall (4-pt face)
     - apply_biophilic_zone (circle face)
     - place_human          (hero builder = chained primitives)
     - place_hero / desk    (hero builder = nested rectangles)
  4. Walk every Sketchup::Face in the model, report min_z / max_z over
     all face vertices. With the helper in place, min_z must be ≥ 0
     (with a tiny tolerance — SketchUp uses inches internally, 1 in =
     25.4 mm, so an EPSILON of 0.1 mm = 0.004 in is safe).

Exit code :
  0 — every face has min_z ≥ -EPSILON (helper works)
  1 — at least one face dips below z = 0 (helper failed)
  2 — couldn't reach SketchUp (Saad blocker, not a code bug)
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
    Path(__file__).resolve().parents[2] / "sketchup-plugin" / "design_office_extensions.rb"
)


def _eval(backend: TcpJsonBackend, code: str) -> str:
    resp = backend.call("eval_ruby", code=code)
    content = resp.get("content", [])
    if isinstance(content, list) and content:
        return content[0].get("text", "") or ""
    return ""


def main() -> int:
    host, port = "127.0.0.1", 9876
    print(f"[1/4] Probing {host}:{port}…")
    if not try_connect_tcp(host, port, timeout_s=1.5):
        print("       NOT REACHABLE — start SketchUp + MCP Server first.")
        return 2
    print("       reachable.\n")

    backend = TcpJsonBackend(host=host, port=port)

    print(f"[2/4] Re-loading {PLUGIN_PATH.name} into SketchUp…")
    rb_path = str(PLUGIN_PATH).replace("\\", "/")
    msg = _eval(backend, f"load '{rb_path}'; 'reloaded'")
    print(f"       {msg}\n")

    print("[3/4] Clearing model + drawing one of each extruded primitive…")
    code = """
    Sketchup.active_model.entities.clear!
    DesignOffice.place_column(x_mm: 0, y_mm: 0, radius_mm: 250)
    DesignOffice.place_core(kind: 'wc',
      points_mm: [[2000, 0], [4000, 0], [4000, 2000], [2000, 2000]])
    DesignOffice.place_stair(points_mm: [[5000, 0], [7000, 0], [7000, 1500], [5000, 1500]])
    DesignOffice.create_workstation_cluster(origin_mm: [9000, 0],
      orientation_deg: 0, count: 3, row_spacing_mm: 1700)
    DesignOffice.create_meeting_room(corner1_mm: [0, 4000], corner2_mm: [4000, 8000],
      capacity: 8, name: 'smoke_meeting')
    DesignOffice.create_phone_booth(position_mm: [5000, 4000])
    DesignOffice.create_partition_wall(start_mm: [7000, 4000], end_mm: [9000, 4000],
      kind: 'glazed')
    DesignOffice.apply_biophilic_zone(bbox_mm: [10000, 4000, 12000, 6000])
    DesignOffice.place_human(position_mm: [13000, 0], pose: 'standing')
    DesignOffice.place_hero(slug: 'desk_bench_1600', position_mm: [13000, 3000])
    'all_drawn'
    """
    msg = _eval(backend, code)
    print(f"       {msg}\n")

    print("[4/4] Walking entities, asserting min_z ≥ 0…")
    inspect = """
    require 'json'
    mm_to_in = 0.0393700787
    inv = 1.0 / mm_to_in
    min_z_mm = 1.0e9
    max_z_mm = -1.0e9
    n_faces = 0
    bad = []
    walker = lambda do |ents|
      ents.each do |e|
        if e.is_a?(Sketchup::Face)
          n_faces += 1
          e.vertices.each do |v|
            z = v.position.z * inv
            min_z_mm = z if z < min_z_mm
            max_z_mm = z if z > max_z_mm
            bad << z.round(3) if z < -0.1 && bad.size < 8
          end
        elsif e.is_a?(Sketchup::Group)
          walker.call(e.entities)
        elsif e.is_a?(Sketchup::ComponentInstance)
          walker.call(e.definition.entities)
        end
      end
    end
    walker.call(Sketchup.active_model.entities)
    JSON.generate({faces: n_faces, min_z_mm: min_z_mm.round(3),
                   max_z_mm: max_z_mm.round(3), bad: bad})
    """
    msg = _eval(backend, inspect)
    print(f"       {msg}")

    import json as _json

    try:
        report = _json.loads(msg)
    except _json.JSONDecodeError:
        print("       could not parse Ruby JSON output")
        return 3

    bad = report.get("bad", [])
    if bad:
        print(f"\n       FAIL — {len(bad)} face vertex(es) below z = -0.1 mm :")
        for z in bad:
            print(f"         z = {z} mm")
        return 1

    print(
        f"\n       PASS — {report['faces']} faces, "
        f"min_z = {report['min_z_mm']} mm, max_z = {report['max_z_mm']} mm"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
