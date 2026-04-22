"""Full Lumen round-trip against the live SketchUp MCP backend.

Loads the saved `generate_output_sample.json` (produced by
`run_lumen_full.py`), then for each variant :

1. Opens a fresh SketchUp scene via `SU_MCP` eval_ruby.
2. Replays the variant's `sketchup_trace` through the real facade — this
   draws the plan + all variant zones directly in SketchUp.
3. Takes an iso-axis screenshot via `model.active_view.write_image` and
   saves it to `tests/fixtures/sketchup_variant_<style>.png`.

Saves the aggregated result to `tests/fixtures/generate_live_sketchup.json`.

If a variant crashes mid-replay, the failure is recorded and the run
continues with the next variant (per Saad's directive).
"""

from __future__ import annotations

import json
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


def _eval_ruby(backend: TcpJsonBackend, code: str) -> str:
    """Send raw Ruby code and return the stringified result."""

    resp = backend.call("eval_ruby", code=code)
    content = resp.get("content")
    if isinstance(content, list) and content:
        return content[0].get("text", "")
    return ""


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


def take_iso_screenshot(backend: TcpJsonBackend, out_path: Path) -> bool:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    target = str(out_path).replace("\\", "\\\\")
    code = (
        "model = Sketchup.active_model\n"
        "view = model.active_view\n"
        "bounds = model.bounds\n"
        "view.zoom_extents\n"
        "result = view.write_image({:filename => '" + target + "', "
        ":width => 1600, :height => 1000, :antialias => true}) rescue false\n"
        "result.to_s"
    )
    reply = _eval_ruby(backend, code)
    return out_path.exists() and out_path.stat().st_size > 0


def replay_variant(
    backend: TcpJsonBackend,
    floor_plan: dict,
    variant: dict,
) -> dict:
    facade = SketchUpFacade(backend=backend)
    facade.new_scene(name=f"Lumen — {variant['style']}")
    # Floor plan.
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
    # Variant zones.
    for entry in variant.get("sketchup_trace", []):
        tool = entry["tool"]
        params = entry.get("params", {})
        if tool in {"new_scene", "place_column", "place_core", "place_stair", "draw_envelope", "screenshot"}:
            continue
        facade.backend.call(tool, **params)
    return {"zones_played": len(variant.get("sketchup_trace", []))}


def main() -> int:
    host, port = "127.0.0.1", 9876
    if not try_connect_tcp(host, port, timeout_s=1.5):
        print("SketchUp MCP server unreachable on 127.0.0.1:9876 — is Start Server clicked?")
        return 2

    backend = TcpJsonBackend(host=host, port=port, timeout_s=60.0)

    source = ROOT / "tests" / "fixtures" / "generate_output_sample.json"
    if not source.exists():
        print(f"Missing {source} — run scripts/run_lumen_full.py first.")
        return 3
    data = json.loads(source.read_text(encoding="utf-8"))
    floor_plan = data["floor_plan"]
    variants = data["variants"]

    results: list[dict] = []
    screenshots_dir = ROOT / "tests" / "fixtures"

    for v in variants:
        style = v["style"]
        print(f"\n=== Variant {style} — {v['title'][:40]}")
        t0 = time.time()
        try:
            clear_scene(backend, style)
            info = replay_variant(backend, floor_plan, v)
            screenshot_path = screenshots_dir / f"sketchup_variant_{style}.png"
            shot_ok = take_iso_screenshot(backend, screenshot_path)
            dt = time.time() - t0
            results.append({
                "style": style,
                "status": "ok",
                "zones_played": info["zones_played"],
                "screenshot": str(screenshot_path) if shot_ok else None,
                "duration_s": round(dt, 1),
            })
            print(f"  OK — zones {info['zones_played']}, screenshot={shot_ok}, {dt:.1f}s")
        except Exception as exc:  # noqa: BLE001
            dt = time.time() - t0
            results.append({
                "style": style,
                "status": "error",
                "error": str(exc),
                "duration_s": round(dt, 1),
            })
            print(f"  ERROR after {dt:.1f}s : {exc}")

    out = ROOT / "tests" / "fixtures" / "generate_live_sketchup.json"
    out.write_text(
        json.dumps({"variants": results, "source": str(source)}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"\nSaved : {out}")
    ok_count = sum(1 for r in results if r["status"] == "ok")
    print(f"Variants OK : {ok_count}/{len(results)}")
    return 0 if ok_count > 0 else 4


if __name__ == "__main__":
    sys.exit(main())
