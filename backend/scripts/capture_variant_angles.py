"""Capture 6-angle renders for each Lumen variant against live SketchUp.

Loads the saved `tests/fixtures/generate_output_sample.json`, replays every
variant's `sketchup_trace` into a clean SketchUp model, and asks the
`DesignOffice.capture_multi_angle_renders` extension to save six PNGs per
variant (iso NE / NW / SE / SW + top-down + eye-level) at 1920x1280.

Outputs :
  backend/tests/fixtures/sketchup_variant_<style>_<angle>.png   (6 x 3)
  backend/tests/fixtures/sketchup_variant_<style>.png           (alias of iso_ne)

If SketchUp MCP is not reachable on 127.0.0.1:9876, the script prints the
blocker line and exits 0 gracefully (so a CI harness does not break).

Reuses `app.mcp.sketchup_client.TcpJsonBackend` and `SketchUpFacade` — this
script does NOT modify that module.
"""

from __future__ import annotations

import json
import shutil
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass

from app.mcp.sketchup_client import (  # noqa: E402
    SketchUpFacade,
    TcpJsonBackend,
    try_connect_tcp,
)

ANGLES = ["iso_ne", "iso_nw", "iso_se", "iso_sw", "top_down", "eye_level"]


def _eval_ruby(backend: TcpJsonBackend, code: str) -> str:
    resp = backend.call("eval_ruby", code=code)
    content = resp.get("content")
    if isinstance(content, list) and content:
        return content[0].get("text", "")
    return ""


def reload_plugin(backend: TcpJsonBackend) -> None:
    """Force-reload the deployed DesignOffice plugin so newly-added methods
    (apply_materials_from_palette, capture_multi_angle_renders...) are
    available even if SketchUp was started before the file was updated.
    """
    code = (
        "candidates = [\n"
        "  File.join(Sketchup.find_support_file('Plugins', ''), 'design_office_extensions.rb'),\n"
        "  File.join(ENV['APPDATA'].to_s, 'SketchUp', 'SketchUp 2026', 'SketchUp', 'Plugins', 'design_office_extensions.rb'),\n"
        "  File.join(ENV['APPDATA'].to_s, 'SketchUp', 'SketchUp 2024', 'SketchUp', 'Plugins', 'design_office_extensions.rb'),\n"
        "  File.join(ENV['APPDATA'].to_s, 'SketchUp', 'SketchUp 2023', 'SketchUp', 'Plugins', 'design_office_extensions.rb')\n"
        "]\n"
        "loaded = nil\n"
        "candidates.each do |p|\n"
        "  if File.exist?(p)\n"
        "    load p\n"
        "    loaded = p\n"
        "    break\n"
        "  end\n"
        "end\n"
        "loaded || 'not_found'"
    )
    reply = _eval_ruby(backend, code)
    print(f"  plugin reload -> {reply}")


def clear_scene(backend: TcpJsonBackend, label: str) -> None:
    code = (
        "model = Sketchup.active_model\n"
        "model.start_operation('design_office_reset', true)\n"
        "model.entities.clear!\n"
        f"model.options['PageOptions']['PageTitle'] = 'Lumen — {label}' rescue nil\n"
        "model.commit_operation\n"
        "'cleared'"
    )
    _eval_ruby(backend, code)


def replay_variant(backend: TcpJsonBackend, floor_plan: dict, variant: dict) -> int:
    facade = SketchUpFacade(backend=backend)
    facade.new_scene(name=f"Lumen — {variant['style']}")
    envelope_pts = [(p["x"], p["y"]) for p in floor_plan["envelope"]["points"]]
    facade.draw_envelope(envelope_pts)
    for c in floor_plan["columns"]:
        facade.place_column(c["center"]["x"], c["center"]["y"], c["radius_mm"])
    for core in floor_plan["cores"]:
        pts = [(p["x"], p["y"]) for p in core["outline"]["points"]]
        facade.place_core(core["kind"], pts)
    for s in floor_plan["stairs"]:
        pts = [(p["x"], p["y"]) for p in s["outline"]["points"]]
        facade.place_stair(pts)
    played = 0
    for entry in variant.get("sketchup_trace", []):
        tool = entry["tool"]
        params = entry.get("params", {})
        if tool in {
            "new_scene",
            "place_column",
            "place_core",
            "place_stair",
            "draw_envelope",
            "screenshot",
        }:
            continue
        facade.backend.call(tool, **params)
        played += 1
    return played


def capture_angles(backend: TcpJsonBackend, variant_id: str, out_dir: Path) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    # Ruby wants the path as a forward-slashed absolute string.
    ruby_dir = str(out_dir.resolve()).replace("\\", "/")
    code = (
        "result = DesignOffice.capture_multi_angle_renders("
        f"variant_id: '{variant_id}', out_dir: '{ruby_dir}')\n"
        "require 'json'\n"
        "result.to_json"
    )
    reply = _eval_ruby(backend, code)
    try:
        parsed = json.loads(reply)
    except json.JSONDecodeError:
        parsed = {"ok": False, "raw": reply}
    return parsed


def main() -> int:
    host, port = "127.0.0.1", 9876
    if not try_connect_tcp(host, port, timeout_s=1.5):
        print("SketchUp MCP not running — see BLOCKERS.md B3")
        return 0

    backend = TcpJsonBackend(host=host, port=port, timeout_s=120.0)

    source = ROOT / "tests" / "fixtures" / "generate_output_sample.json"
    if not source.exists():
        print(f"Missing {source} — run scripts/run_lumen_full.py first.")
        return 3

    data = json.loads(source.read_text(encoding="utf-8"))
    floor_plan = data["floor_plan"]
    variants = data["variants"]

    print("Reloading DesignOffice plugin...")
    reload_plugin(backend)

    fixtures_dir = ROOT / "tests" / "fixtures"
    captures_summary: list[dict] = []

    for v in variants:
        style = v["style"]
        print(f"\n=== Variant {style} — {v['title'][:50]}")
        t0 = time.time()
        try:
            clear_scene(backend, style)
            zones_played = replay_variant(backend, floor_plan, v)
            print(f"  replayed {zones_played} zones, capturing 6 angles...")
            capture_result = capture_angles(backend, style, fixtures_dir)
            dt = time.time() - t0
            paths = capture_result.get("paths", {}) or {}
            errors = capture_result.get("errors", {}) or {}
            for angle in ANGLES:
                p = paths.get(angle)
                if p and Path(p).exists():
                    size = Path(p).stat().st_size
                    captures_summary.append(
                        {"variant": style, "angle": angle, "size": size, "path": p}
                    )
                else:
                    err = errors.get(angle, "missing file")
                    captures_summary.append(
                        {"variant": style, "angle": angle, "size": 0, "error": err}
                    )
            # Alias iso_ne as the single-iso file consumed by VariantViewer.
            ne_path = paths.get("iso_ne")
            if ne_path and Path(ne_path).exists():
                alias_path = fixtures_dir / f"sketchup_variant_{style}.png"
                try:
                    shutil.copyfile(ne_path, alias_path)
                    print(f"  alias -> {alias_path.name}")
                except OSError as exc:
                    print(f"  alias failed : {exc}")
            # Mirror every PNG into frontend/public/sketchup/ so the Vite
            # dev server can serve them at /sketchup/...
            public_dir = ROOT.parent / "frontend" / "public" / "sketchup"
            if public_dir.exists():
                for angle, p in paths.items():
                    if p and Path(p).exists():
                        try:
                            shutil.copyfile(
                                p, public_dir / Path(p).name
                            )
                        except OSError:
                            pass
                # Also mirror the single-iso alias for back-compat.
                src_alias = fixtures_dir / f"sketchup_variant_{style}.png"
                if src_alias.exists():
                    try:
                        shutil.copyfile(
                            src_alias, public_dir / src_alias.name
                        )
                    except OSError:
                        pass
            print(f"  done in {dt:.1f}s — ok={capture_result.get('ok')}")
        except Exception as exc:  # noqa: BLE001
            dt = time.time() - t0
            print(f"  ERROR after {dt:.1f}s : {exc}")
            for angle in ANGLES:
                captures_summary.append(
                    {"variant": style, "angle": angle, "size": 0, "error": str(exc)}
                )

    # Final summary table.
    print("\n" + "=" * 72)
    print(f"{'variant':<15} {'angle':<12} {'size (KB)':>12}  path / error")
    print("-" * 72)
    total_ok = 0
    for row in captures_summary:
        size_kb = f"{row['size'] / 1024:.1f}" if row["size"] else "-"
        tail = row.get("path") or row.get("error", "?")
        if isinstance(tail, str) and len(tail) > 40:
            tail = "..." + tail[-37:]
        print(f"{row['variant']:<15} {row['angle']:<12} {size_kb:>12}  {tail}")
        if row["size"] > 0:
            total_ok += 1
    print("-" * 72)
    print(f"Captured {total_ok} / {len(captures_summary)} PNGs")

    return 0 if total_ok >= 1 else 4


if __name__ == "__main__":
    sys.exit(main())
