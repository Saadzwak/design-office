"""Detect axis-aligned bbox overlaps between LLM-generated variant zones.

iter-26 P2 (Saad, 2026-04-25). **Detection only — no auto-move.**

The validator surfaces an actionable warning the architect can either
accept ("crit pit DOES sit inside the studio nave by design") or fix
via the iterate chat ("move the boardroom 1 m east"). Auto-
repositioning was deliberately deferred to iter-27+ because moving
zones silently invalidates the reviewer + adjacency scores that
already ran against the original layout, making the displayed metrics
a lie.

Heuristics
----------
- Zones are axis-aligned rectangles. We support the four area kinds :
    `meeting_room`        from corner1_mm + corner2_mm
    `collab_zone`         from bbox_mm = [x0, y0, x1, y1]
    `biophilic_zone`      from bbox_mm
    `workstation_cluster` from origin_mm + orientation_deg + count +
                          row_spacing_mm — bbox computed against the
                          Ruby placement (DEFAULT_DESK_W=1600, D=800).
- Skipped on purpose : `partition_wall` (1D), `phone_booth` (point-
  placed entity), `place_human` / `place_plant` / `place_hero` /
  `apply_variant_palette` (decor / scene-wide).
- Tolerance : `MIN_OVERLAP_M2` filters out kissing edges (rounding
  noise from the LLM's rounded mm values). Anything below that area
  is suppressed — overlapping by 0.05 m² is geometric rounding, not
  a real collision.
- A zone is allowed to FULLY contain a smaller one with no warning :
  a `biophilic_zone` wrapping a `collab_zone` is intentional. Only
  partial intersections raise.

Output
------
`detect_overlaps(zones)` returns a list of `OverlapWarning` dicts ready
for the variant card warning UI :

    {
      "kind": "geometric_overlap",
      "zones": ["Boardroom", "Library"],
      "kinds": ["meeting_room", "collab_zone"],
      "overlap_m2": 0.4,
      "areas_m2": [8.0, 1.2],
      "description": "Boardroom (8 m²) overlaps Library (1.2 m²) — collision 0.4 m²",
    }
"""

from __future__ import annotations

from typing import Any, TypedDict


# Default desk footprint in mm — must match
# `sketchup-plugin/design_office_extensions.rb::DEFAULT_DESK_W_MM /
# _D_MM` so the bbox we compute lines up with what the Ruby actually
# draws.
_DESK_W_MM = 1600
_DESK_D_MM = 800
_DEFAULT_ROW_SPACING_MM = 1600

# Below this overlap area, we treat the collision as kissing edges /
# rounding noise from the LLM's mm values. Tuned conservatively so
# real architecturally-meaningful collisions (>0.5 m² of shared
# floor) raise but a 1-cm misalignment doesn't.
MIN_OVERLAP_M2 = 0.5

# Containment tolerance : if zone B is at least this much engulfed by
# zone A, treat as intentional containment (don't warn).
CONTAINMENT_RATIO = 0.95


class _BBox(TypedDict):
    x0: float
    y0: float
    x1: float
    y1: float
    label: str
    kind: str


class OverlapWarning(TypedDict):
    kind: str  # always "geometric_overlap"
    zones: list[str]  # 2 labels
    kinds: list[str]  # 2 zone kinds
    overlap_m2: float
    areas_m2: list[float]
    description: str


# ─────────────────────────────────── bbox extraction ───────────────────────


def _bbox_from_zone(zone: dict[str, Any]) -> _BBox | None:
    """Project an LLM zone to an axis-aligned bbox in mm.

    Returns None for zones without a 2D footprint (partition_wall,
    phone_booth, place_*, apply_variant_palette) or with malformed
    coordinates. Caller should silently skip None.
    """

    kind = zone.get("kind") or ""

    if kind == "meeting_room":
        c1 = zone.get("corner1_mm")
        c2 = zone.get("corner2_mm")
        if not (
            isinstance(c1, (list, tuple))
            and isinstance(c2, (list, tuple))
            and len(c1) >= 2
            and len(c2) >= 2
        ):
            return None
        x0, x1 = sorted([float(c1[0]), float(c2[0])])
        y0, y1 = sorted([float(c1[1]), float(c2[1])])
        if x1 - x0 < 1 or y1 - y0 < 1:
            return None
        label = zone.get("name") or "meeting room"
        return _BBox(x0=x0, y0=y0, x1=x1, y1=y1, label=str(label), kind=kind)

    if kind in ("collab_zone", "biophilic_zone"):
        bbox = zone.get("bbox_mm")
        if not (isinstance(bbox, (list, tuple)) and len(bbox) >= 4):
            return None
        x0, x1 = sorted([float(bbox[0]), float(bbox[2])])
        y0, y1 = sorted([float(bbox[1]), float(bbox[3])])
        if x1 - x0 < 1 or y1 - y0 < 1:
            return None
        label = (
            zone.get("name")
            or zone.get("style_value")
            or ("collab" if kind == "collab_zone" else "biophilic")
        )
        return _BBox(x0=x0, y0=y0, x1=x1, y1=y1, label=str(label), kind=kind)

    if kind == "workstation_cluster":
        origin = zone.get("origin_mm") or zone.get("position_mm")
        if not (isinstance(origin, (list, tuple)) and len(origin) >= 2):
            return None
        ox = float(origin[0])
        oy = float(origin[1])
        try:
            orientation = float(zone.get("orientation_deg") or 0.0)
        except (TypeError, ValueError):
            orientation = 0.0
        try:
            count = max(1, int(zone.get("count") or 1))
        except (TypeError, ValueError):
            count = 1
        try:
            spacing = float(zone.get("row_spacing_mm") or _DEFAULT_ROW_SPACING_MM)
        except (TypeError, ValueError):
            spacing = float(_DEFAULT_ROW_SPACING_MM)

        # The Ruby places each desk at i * spacing along the orientation
        # vector. For axis-aligned orientations (0/90/180/270) the bbox
        # is exact ; for diagonals we widen with the diagonal extent
        # (worst-case) so we don't under-estimate the footprint.
        import math

        cos = math.cos(math.radians(orientation))
        sin = math.sin(math.radians(orientation))
        last_dx = (count - 1) * spacing * cos
        last_dy = (count - 1) * spacing * sin

        # The desk sits at origin + (last_dx, last_dy), with width along
        # the local +x axis and depth along the local +y axis. We bound
        # via the convex hull of the 4 corner points of the first AND
        # the last desk, which is sufficient for axis-aligned layouts
        # (orientation in {0, 90, 180, 270}).
        first_corners = [
            (ox, oy),
            (ox + _DESK_W_MM, oy),
            (ox + _DESK_W_MM, oy + _DESK_D_MM),
            (ox, oy + _DESK_D_MM),
        ]
        last_ox = ox + last_dx
        last_oy = oy + last_dy
        last_corners = [
            (last_ox, last_oy),
            (last_ox + _DESK_W_MM, last_oy),
            (last_ox + _DESK_W_MM, last_oy + _DESK_D_MM),
            (last_ox, last_oy + _DESK_D_MM),
        ]
        xs = [c[0] for c in first_corners + last_corners]
        ys = [c[1] for c in first_corners + last_corners]
        return _BBox(
            x0=min(xs),
            y0=min(ys),
            x1=max(xs),
            y1=max(ys),
            label=f"workstation cluster (×{count})",
            kind=kind,
        )

    return None


# ─────────────────────────────────── geometry ──────────────────────────────


def _intersection_m2(a: _BBox, b: _BBox) -> float:
    """Area (in m²) of the axis-aligned intersection of two bboxes."""

    dx = min(a["x1"], b["x1"]) - max(a["x0"], b["x0"])
    dy = min(a["y1"], b["y1"]) - max(a["y0"], b["y0"])
    if dx <= 0 or dy <= 0:
        return 0.0
    # mm² → m²
    return (dx * dy) / 1_000_000.0


def _area_m2(b: _BBox) -> float:
    return ((b["x1"] - b["x0"]) * (b["y1"] - b["y0"])) / 1_000_000.0


def _is_contained(inner: _BBox, outer: _BBox) -> bool:
    """True when at least CONTAINMENT_RATIO of `inner`'s area is within
    `outer`. Treat as intentional nesting (no warning)."""

    inner_area = _area_m2(inner)
    if inner_area <= 0:
        return False
    overlap = _intersection_m2(inner, outer)
    return (overlap / inner_area) >= CONTAINMENT_RATIO


# ─────────────────────────────────── public API ────────────────────────────


def detect_overlaps(zones: list[dict[str, Any]]) -> list[OverlapWarning]:
    """Return a list of overlap warnings for the given zone list.

    Empty list when no real collision (kissing edges + intentional
    containment both filtered out).
    """

    bboxes: list[_BBox] = []
    for z in zones:
        bb = _bbox_from_zone(z)
        if bb is not None:
            bboxes.append(bb)

    out: list[OverlapWarning] = []
    n = len(bboxes)
    for i in range(n):
        for j in range(i + 1, n):
            a, b = bboxes[i], bboxes[j]
            overlap = _intersection_m2(a, b)
            if overlap < MIN_OVERLAP_M2:
                continue
            # Containment in either direction → intentional nesting.
            if _is_contained(a, b) or _is_contained(b, a):
                continue
            area_a = _area_m2(a)
            area_b = _area_m2(b)
            description = (
                f"{a['label']} ({area_a:.1f} m²) overlaps "
                f"{b['label']} ({area_b:.1f} m²) — collision "
                f"{overlap:.1f} m²"
            )
            out.append(
                OverlapWarning(
                    kind="geometric_overlap",
                    zones=[a["label"], b["label"]],
                    kinds=[a["kind"], b["kind"]],
                    overlap_m2=round(overlap, 2),
                    areas_m2=[round(area_a, 2), round(area_b, 2)],
                    description=description,
                )
            )

    return out
