"""iter-29 debug — list every group in the scene by name + bounds.

Lets us verify that desks, chairs, plants, etc. were actually drawn
where the agent emitted them (vs. the rendered iso possibly hiding
them due to camera angle or material palette heuristics).
"""
from __future__ import annotations
import sys, json
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass
from app.mcp.sketchup_client import TcpJsonBackend  # noqa: E402

PLUGIN_PATH = Path(__file__).resolve().parents[2] / "sketchup-plugin" / "design_office_extensions.rb"


def main() -> int:
    b = TcpJsonBackend(host="127.0.0.1", port=9876)
    rb = str(PLUGIN_PATH).replace("\\", "/")
    code = f"""
    require 'json'
    load '{rb}'
    diag = []
    Sketchup.active_model.entities.clear!
    Sketchup.active_model.close_active rescue nil
    diag << "after_clear: ents=#{{Sketchup.active_model.entities.size}}"
    diag << "active_entities_eq_entities? #{{Sketchup.active_model.active_entities.equal?(Sketchup.active_model.entities)}}"
    diag << "active_path: #{{(Sketchup.active_model.active_path || []).size}}"
    diag << "realistic? #{{DesignOffice.realistic_furniture?}}"
    DesignOffice.set_realistic_furniture(true)
    diag << "set_realistic? #{{DesignOffice.realistic_furniture?}}"
    # Just one workstation cluster + one biophilic zone for diagnostics.
    r = DesignOffice.create_workstation_cluster(
      origin_mm: [2000, 1500], orientation_deg: 0, count: 6, row_spacing_mm: 1700
    )
    diag << "ws_result=#{{r.inspect}}"
    diag << "after_ws: ents=#{{Sketchup.active_model.entities.size}}"
    diag << "groups=#{{Sketchup.active_model.entities.grep(Sketchup::Group).map(&:name).join(',')}}"
    DesignOffice.apply_biophilic_zone(bbox_mm: [10000, 5000, 18000, 13000])
    diag << "after_bio: ents=#{{Sketchup.active_model.entities.size}}"
    inv = 1.0 / 0.0393700787
    out = []
    walker = lambda do |ents, depth|
      ents.each do |e|
        if e.is_a?(Sketchup::Group)
          bb = e.bounds
          out << {{
            name: (e.name.to_s.empty? ? '<unnamed>' : e.name.to_s),
            depth: depth,
            kind: 'Group',
            x0_mm: (bb.min.x * inv).round(0),
            y0_mm: (bb.min.y * inv).round(0),
            z0_mm: (bb.min.z * inv).round(0),
            x1_mm: (bb.max.x * inv).round(0),
            y1_mm: (bb.max.y * inv).round(0),
            z1_mm: (bb.max.z * inv).round(0),
            n_faces: e.entities.grep(Sketchup::Face).size,
            n_subgroups: e.entities.grep(Sketchup::Group).size,
          }}
          walker.call(e.entities, depth + 1)
        end
      end
    end
    walker.call(Sketchup.active_model.entities, 0)
    {{diag: diag, groups: out}}.to_json
    """
    resp = b.call("eval_ruby", code=code)
    text = resp.get("content", [{}])[0].get("text", "")
    payload = json.loads(text)
    print("DIAG:")
    for line in payload["diag"]:
        print(f"  {line}")
    data = payload["groups"]
    print(f"\nTotal groups: {len(data)}")
    for g in data:
        ind = '  ' * g['depth']
        print(
            f"{ind}{g['name']:30s} z={g['z0_mm']}..{g['z1_mm']} "
            f"xy=({g['x0_mm']},{g['y0_mm']})-({g['x1_mm']},{g['y1_mm']}) "
            f"faces={g['n_faces']} sub={g['n_subgroups']}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
