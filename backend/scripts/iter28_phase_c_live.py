"""iter-28 Phase C live verification — regenerate macro-zoning on
both Bâtiment A and Domaine du Park, verify 0 visible leak with the
prompt + post-validator stack.

Each plan is run with the full 3-style pipeline (production-equivalent).
For each variant we :

  1. Walk the post-validator-cleaned sketchup_trace
  2. Re-classify every entity's bbox vs envelope (same metric as
     Phase A capture, mirrored exactly)
  3. Confirm zero major / extreme overflow remains
  4. Surface the envelope_violations field to count clamps / rejects

Lumen fixture path is also exercised at the end to confirm strict=False
preserves the legacy behaviour (0 violations on a clean fixture).
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass

from app.models import VariantStyle  # noqa: E402
from app.pdf.parser import PLANS_DIR, parse_pdf  # noqa: E402
from app.surfaces.testfit import compile_default_surface  # noqa: E402

BATIMENT_A_HASH = "f616c5f508eacfc7deac6f311f31ceaa"
DOMAINE_HASH = "fdd548450597279ef8e476d695ed1440"
LUMEN_FIXTURE = (
    Path(__file__).resolve().parents[1]
    / "app" / "data" / "fixtures" / "lumen_plan.pdf"
)

BRIEF_TEMPLATE = """Reconversion d'un plateau résidentiel en bureaux
tertiaires pour une équipe tech d'environ 25 personnes. Politique 3
jours bureau / 2 jours télé. Préserver le caractère architectural
existant ; créer 3-5 salles de réunion dont une boardroom 6-8p, 1-2
phone booths, une zone collab/cafétéria, des postes en façade
lumineuse. Les escaliers, ascenseurs et gaines techniques sont des
contraintes — pas constructibles."""

PROGRAMME = """## Programme fonctionnel

| Type | Quantité |
|---|---|
| Postes de travail | 25 |
| Phone booth | 1 |
| Salle de réunion 4p | 2 |
| Boardroom 6-8p | 1 |
| Zone collab / café | 1 |
| Zone biophilic | 1 |
"""


def _envelope_bbox(plan: Any) -> tuple[float, float, float, float]:
    pw_mm = (plan.real_width_m or 0) * 1000.0
    ph_mm = (plan.real_height_m or 0) * 1000.0
    return 0.0, 0.0, pw_mm, ph_mm


def _bbox_workstation(p: dict) -> tuple[float, float, float, float] | None:
    o = p.get("origin_mm")
    if not isinstance(o, (list, tuple)) or len(o) < 2:
        return None
    ox, oy = float(o[0]), float(o[1])
    count = int(p.get("count") or 1)
    spacing = float(p.get("row_spacing_mm") or 1600)
    angle = math.radians(float(p.get("orientation_deg") or 0))
    cos_a, sin_a = math.cos(angle), math.sin(angle)
    xs, ys = [], []
    for i in range(count):
        x0 = ox + i * spacing * cos_a
        y0 = oy + i * spacing * sin_a
        xs.extend([x0, x0 + 1600.0])
        ys.extend([y0, y0 + 800.0])
    return min(xs), min(ys), max(xs), max(ys)


def _bbox_corners(p: dict) -> tuple[float, float, float, float] | None:
    c1 = p.get("corner1_mm"); c2 = p.get("corner2_mm")
    if not (isinstance(c1, (list, tuple)) and isinstance(c2, (list, tuple))):
        return None
    x1, y1 = float(c1[0]), float(c1[1])
    x2, y2 = float(c2[0]), float(c2[1])
    return min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)


def _bbox_position(p: dict, half_w: float, half_d: float) -> tuple[float, float, float, float] | None:
    pos = p.get("position_mm")
    if not isinstance(pos, (list, tuple)) or len(pos) < 2:
        return None
    x, y = float(pos[0]), float(pos[1])
    return x - half_w, y - half_d, x + half_w, y + half_d


def _bbox_phone_booth(p: dict) -> tuple[float, float, float, float] | None:
    pos = p.get("position_mm")
    if not isinstance(pos, (list, tuple)) or len(pos) < 2:
        return None
    x, y = float(pos[0]), float(pos[1])
    return x, y, x + 1030.0, y + 1000.0


def _bbox_partition(p: dict) -> tuple[float, float, float, float] | None:
    s = p.get("start_mm"); e = p.get("end_mm")
    if not (isinstance(s, (list, tuple)) and isinstance(e, (list, tuple))):
        return None
    x1, y1 = float(s[0]), float(s[1])
    x2, y2 = float(e[0]), float(e[1])
    return min(x1, x2) - 100, min(y1, y2) - 100, max(x1, x2) + 100, max(y1, y2) + 100


def _bbox_bbox(p: dict) -> tuple[float, float, float, float] | None:
    bb = p.get("bbox_mm")
    if not isinstance(bb, (list, tuple)) or len(bb) < 4:
        return None
    return min(bb[0], bb[2]), min(bb[1], bb[3]), max(bb[0], bb[2]), max(bb[1], bb[3])


_HERO_HALF = {
    "chair_office": (260, 250), "chair_lounge": (390, 380),
    "sofa_mags": (1200, 500), "desk_bench_1600": (800, 400),
    "table_boardroom_4000": (2000, 700), "framery_one": (500, 500),
}


def _bbox_hero(p: dict) -> tuple[float, float, float, float] | None:
    half = _HERO_HALF.get(str(p.get("slug") or ""), (1000, 500))
    return _bbox_position(p, *half)


def _classify_overflow(bbox: tuple[float, float, float, float],
                       env: tuple[float, float, float, float]) -> tuple[float, str]:
    bx0, by0, bx1, by1 = bbox
    ex0, ey0, ex1, ey1 = env
    bbox_area = max(0, bx1 - bx0) * max(0, by1 - by0)
    if bbox_area <= 0:
        return 0.0, "clean"
    inside_x = max(0, min(bx1, ex1) - max(bx0, ex0))
    inside_y = max(0, min(by1, ey1) - max(by0, ey0))
    overflow = max(0.0, min(1.0, 1.0 - (inside_x * inside_y) / bbox_area))
    if overflow == 0.0:
        return overflow, "clean"
    if overflow <= 0.05:
        return overflow, "minor"
    if overflow <= 0.15:
        return overflow, "moderate"
    return overflow, "extreme"


_BBOX_DISPATCH = {
    "create_workstation_cluster": _bbox_workstation,
    "create_meeting_room": _bbox_corners,
    "create_phone_booth": _bbox_phone_booth,
    "create_partition_wall": _bbox_partition,
    "create_collab_zone": _bbox_bbox,
    "apply_biophilic_zone": _bbox_bbox,
    "place_human": lambda p: _bbox_position(p, 250, 250),
    "place_plant": lambda p: _bbox_position(p, 700, 700),
    "place_hero": _bbox_hero,
}


def _audit_variant(variant: Any, envelope: tuple[float, float, float, float]) -> dict:
    rows = []
    for idx, entry in enumerate(variant.sketchup_trace):
        tool = str(entry.get("tool") or "")
        params = entry.get("params") or {}
        if tool not in _BBOX_DISPATCH:
            continue
        bbox = _BBOX_DISPATCH[tool](params)
        if bbox is None:
            continue
        overflow, cls = _classify_overflow(bbox, envelope)
        if cls != "clean":
            rows.append({
                "idx": idx, "tool": tool, "overflow": round(overflow, 4),
                "class": cls, "bbox": [round(v, 1) for v in bbox],
            })
    return {
        "title": variant.title,
        "style": str(variant.style),
        "trace_len": len(variant.sketchup_trace),
        "audited_entities": sum(
            1 for e in variant.sketchup_trace
            if str(e.get("tool") or "") in _BBOX_DISPATCH
        ),
        "non_clean_entities": rows,
        "envelope_violations_emitted": len(variant.envelope_violations),
        "envelope_violations": variant.envelope_violations,
    }


def _run_one(label: str, plan: Any, plan_id: str | None) -> dict:
    print(f"\n{'='*78}\n  {label}\n{'='*78}")
    pw = (plan.real_width_m or 0) * 1000.0
    ph = (plan.real_height_m or 0) * 1000.0
    envelope = (0.0, 0.0, pw, ph)
    print(f"  envelope : {pw:.0f} × {ph:.0f} mm, {len(plan.rooms)} rooms, "
          f"{len(plan.columns)} cols, {len(plan.cores)} cores")
    print(f"  plan_source_id : {plan_id!r}")
    if plan_id:
        plan = plan.model_copy(update={"plan_source_id": plan_id})

    surface = compile_default_surface()
    response = surface.generate(
        floor_plan=plan,
        programme_markdown=PROGRAMME,
        client_name=label,
        styles=[
            VariantStyle.VILLAGEOIS,
            VariantStyle.ATELIER,
            VariantStyle.HYBRIDE_FLEX,
        ],
        brief=BRIEF_TEMPLATE,
        client_industry="Tech / Studio",
    )

    audits = []
    for v in response.variants:
        audit = _audit_variant(v, envelope)
        audits.append(audit)
        print(f"\n  variant '{audit['title']}' ({audit['style']}) :")
        print(f"    trace_len = {audit['trace_len']}, "
              f"audited_entities = {audit['audited_entities']}")
        print(f"    envelope_violations emitted = {audit['envelope_violations_emitted']}")
        if audit["envelope_violations"]:
            for ev in audit["envelope_violations"]:
                act = ev["action"]
                print(
                    f"      · {ev['kind']} idx={ev['entity_index']} "
                    f"overflow={ev['overflow_ratio']:.2%} → {act}"
                    f"  ({ev.get('label') or ''})"
                )
        post_replay_leaks = audit["non_clean_entities"]
        if post_replay_leaks:
            print(f"    ⚠ POST-REPLAY entities still non-clean :")
            for r in post_replay_leaks:
                print(
                    f"      idx={r['idx']:3d} {r['tool']:30s} "
                    f"overflow={r['overflow']:.2%} class={r['class']}"
                )
        else:
            print(f"    ✓ all post-replay entities CLEAN")

    return {"label": label, "envelope_mm": list(envelope), "variants": audits}


def main() -> int:
    bat_pdf = PLANS_DIR / f"{BATIMENT_A_HASH}.pdf"
    dom_pdf = PLANS_DIR / f"{DOMAINE_HASH}.pdf"
    if not bat_pdf.exists():
        print(f"Bâtiment A PDF missing", file=sys.stderr); return 2
    if not dom_pdf.exists():
        print(f"Domaine du Park PDF missing", file=sys.stderr); return 2

    print("[1/3] Parsing Bâtiment A …")
    bat_plan = parse_pdf(bat_pdf, use_vision=True, project_id=BATIMENT_A_HASH)
    bat_audit = _run_one("Bâtiment A (strict=True)", bat_plan, BATIMENT_A_HASH)

    print("\n[2/3] Parsing Domaine du Park (new Saad upload) …")
    dom_plan = parse_pdf(dom_pdf, use_vision=True, project_id=DOMAINE_HASH)
    dom_audit = _run_one("Domaine du Park (strict=True)", dom_plan, DOMAINE_HASH)

    print("\n[3/3] Lumen fixture regression (strict=False expected) …")
    lum_plan = parse_pdf(LUMEN_FIXTURE, use_vision=False)
    # NO plan_source_id → strict=False, legacy behaviour preserved.
    lum_audit = _run_one("Lumen fixture (strict=False)", lum_plan, None)

    out = ROOT.parent / "docs" / "iter28_phase_c_live_report.json"
    out.write_text(
        json.dumps(
            [bat_audit, dom_audit, lum_audit],
            indent=2, ensure_ascii=False, default=str,
        ),
        encoding="utf-8",
    )
    print(f"\nReport saved to {out}")

    # Verdict
    total_post_replay_leaks = sum(
        len(v["non_clean_entities"])
        for run in [bat_audit, dom_audit, lum_audit]
        for v in run["variants"]
    )
    print(f"\n{'='*78}\n  VERDICT\n{'='*78}")
    print(f"  Total post-replay non-clean entities : {total_post_replay_leaks}")
    if total_post_replay_leaks == 0:
        print(f"  ✓ Phase C achieves 0 visible leak across all 3 plans")
        return 0
    print(f"  ✗ {total_post_replay_leaks} entities still leak — investigate")
    return 1


if __name__ == "__main__":
    sys.exit(main())
