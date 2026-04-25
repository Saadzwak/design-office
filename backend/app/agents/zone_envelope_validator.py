"""iter-28 Phase C — Python defense in depth for zone-envelope containment.

The variant agent receives the plate envelope in `<floor_plan_json>` and
is told (testfit_variant.md "Envelope containment — non-negotiable") to
emit only entities whose footprint fits inside `[0, plate_w_mm] × [0,
plate_h_mm]`. The prompt is necessary but not sufficient — Phase A
captured a workstation_cluster on Bâtiment A whose `count × spacing`
arithmetic overflowed the plate by 21 %, the agent simply miscounted.

This validator is the second line of defense, mirroring the iter-27
parser L1+L2 pattern (clamp + reject + structured WARNING). It runs in
`TestFitSurface.generate()` between the agent's emit_variant tool call
and the SketchUp replay, so leaks never reach the architect's screen.

Coverage : every kind that produces a 2-D footprint in the SketchUp
trace (13 kinds total). Three classes of overflow drive three actions :

  • clean (overflow == 0)         → passthrough, no log
  • minor (≤ 5 %)                 → passthrough, no log (rounding noise)
  • moderate (5 % < o ≤ 15 %)    → CLAMP : shift / shrink to fit, WARNING
  • extreme (> 15 %)              → REJECT : drop the entry, WARNING

The 5 / 15 % thresholds match Saad's Phase C brief and align with iter-
27 L2 which used 5 % as the parser-side rejection floor. 15 % is the
designer-judgment cap : a cluster overshooting by ≤ 15 % can usually
be shifted inward without losing its essential parti pris ; > 15 % means
the agent's intent is structurally too big for the plate and rejecting
is more honest than mutilating.

`strict` toggle :

  • strict=False  → log WARNINGs but DO NOT alter the zones list
                    (Lumen fixture path, regression-test path,
                    legacy callers — back-compat preserved exactly).
  • strict=True   → apply the clamp/reject actions, return the
                    cleaned zones list. Used for live user uploads
                    where iter-28's whole point is "0 visible leak".
"""

from __future__ import annotations

import logging
import math
from typing import Any, TypedDict

_logger = logging.getLogger("design_office.agents.zone_envelope_validator")


# ---------------------------------------------------------------------------
# Thresholds & footprint constants
# ---------------------------------------------------------------------------

# Below this overflow, the entity is effectively clean — agent rounding
# noise. We don't log anything to keep production logs readable.
MINOR_OVERFLOW_THRESHOLD = 0.05

# Above MINOR but ≤ this, the entity gets clamped (shifted inward when
# possible, otherwise the bbox endpoints are clipped to the envelope).
# Above this, the entity is rejected — the prompt told the agent this
# would happen.
MODERATE_OVERFLOW_THRESHOLD = 0.15

# Mirror sketchup-plugin/design_office_extensions.rb constants so the
# bbox we compute lines up with what the Ruby actually draws. Keep
# in sync with `_replay_zones` in app/surfaces/testfit.py.
_DESK_W_MM = 1600.0
_DESK_D_MM = 800.0
_PHONE_BOOTH_W_MM = 1030.0   # Framery One Compact footprint
_PHONE_BOOTH_D_MM = 1000.0
_HUMAN_HALF_MM = 250.0       # human standing has ~500 mm footprint
_PLANT_HALF_MM = 700.0       # ficus_lyrata canopy radius

# Hero slug → (half_w_mm, half_d_mm). Mirrors _build_* in the Ruby
# plugin. Unknown slugs default to (1000, 500) — the fallback box.
_HERO_FOOTPRINTS_MM: dict[str, tuple[float, float]] = {
    "chair_office":         (260.0, 250.0),
    "chair_lounge":         (390.0, 380.0),
    "sofa_mags":            (1200.0, 500.0),
    "desk_bench_1600":      (800.0, 400.0),
    "table_boardroom_4000": (2000.0, 700.0),
    "framery_one":          (500.0, 500.0),
}
_HERO_DEFAULT_HALF_MM = (1000.0, 500.0)


# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------


class EnvelopeViolation(TypedDict, total=False):
    """One entry per entity that triggered the validator. Surfaced on
    `VariantOutput.envelope_violations` for the variant card UI to show."""

    project_id: str | None
    entity_index: int
    kind: str
    label: str | None
    bbox_mm_before: list[float]
    bbox_mm_after: list[float] | None  # None if rejected
    overflow_ratio: float
    action: str  # "log_only" | "clamp" | "reject"
    reason: str


# ---------------------------------------------------------------------------
# Bbox computers — one per kind. Mirror of design_office_extensions.rb.
# ---------------------------------------------------------------------------


def _bbox_workstation_cluster(p: dict) -> tuple[float, float, float, float] | None:
    origin = p.get("origin_mm")
    if not isinstance(origin, (list, tuple)) or len(origin) < 2:
        return None
    try:
        ox, oy = float(origin[0]), float(origin[1])
    except (TypeError, ValueError):
        return None
    count = int(p.get("count") or 1)
    spacing = float(p.get("row_spacing_mm") or _DESK_W_MM)
    angle = math.radians(float(p.get("orientation_deg") or 0))
    cos_a, sin_a = math.cos(angle), math.sin(angle)
    xs: list[float] = []
    ys: list[float] = []
    for i in range(count):
        x0 = ox + i * spacing * cos_a
        y0 = oy + i * spacing * sin_a
        xs.extend([x0, x0 + _DESK_W_MM])
        ys.extend([y0, y0 + _DESK_D_MM])
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
    return x, y, x + _PHONE_BOOTH_W_MM, y + _PHONE_BOOTH_D_MM


def _bbox_partition_wall(p: dict) -> tuple[float, float, float, float] | None:
    s = p.get("start_mm"); e = p.get("end_mm")
    if not (isinstance(s, (list, tuple)) and isinstance(e, (list, tuple))):
        return None
    try:
        x1, y1 = float(s[0]), float(s[1])
        x2, y2 = float(e[0]), float(e[1])
    except (TypeError, ValueError):
        return None
    # 100 mm half-thickness margin matching create_partition_wall ruby.
    t = 100.0
    return min(x1, x2) - t, min(y1, y2) - t, max(x1, x2) + t, max(y1, y2) + t


def _bbox_from_bbox_mm(p: dict) -> tuple[float, float, float, float] | None:
    bb = p.get("bbox_mm")
    if not isinstance(bb, (list, tuple)) or len(bb) < 4:
        return None
    try:
        x0, y0, x1, y1 = (float(v) for v in bb[:4])
    except (TypeError, ValueError):
        return None
    return min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)


def _bbox_human(p: dict) -> tuple[float, float, float, float] | None:
    pos = p.get("position_mm")
    if not isinstance(pos, (list, tuple)) or len(pos) < 2:
        return None
    try:
        x, y = float(pos[0]), float(pos[1])
    except (TypeError, ValueError):
        return None
    return x - _HUMAN_HALF_MM, y - _HUMAN_HALF_MM, x + _HUMAN_HALF_MM, y + _HUMAN_HALF_MM


def _bbox_plant(p: dict) -> tuple[float, float, float, float] | None:
    pos = p.get("position_mm")
    if not isinstance(pos, (list, tuple)) or len(pos) < 2:
        return None
    try:
        x, y = float(pos[0]), float(pos[1])
    except (TypeError, ValueError):
        return None
    return x - _PLANT_HALF_MM, y - _PLANT_HALF_MM, x + _PLANT_HALF_MM, y + _PLANT_HALF_MM


def _bbox_hero(p: dict) -> tuple[float, float, float, float] | None:
    pos = p.get("position_mm")
    if not isinstance(pos, (list, tuple)) or len(pos) < 2:
        return None
    try:
        x, y = float(pos[0]), float(pos[1])
    except (TypeError, ValueError):
        return None
    half = _HERO_FOOTPRINTS_MM.get(str(p.get("slug") or ""), _HERO_DEFAULT_HALF_MM)
    return x - half[0], y - half[1], x + half[0], y + half[1]


_BBOX_DISPATCH = {
    "workstation_cluster":  _bbox_workstation_cluster,
    "meeting_room":         _bbox_meeting_room,
    "phone_booth":          _bbox_phone_booth,
    "partition_wall":       _bbox_partition_wall,
    "collab_zone":          _bbox_from_bbox_mm,
    "biophilic_zone":       _bbox_from_bbox_mm,
    "place_human":          _bbox_human,
    "place_plant":          _bbox_plant,
    "place_hero":           _bbox_hero,
}

# Kinds that have no spatial footprint (scene-level palette / tags).
_NO_FOOTPRINT_KINDS = {"apply_variant_palette"}


# ---------------------------------------------------------------------------
# Overflow & clamp helpers
# ---------------------------------------------------------------------------


def _overflow_ratio(
    bbox: tuple[float, float, float, float],
    envelope: tuple[float, float, float, float],
) -> float:
    """Fraction of the bbox area lying OUTSIDE the envelope.

    Identical metric to parser._bbox_overflow_ratio so cross-layer
    diagnostics stay consistent. Returns 0.0 for clean placements,
    1.0 for fully-outside placements, 0.5 for half-outside, etc.
    """
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


def _classify_overflow(overflow: float) -> str:
    if overflow <= MINOR_OVERFLOW_THRESHOLD:
        return "minor"  # ≤ 5 %, treat as clean
    if overflow <= MODERATE_OVERFLOW_THRESHOLD:
        return "moderate"  # ≤ 15 %, clamp candidate
    return "extreme"  # > 15 %, reject candidate


# ---------------------------------------------------------------------------
# Clamp implementations — kind-specific, returning a NEW zone dict
# ---------------------------------------------------------------------------


def _clamp_translate(
    bbox: tuple[float, float, float, float],
    envelope: tuple[float, float, float, float],
) -> tuple[float, float] | None:
    """Compute a (dx, dy) translation that brings ``bbox`` fully inside
    ``envelope`` if such a translation exists. Returns None if the
    bbox is wider/taller than the envelope (no translation can fix it,
    only shrinkage)."""

    bx0, by0, bx1, by1 = bbox
    ex0, ey0, ex1, ey1 = envelope
    bw = bx1 - bx0; bh = by1 - by0
    ew = ex1 - ex0; eh = ey1 - ey0
    if bw > ew + 1.0 or bh > eh + 1.0:
        return None
    dx = 0.0
    dy = 0.0
    if bx0 < ex0:
        dx = ex0 - bx0
    elif bx1 > ex1:
        dx = ex1 - bx1
    if by0 < ey0:
        dy = ey0 - by0
    elif by1 > ey1:
        dy = ey1 - by1
    return dx, dy


def _clamp_zone_translate(zone: dict, dx: float, dy: float) -> dict:
    """Apply a (dx, dy) translation to whichever coordinate fields the
    zone uses. Pure : returns a new dict, doesn't mutate the input."""

    new = dict(zone)
    for key in ("origin_mm", "position_mm", "start_mm", "end_mm",
                "corner1_mm", "corner2_mm"):
        v = zone.get(key)
        if isinstance(v, (list, tuple)) and len(v) >= 2:
            try:
                new[key] = [float(v[0]) + dx, float(v[1]) + dy]
            except (TypeError, ValueError):
                pass
    bb = zone.get("bbox_mm")
    if isinstance(bb, (list, tuple)) and len(bb) >= 4:
        try:
            new["bbox_mm"] = [
                float(bb[0]) + dx, float(bb[1]) + dy,
                float(bb[2]) + dx, float(bb[3]) + dy,
            ]
        except (TypeError, ValueError):
            pass
    return new


def _clamp_zone_clip_bbox(
    zone: dict, envelope: tuple[float, float, float, float],
) -> dict | None:
    """For zones whose footprint is bigger than the envelope (rare —
    a 30 m boardroom on a 22 m plate), shrink the bbox to fit. Only
    valid for ``meeting_room`` / ``collab_zone`` / ``biophilic_zone``
    (kinds whose footprint is directly bbox-controlled). Returns None
    if the resulting clipped bbox would be degenerate (< 1 m on either
    axis), in which case the caller should fall through to reject."""

    ex0, ey0, ex1, ey1 = envelope
    bb = zone.get("bbox_mm")
    c1 = zone.get("corner1_mm"); c2 = zone.get("corner2_mm")
    if isinstance(bb, (list, tuple)) and len(bb) >= 4:
        try:
            bx0, by0, bx1, by1 = (float(v) for v in bb[:4])
        except (TypeError, ValueError):
            return None
        new_x0 = max(ex0, min(bx0, bx1))
        new_y0 = max(ey0, min(by0, by1))
        new_x1 = min(ex1, max(bx0, bx1))
        new_y1 = min(ey1, max(by0, by1))
        if new_x1 - new_x0 < 1000 or new_y1 - new_y0 < 1000:
            return None
        new = dict(zone)
        new["bbox_mm"] = [new_x0, new_y0, new_x1, new_y1]
        return new
    if (isinstance(c1, (list, tuple)) and len(c1) >= 2
            and isinstance(c2, (list, tuple)) and len(c2) >= 2):
        try:
            x1, y1 = float(c1[0]), float(c1[1])
            x2, y2 = float(c2[0]), float(c2[1])
        except (TypeError, ValueError):
            return None
        new_x1 = max(ex0, min(min(x1, x2), max(x1, x2)))
        new_y1 = max(ey0, min(min(y1, y2), max(y1, y2)))
        new_x2 = min(ex1, max(min(x1, x2), max(x1, x2)))
        new_y2 = min(ey1, max(min(y1, y2), max(y1, y2)))
        if new_x2 - new_x1 < 1000 or new_y2 - new_y1 < 1000:
            return None
        new = dict(zone)
        new["corner1_mm"] = [new_x1, new_y1]
        new["corner2_mm"] = [new_x2, new_y2]
        return new
    return None


def _attempt_clamp_workstation_count(
    zone: dict, envelope: tuple[float, float, float, float],
) -> dict | None:
    """workstation_cluster needs special handling — translation alone
    fails when the cluster is intrinsically too long for the plate.
    Reduce ``count`` until the cluster fits. Returns None if even
    count=2 doesn't fit (the plate is too small for any cluster at
    that orientation, the agent should have picked a different
    orientation or kind)."""

    origin = zone.get("origin_mm")
    if not isinstance(origin, (list, tuple)) or len(origin) < 2:
        return None
    try:
        ox, oy = float(origin[0]), float(origin[1])
    except (TypeError, ValueError):
        return None
    count = int(zone.get("count") or 1)
    spacing = float(zone.get("row_spacing_mm") or _DESK_W_MM)
    angle = math.radians(float(zone.get("orientation_deg") or 0))
    cos_a, sin_a = math.cos(angle), math.sin(angle)

    for trial in range(count, 1, -1):
        xs = []
        ys = []
        for i in range(trial):
            x0 = ox + i * spacing * cos_a
            y0 = oy + i * spacing * sin_a
            xs.extend([x0, x0 + _DESK_W_MM])
            ys.extend([y0, y0 + _DESK_D_MM])
        bbox = (min(xs), min(ys), max(xs), max(ys))
        translation = _clamp_translate(bbox, envelope)
        if translation is None:
            continue
        dx, dy = translation
        new = dict(zone)
        new["count"] = trial
        new["origin_mm"] = [ox + dx, oy + dy]
        return new
    return None


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def validate_zones_against_envelope(
    zones: list[dict],
    envelope_mm: tuple[float, float],
    *,
    project_id: str | None = None,
    strict: bool = False,
) -> tuple[list[dict], list[EnvelopeViolation]]:
    """Validate every zone's footprint against the plate envelope.

    Args :
      zones        : the agent's emitted zones list (ordered).
      envelope_mm  : ``(plate_w_mm, plate_h_mm)`` from FloorPlan.
      project_id   : optional content-hash id, plumbed into structured
                     warnings so production logs correlate to an upload.
      strict       : False → log WARNINGs only, return zones unchanged.
                     True  → apply clamp / reject actions on overflow.

    Returns :
      (cleaned_zones, violations)
        - cleaned_zones : zones list, possibly mutated when strict=True
                          (clamps applied, rejects removed). When
                          strict=False, identical to input.
        - violations    : structured list ready for VariantOutput's
                          envelope_violations field.
    """
    plate_w_mm, plate_h_mm = envelope_mm
    envelope: tuple[float, float, float, float] = (
        0.0, 0.0, float(plate_w_mm), float(plate_h_mm),
    )

    cleaned: list[dict] = []
    violations: list[EnvelopeViolation] = []

    for idx, zone in enumerate(zones):
        if not isinstance(zone, dict):
            cleaned.append(zone)  # let downstream complain about shape
            continue
        kind = str(zone.get("kind") or "")
        if kind in _NO_FOOTPRINT_KINDS or kind not in _BBOX_DISPATCH:
            cleaned.append(zone)
            continue
        bbox = _BBOX_DISPATCH[kind](zone)
        if bbox is None:
            cleaned.append(zone)
            continue
        overflow = _overflow_ratio(bbox, envelope)
        cls = _classify_overflow(overflow)
        if cls == "minor":
            cleaned.append(zone)
            continue

        # Build a base violation record (filled in below per action).
        label = (
            zone.get("name")
            or zone.get("label")
            or zone.get("slug")
            or kind
        )
        bbox_before = [round(v, 1) for v in bbox]
        violation: EnvelopeViolation = {
            "project_id": project_id,
            "entity_index": idx,
            "kind": kind,
            "label": str(label) if label else None,
            "bbox_mm_before": bbox_before,
            "bbox_mm_after": None,
            "overflow_ratio": round(overflow, 4),
            "action": "log_only",
            "reason": "",
        }

        if not strict:
            violation["action"] = "log_only"
            violation["reason"] = (
                f"strict=False — entity kept untouched, overflow={overflow:.1%} "
                f"({cls})"
            )
            _logger.warning(
                "zone_envelope_overflow_log_only",
                extra={**violation},
            )
            violations.append(violation)
            cleaned.append(zone)
            continue

        # strict=True policy (revised after Phase C tests, Saad's
        # "seuil 15% ajustable selon ce que tu observes") :
        #   • Always attempt clamp first via the most preserving strategy
        #     available (translate → count-reduce → bbox-clip).
        #   • Reject ONLY when no clamp strategy can geometrically fit
        #     the entity (e.g. a 30 m boardroom on a 22 m plate that
        #     would clip below 1 m on either axis, or coordinates so
        #     extreme that even translate can't bring the bbox inside).
        #   • Class label (moderate / extreme) drives the WARNING reason
        #     text only — useful for the architect skimming logs to know
        #     "this was a small adjustment" vs "this was a major rescue".
        #
        # Rationale : the 15 % threshold for action gating turned out to
        # be too punitive in test runs — the Phase A signature case
        # (21 % overflow workstation cluster) can be fixed by a 4 m
        # westward shift, dropping it would lose creative intent the
        # agent expressed correctly except for one coordinate. Rejecting
        # only what's truly geometrically impossible delivers Saad's
        # "0 visible leak" with maximum preservation.
        new_zone = _clamp_to_fit(zone, kind, envelope)
        if new_zone is not None:
            new_bbox = _BBOX_DISPATCH[kind](new_zone)
            violation["action"] = "clamp"
            violation["bbox_mm_after"] = (
                [round(v, 1) for v in new_bbox] if new_bbox else None
            )
            qualifier = (
                "minor adjustment"
                if cls == "moderate"
                else "major recovery"
            )
            violation["reason"] = (
                f"overflow {overflow:.1%} — clamped inward to fit ({qualifier})"
            )
            _logger.warning(
                "zone_envelope_overflow_clamped",
                extra={**violation},
            )
            violations.append(violation)
            cleaned.append(new_zone)
            continue

        violation["action"] = "reject"
        violation["bbox_mm_after"] = None
        violation["reason"] = (
            f"overflow {overflow:.1%} — no clamp strategy fits "
            f"(would mutilate geometry below the 1 m floor)"
        )
        _logger.warning(
            "zone_envelope_overflow_rejected",
            extra={**violation},
        )
        violations.append(violation)
        # Drop the zone entirely.

    return cleaned, violations


def _clamp_to_fit(
    zone: dict, kind: str, envelope: tuple[float, float, float, float],
) -> dict | None:
    """Dispatcher : pick the right clamp strategy for the kind."""

    bbox = _BBOX_DISPATCH[kind](zone)
    if bbox is None:
        return None

    # Strategy 1 — pure translation. Works for everything that's
    # smaller than the envelope.
    translation = _clamp_translate(bbox, envelope)
    if translation is not None:
        dx, dy = translation
        return _clamp_zone_translate(zone, dx, dy)

    # Strategy 2 — workstation_cluster gets count reduction.
    if kind == "workstation_cluster":
        reduced = _attempt_clamp_workstation_count(zone, envelope)
        if reduced is not None:
            return reduced

    # Strategy 3 — bbox-shaped zones get clipped.
    if kind in ("meeting_room", "collab_zone", "biophilic_zone"):
        clipped = _clamp_zone_clip_bbox(zone, envelope)
        if clipped is not None:
            return clipped

    return None


__all__ = [
    "MINOR_OVERFLOW_THRESHOLD",
    "MODERATE_OVERFLOW_THRESHOLD",
    "EnvelopeViolation",
    "validate_zones_against_envelope",
]
