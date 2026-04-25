"""iter-27 end-to-end live combining P1 + L3 on Bâtiment A.

Re-runs the parse pipeline on the cached Bâtiment A PDF, then drives
SketchUp via MCP to:

  1. Re-load design_office_extensions.rb (P1 helper).
  2. Clear the model.
  3. Import the Bâtiment A PNG as the reference layer at z=-10 mm.
  4. Place 4 illustrative zones (workstation cluster + meeting room
     + phone booth + biophilic) at coordinates derived from the
     parsed FloorPlan rooms.
  5. Walk every Sketchup::Face in the scene and report min_z / max_z.

Pass criteria :
  - min_z ≥ -0.1 mm across every face vertex (P1 fix holds).
  - All zones land inside the building bbox (L3 fix holds).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass

from app.mcp.sketchup_client import TcpJsonBackend, try_connect_tcp  # noqa: E402
from app.pdf.parser import (  # noqa: E402
    PLANS_DIR,
    call_vision_hd,
    extract_vectors_pymupdf,
    fuse,
    render_page_to_png_bytes,
)


BATIMENT_A_HASH = "f616c5f508eacfc7deac6f311f31ceaa"
PLUGIN_PATH = (
    Path(__file__).resolve().parents[2]
    / "sketchup-plugin" / "design_office_extensions.rb"
)


def _eval(backend: TcpJsonBackend, code: str) -> str:
    resp = backend.call("eval_ruby", code=code)
    content = resp.get("content", [])
    if isinstance(content, list) and content:
        return content[0].get("text", "") or ""
    return ""


def main() -> int:
    pdf = PLANS_DIR / f"{BATIMENT_A_HASH}.pdf"
    png = PLANS_DIR / f"{BATIMENT_A_HASH}.png"
    if not pdf.exists():
        print(f"Bâtiment A PDF not found at {pdf}", file=sys.stderr)
        return 2
    if not png.exists():
        print(f"Bâtiment A PNG not found at {png}", file=sys.stderr)
        return 2

    print(f"[1/6] Parsing {pdf.name} (Vision HD on)…")
    vectors = extract_vectors_pymupdf(pdf)
    from PIL import Image
    import io
    png_bytes = render_page_to_png_bytes(pdf)
    img = Image.open(io.BytesIO(png_bytes))
    image_size = img.size
    vision = call_vision_hd(png_bytes, tag="iter27.live_su.batA")
    plan = fuse(vectors, vision, image_size=image_size, project_id=BATIMENT_A_HASH)
    pw = (plan.real_width_m or 0) * 1000.0
    ph = (plan.real_height_m or 0) * 1000.0
    print(f"      plate {pw:.0f} × {ph:.0f} mm, {len(plan.rooms)} rooms")

    if not try_connect_tcp("127.0.0.1", 9876, timeout_s=1.5):
        print("[2/6] SketchUp MCP NOT reachable. Skipping visual leg.", file=sys.stderr)
        return 2
    backend = TcpJsonBackend(host="127.0.0.1", port=9876)

    print(f"[2/6] Re-loading {PLUGIN_PATH.name}…")
    rb_path = str(PLUGIN_PATH).replace("\\", "/")
    print(f"      {_eval(backend, f"load '{rb_path}'; 'reloaded'")}")

    print("[3/6] Clearing model + importing reference plan…")
    png_str = str(png).replace("\\", "/")
    code = f"""
    Sketchup.active_model.entities.clear!
    DesignOffice.import_plan_pdf(pdf_path: '{png_str}',
      width_m: {plan.real_width_m}, height_m: {plan.real_height_m})
    'imported'
    """
    print(f"      {_eval(backend, code)}")

    print("[4/6] Placing 4 illustrative zones inside the building envelope…")
    # Pick 4 anchor points spread inside the plate rather than tied to
    # specific Vision rooms (Bâtiment A's rooms are apartment-level,
    # not office-level). The point is to validate that each zone lands
    # inside the plate AND extrudes upward.
    cx = pw / 2
    cy = ph / 2
    code = f"""
    DesignOffice.create_workstation_cluster(origin_mm: [{cx - 5000}, {cy - 8000}],
      orientation_deg: 0, count: 4, row_spacing_mm: 1700)
    DesignOffice.create_meeting_room(corner1_mm: [{cx + 2000}, {cy - 4000}],
      corner2_mm: [{cx + 7000}, {cy + 2000}], capacity: 8, name: 'iter27_live')
    DesignOffice.create_phone_booth(position_mm: [{cx - 8000}, {cy + 4000}])
    DesignOffice.apply_biophilic_zone(bbox_mm: [{cx + 4000}, {cy + 6000},
      {cx + 6000}, {cy + 8000}])
    'placed'
    """
    print(f"      {_eval(backend, code)}")

    print("[5/6] Walking model entities, asserting z bounds + plate containment…")
    inspect = f"""
    require 'json'
    mm_to_in = 0.0393700787
    inv = 1.0 / mm_to_in
    plate_w = {pw}
    plate_h = {ph}
    min_z_mm = 1.0e9
    max_z_mm = -1.0e9
    n_faces = 0
    bad_z = []
    bad_xy = []
    walker = lambda do |ents|
      ents.each do |e|
        if e.is_a?(Sketchup::Face)
          n_faces += 1
          e.vertices.each do |v|
            x_mm = v.position.x * inv
            y_mm = v.position.y * inv
            z_mm = v.position.z * inv
            min_z_mm = z_mm if z_mm < min_z_mm
            max_z_mm = z_mm if z_mm > max_z_mm
            bad_z << z_mm.round(2) if z_mm < -0.1 && bad_z.size < 8
            if (x_mm < -50 || x_mm > plate_w + 50 || y_mm < -50 || y_mm > plate_h + 50) && bad_xy.size < 8
              bad_xy << [x_mm.round(0), y_mm.round(0)]
            end
          end
        elsif e.is_a?(Sketchup::Group)
          walker.call(e.entities)
        elsif e.is_a?(Sketchup::ComponentInstance)
          walker.call(e.definition.entities)
        end
      end
    end
    walker.call(Sketchup.active_model.entities)
    JSON.generate(faces: n_faces, min_z_mm: min_z_mm.round(3),
                  max_z_mm: max_z_mm.round(3), bad_z: bad_z, bad_xy: bad_xy,
                  plate_w_mm: plate_w, plate_h_mm: plate_h)
    """
    msg = _eval(backend, inspect)
    print(f"      {msg}")
    report = json.loads(msg)

    print(f"\n[6/6] Verdict :")
    bad_z = report.get("bad_z", [])
    bad_xy = report.get("bad_xy", [])
    if bad_z:
        print(f"      FAIL — {len(bad_z)} face vertex(es) below z=-0.1 mm: {bad_z}")
        return 1
    if bad_xy:
        print(f"      FAIL — {len(bad_xy)} vertex(es) outside plate: {bad_xy}")
        return 1
    print(
        f"      PASS — {report['faces']} faces drawn, "
        f"z ∈ [{report['min_z_mm']}, {report['max_z_mm']}] mm, "
        f"all xy inside [0, {pw:.0f}] × [0, {ph:.0f}]"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
