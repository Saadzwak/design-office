"""iter-28 Phase A capture — investigation pure des entités hors plate.

Reproduit la chaîne /api/testfit/generate sur le PDF cached Bâtiment A,
mais avec UN SEUL style (villageois) pour minimiser le coût en tokens
sans perdre de pouvoir diagnostique : les 4 classes d'entités émises
par l'agent (zones area, point-placed, walls 1D, decoratives) sont
présentes dans n'importe quel style.

Pour chaque entité dans le sketchup_trace :
  - Recalcule sa bbox mm (mirroring le Ruby helper qu'elle invoque)
  - Compare contre l'envelope ``[0, plate_w_mm] × [0, plate_h_mm]``
  - Classe l'overflow : clean / minor (≤5 %) / major (5-50 %) / extreme (>50 %)
  - Identifie les root cause hypotheses : agent prompt, decorative
    bypass, parser, ou autre

Sort un JSON structuré + une table markdown destinée à
docs/ITER28_INVESTIGATION.md.
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

# Brief Bâtiment A — reconversion résidentielle Haussmannienne en bureaux
# tertiaires. Inspiré du contexte Saad use case réel ; suffisant pour
# que l'agent émette des zones réalistes.
BRIEF = """Reconversion d'un plateau Haussmannien (Bâtiment A) en bureaux
tertiaires pour une équipe tech de 30 personnes. Politique 3 jours
bureau / 2 jours télé. Le bâtiment a un escalier central, un ascenseur,
des gaines techniques, et plusieurs lots résidentiels existants.
Demande : préserver le caractère Haussmannien (moulures, parquet),
créer 4-6 salles de réunion dont une boardroom 8p, 2 phone booths,
une zone collab/cafétéria, des postes en façade lumineuse. Les
escaliers, ascenseurs et gaines sont des contraintes — pas
constructibles."""

CLIENT_NAME = "Bâtiment A — Reconversion"
CLIENT_INDUSTRY = "Tech / Studio"

# Programme markdown minimaliste — l'agent variant prend ça comme input
# mais ne va pas s'en soucier outre mesure pour Phase A (on diagnostique
# le placement, pas la justesse du programme).
PROGRAMME = """## Programme fonctionnel

| Type | Quantité |
|---|---|
| Postes de travail | 30 |
| Phone booth | 2 |
| Salle de réunion 4p | 2 |
| Salle de réunion 6p | 1 |
| Boardroom 8p | 1 |
| Zone collab / café | 1 |
| Zone biophilic | 1 |
"""


# ---------------------------------------------------------------------------
# Bbox computers — mirror chaque helper Ruby de design_office_extensions.rb
# ---------------------------------------------------------------------------


def _bbox_workstation_cluster(p: dict) -> tuple[float, float, float, float] | None:
    """Match Ruby create_workstation_cluster : N desks (W=1600, D=800)
    espacés de row_spacing_mm le long de orientation_deg, à partir de
    origin_mm. Le bbox englobe tous les desks."""

    origin = p.get("origin_mm")
    if not isinstance(origin, (list, tuple)) or len(origin) < 2:
        return None
    try:
        ox, oy = float(origin[0]), float(origin[1])
    except (TypeError, ValueError):
        return None
    count = int(p.get("count") or 1)
    spacing = float(p.get("row_spacing_mm") or 1600)
    angle = math.radians(float(p.get("orientation_deg") or 0))
    cos_a, sin_a = math.cos(angle), math.sin(angle)
    desk_w, desk_d = 1600.0, 800.0
    xs: list[float] = []
    ys: list[float] = []
    for i in range(count):
        dx = i * spacing * cos_a
        dy = i * spacing * sin_a
        x0 = ox + dx
        y0 = oy + dy
        xs.extend([x0, x0 + desk_w])
        ys.extend([y0, y0 + desk_d])
    if not xs:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def _bbox_meeting_room(p: dict) -> tuple[float, float, float, float] | None:
    c1 = p.get("corner1_mm"); c2 = p.get("corner2_mm")
    if not (isinstance(c1, (list, tuple)) and isinstance(c2, (list, tuple))):
        return None
    try:
        x1, y1 = float(c1[0]), float(c1[1])
        x2, y2 = float(c2[0]), float(c2[1])
    except (TypeError, ValueError):
        return None
    return min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)


def _bbox_phone_booth(p: dict) -> tuple[float, float, float, float] | None:
    pos = p.get("position_mm")
    if not isinstance(pos, (list, tuple)) or len(pos) < 2:
        return None
    try:
        x, y = float(pos[0]), float(pos[1])
    except (TypeError, ValueError):
        return None
    # Framery One Compact footprint 1030×1000.
    return x, y, x + 1030.0, y + 1000.0


def _bbox_partition_wall(p: dict) -> tuple[float, float, float, float] | None:
    s = p.get("start_mm"); e = p.get("end_mm")
    if not (isinstance(s, (list, tuple)) and isinstance(e, (list, tuple))):
        return None
    try:
        x1, y1 = float(s[0]), float(s[1])
        x2, y2 = float(e[0]), float(e[1])
    except (TypeError, ValueError):
        return None
    # Add 100mm half-thickness margin around the segment.
    t = 100.0
    return min(x1, x2) - t, min(y1, y2) - t, max(x1, x2) + t, max(y1, y2) + t


def _bbox_from_bbox_mm(p: dict) -> tuple[float, float, float, float] | None:
    bb = p.get("bbox_mm")
    if not isinstance(bb, (list, tuple)) or len(bb) < 4:
        return None
    try:
        return tuple(float(v) for v in bb[:4])  # type: ignore[return-value]
    except (TypeError, ValueError):
        return None


def _bbox_human(p: dict) -> tuple[float, float, float, float] | None:
    pos = p.get("position_mm")
    if not isinstance(pos, (list, tuple)) or len(pos) < 2:
        return None
    try:
        x, y = float(pos[0]), float(pos[1])
    except (TypeError, ValueError):
        return None
    return x - 250, y - 250, x + 250, y + 250


def _bbox_plant(p: dict) -> tuple[float, float, float, float] | None:
    pos = p.get("position_mm")
    if not isinstance(pos, (list, tuple)) or len(pos) < 2:
        return None
    try:
        x, y = float(pos[0]), float(pos[1])
    except (TypeError, ValueError):
        return None
    # Plants are ~700 mm canopy radius worst case.
    return x - 700, y - 700, x + 700, y + 700


_HERO_FOOTPRINTS_MM = {
    # slug → (half_w_mm, half_d_mm). Mirrors _build_* in the Ruby plugin.
    "chair_office": (260, 250),
    "chair_lounge": (390, 380),
    "sofa_mags": (1200, 500),
    "desk_bench_1600": (800, 400),
    "table_boardroom_4000": (2000, 700),
    "framery_one": (500, 500),
}


def _bbox_hero(p: dict) -> tuple[float, float, float, float] | None:
    pos = p.get("position_mm")
    if not isinstance(pos, (list, tuple)) or len(pos) < 2:
        return None
    try:
        x, y = float(pos[0]), float(pos[1])
    except (TypeError, ValueError):
        return None
    slug = str(p.get("slug") or "")
    half = _HERO_FOOTPRINTS_MM.get(slug, (1000, 500))
    return x - half[0], y - half[1], x + half[0], y + half[1]


def _bbox_column(p: dict) -> tuple[float, float, float, float] | None:
    """place_column emits (x_mm, y_mm, radius_mm) — those come from
    plan.columns (parser-side, NOT agent-side). Useful for diagnosing
    whether the parser also leaks."""
    try:
        x = float(p.get("x_mm"))
        y = float(p.get("y_mm"))
        r = float(p.get("radius_mm") or 0)
    except (TypeError, ValueError):
        return None
    return x - r, y - r, x + r, y + r


def _bbox_core_or_stair(p: dict) -> tuple[float, float, float, float] | None:
    pts = p.get("points_mm")
    if not isinstance(pts, list) or not pts:
        return None
    xs: list[float] = []
    ys: list[float] = []
    for pt in pts:
        if isinstance(pt, (list, tuple)) and len(pt) >= 2:
            try:
                xs.append(float(pt[0])); ys.append(float(pt[1]))
            except (TypeError, ValueError):
                continue
    if not xs:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def _bbox_envelope(p: dict) -> tuple[float, float, float, float] | None:
    return _bbox_core_or_stair(p)  # same shape : list of points


# tool name → (bbox_computer, source_layer)
_TOOL_DISPATCH: dict[str, tuple[Any, str]] = {
    "draw_envelope": (_bbox_envelope, "parser"),
    "place_column": (_bbox_column, "parser"),
    "place_core": (_bbox_core_or_stair, "parser"),
    "place_stair": (_bbox_core_or_stair, "parser"),
    "create_workstation_cluster": (_bbox_workstation_cluster, "agent"),
    "create_meeting_room": (_bbox_meeting_room, "agent"),
    "create_phone_booth": (_bbox_phone_booth, "agent"),
    "create_partition_wall": (_bbox_partition_wall, "agent"),
    "create_collab_zone": (_bbox_from_bbox_mm, "agent"),
    "apply_biophilic_zone": (_bbox_from_bbox_mm, "agent"),
    "place_human": (_bbox_human, "agent_decorative"),
    "place_plant": (_bbox_plant, "agent_decorative"),
    "place_hero": (_bbox_hero, "agent_decorative"),
}


def _overflow_ratio(
    bbox: tuple[float, float, float, float],
    envelope: tuple[float, float, float, float],
) -> float:
    """Return the fraction of the bbox area that lies OUTSIDE the
    envelope. Identical metric to parser._bbox_overflow_ratio so we
    can compare iter-27 fix coverage directly."""

    bx0, by0, bx1, by1 = bbox
    ex0, ey0, ex1, ey1 = envelope
    bbox_area = max(0.0, bx1 - bx0) * max(0.0, by1 - by0)
    if bbox_area <= 0:
        return 0.0
    inside_x_min = max(bx0, ex0)
    inside_y_min = max(by0, ey0)
    inside_x_max = min(bx1, ex1)
    inside_y_max = min(by1, ey1)
    inside_area = (
        max(0.0, inside_x_max - inside_x_min)
        * max(0.0, inside_y_max - inside_y_min)
    )
    return max(0.0, min(1.0, 1.0 - inside_area / bbox_area))


def _classify(overflow: float) -> str:
    if overflow == 0.0:
        return "clean"
    if overflow <= 0.05:
        return "minor"  # clamp candidate
    if overflow <= 0.50:
        return "major"  # reject candidate
    return "extreme"  # placement bug


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------


def main() -> int:
    pdf = PLANS_DIR / f"{BATIMENT_A_HASH}.pdf"
    if not pdf.exists():
        print(f"Bâtiment A PDF missing at {pdf}", file=sys.stderr)
        return 2

    print(f"[1/4] Parsing {pdf.name} (Vision HD on)…")
    plan = parse_pdf(pdf, use_vision=True, project_id=BATIMENT_A_HASH)
    pw_mm = (plan.real_width_m or 0) * 1000.0
    ph_mm = (plan.real_height_m or 0) * 1000.0
    envelope = (0.0, 0.0, pw_mm, ph_mm)
    print(
        f"      envelope {pw_mm:.0f} × {ph_mm:.0f} mm, "
        f"{len(plan.rooms)} rooms, {len(plan.columns)} columns, "
        f"{len(plan.cores)} cores, {len(plan.stairs)} stairs"
    )

    styles_arg = sys.argv[1] if len(sys.argv) > 1 else "all"
    if styles_arg == "single":
        styles = [VariantStyle.VILLAGEOIS]
    else:
        styles = [
            VariantStyle.VILLAGEOIS,
            VariantStyle.ATELIER,
            VariantStyle.HYBRIDE_FLEX,
        ]

    print(f"[2/4] Generating {len(styles)} variant(s) on Bâtiment A …")
    surface = compile_default_surface()
    response = surface.generate(
        floor_plan=plan.model_copy(update={"plan_source_id": BATIMENT_A_HASH}),
        programme_markdown=PROGRAMME,
        client_name=CLIENT_NAME,
        styles=styles,
        brief=BRIEF,
        client_industry=CLIENT_INDUSTRY,
    )
    if not response.variants:
        print("No variants returned — surface call failed.", file=sys.stderr)
        return 3

    print("[3/4] Walking traces of every variant…")
    per_variant_rows: list[dict[str, Any]] = []
    overall_by_class: dict[str, int] = {}
    overall_by_class_source: dict[str, dict[str, int]] = {}
    overall_leaks: list[dict[str, Any]] = []

    for v_idx, variant in enumerate(response.variants):
        trace = variant.sketchup_trace
        print(
            f"  · variant[{v_idx}] = {variant.style!s:25s} "
            f"trace_len={len(trace):3d}  title={variant.title!r}"
        )
        rows: list[dict[str, Any]] = []
        for idx, entry in enumerate(trace):
            tool = str(entry.get("tool") or "")
            params = entry.get("params") or {}
            if tool not in _TOOL_DISPATCH:
                continue
            computer, source = _TOOL_DISPATCH[tool]
            bbox = computer(params)
            row: dict[str, Any] = {
                "variant_idx": v_idx,
                "variant_style": str(variant.style),
                "idx": idx, "tool": tool, "source": source,
                "params_summary": _summarise_params(tool, params),
            }
            if bbox is None:
                row.update({
                    "bbox_mm": None, "overflow_ratio": None,
                    "classification": "no_bbox",
                })
                rows.append(row)
                continue
            overflow = _overflow_ratio(bbox, envelope)
            cls = _classify(overflow)
            row.update({
                "bbox_mm": [round(v, 1) for v in bbox],
                "overflow_ratio": round(overflow, 4),
                "classification": cls,
            })
            rows.append(row)
            overall_by_class[cls] = overall_by_class.get(cls, 0) + 1
            overall_by_class_source.setdefault(source, {}).setdefault(cls, 0)
            overall_by_class_source[source][cls] += 1
            if cls in ("major", "extreme"):
                overall_leaks.append(row)
        per_variant_rows.append({
            "variant_idx": v_idx,
            "variant_style": str(variant.style),
            "title": variant.title,
            "trace_len": len(trace),
            "rows": rows,
        })

    print(f"\n[4/4] Aggregate over {len(response.variants)} variants:")
    print(json.dumps(overall_by_class, indent=2))
    print("\n      By source layer × class:")
    print(json.dumps(overall_by_class_source, indent=2))

    print(f"\n      LEAKING entities (major/extreme): {len(overall_leaks)}")
    for r in overall_leaks:
        print(
            f"        v={r['variant_idx']} idx={r['idx']:3d} "
            f"{r['tool']:30s} source={r['source']:18s} "
            f"overflow={r['overflow_ratio']:.2%} "
            f"bbox={r['bbox_mm']} | {r['params_summary']}"
        )

    report = {
        "envelope_mm": list(envelope),
        "plate_w_m": plan.real_width_m,
        "plate_h_m": plan.real_height_m,
        "plan_rooms_count": len(plan.rooms),
        "plan_columns_count": len(plan.columns),
        "plan_cores_count": len(plan.cores),
        "variants": per_variant_rows,
        "by_class": overall_by_class,
        "by_class_source": overall_by_class_source,
        "leaks": overall_leaks,
    }
    out = ROOT.parent / "docs" / "iter28_phase_a_report.json"
    out.write_text(
        json.dumps(report, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"\n      Report written to {out}")
    return 0 if not overall_leaks else 1


def _summarise_params(tool: str, params: dict) -> str:
    if tool == "create_workstation_cluster":
        return (
            f"origin={params.get('origin_mm')} count={params.get('count')} "
            f"spacing={params.get('row_spacing_mm')} ang={params.get('orientation_deg')}"
        )
    if tool == "create_meeting_room":
        return (
            f"c1={params.get('corner1_mm')} c2={params.get('corner2_mm')} "
            f"name={params.get('name')!r}"
        )
    if tool == "create_phone_booth":
        return f"pos={params.get('position_mm')}"
    if tool == "create_partition_wall":
        return f"{params.get('start_mm')} -> {params.get('end_mm')}"
    if tool in ("create_collab_zone", "apply_biophilic_zone"):
        return f"bbox={params.get('bbox_mm')}"
    if tool == "place_human":
        return f"pos={params.get('position_mm')} pose={params.get('pose')!r}"
    if tool == "place_plant":
        return f"pos={params.get('position_mm')} sp={params.get('species')!r}"
    if tool == "place_hero":
        return f"pos={params.get('position_mm')} slug={params.get('slug')!r}"
    if tool == "place_column":
        return f"x={params.get('x_mm')} y={params.get('y_mm')} r={params.get('radius_mm')}"
    if tool in ("place_core", "place_stair"):
        pts = params.get("points_mm") or []
        return f"{len(pts)} pts"
    if tool == "draw_envelope":
        return f"{len(params.get('points_mm') or [])} pts"
    return str(params)[:80]


if __name__ == "__main__":
    sys.exit(main())
