"""Unit tests for `app.agents.zone_overlap_validator`.

iter-26 P2 (Saad, 2026-04-25). Detection-only validator ; no
auto-move. Tests cover :
  - simple non-overlapping pair → no warning
  - clear collision (>0.5 m² overlap) → 1 warning, description is
    actionable (zone labels + areas + collision in m²)
  - kissing edges (sub-tolerance) → no warning
  - intentional containment (collab inside biophilic) → no warning
  - workstation_cluster bbox derived from origin + count + spacing
    matches the Ruby placement convention
  - mixed list with one overlap among many zones surfaces only the
    real collision
"""

from __future__ import annotations

from app.agents.zone_overlap_validator import (
    MIN_OVERLAP_M2,
    detect_overlaps,
)


def _meeting(name: str, x0: float, y0: float, x1: float, y1: float) -> dict:
    return {
        "kind": "meeting_room",
        "corner1_mm": [x0, y0],
        "corner2_mm": [x1, y1],
        "name": name,
    }


def _collab(name: str, x0: float, y0: float, x1: float, y1: float) -> dict:
    return {
        "kind": "collab_zone",
        "bbox_mm": [x0, y0, x1, y1],
        "name": name,
    }


def _biophilic(name: str, x0: float, y0: float, x1: float, y1: float) -> dict:
    return {
        "kind": "biophilic_zone",
        "bbox_mm": [x0, y0, x1, y1],
        "name": name,
    }


def _cluster(
    name: str,
    *,
    origin: tuple[float, float],
    orientation_deg: float = 0,
    count: int = 1,
    row_spacing_mm: int = 1600,
) -> dict:
    return {
        "kind": "workstation_cluster",
        "origin_mm": list(origin),
        "orientation_deg": orientation_deg,
        "count": count,
        "row_spacing_mm": row_spacing_mm,
        "product_id": "steelcase_migration_se",
        "name": name,
    }


# ─────────────────────────────── basic geometry ───────────────────────────


def test_no_overlap_returns_empty_list() -> None:
    zones = [
        _meeting("Boardroom", 0, 0, 6000, 4000),
        _meeting("Focus", 10_000, 0, 14_000, 3000),
    ]
    assert detect_overlaps(zones) == []


def test_clear_collision_surfaces_one_warning_with_actionable_description() -> None:
    # 6×4 m boardroom + 4×4 m library, 2m of horizontal overlap → 8 m².
    zones = [
        _meeting("Boardroom", 0, 0, 6000, 4000),
        _collab("Library", 4000, 0, 8000, 4000),
    ]
    warnings = detect_overlaps(zones)
    assert len(warnings) == 1
    w = warnings[0]
    assert w["kind"] == "geometric_overlap"
    assert set(w["zones"]) == {"Boardroom", "Library"}
    assert set(w["kinds"]) == {"meeting_room", "collab_zone"}
    # 2m × 4m = 8 m² intersection.
    assert abs(w["overlap_m2"] - 8.0) < 0.05
    # Description must be human-readable + cite both labels + areas.
    desc = w["description"]
    assert "Boardroom" in desc
    assert "Library" in desc
    assert "m²" in desc


def test_kissing_edges_below_tolerance_are_suppressed() -> None:
    # Two rooms sharing a 1mm sliver — under MIN_OVERLAP_M2.
    zones = [
        _meeting("A", 0, 0, 5000, 4000),
        _meeting("B", 4999, 0, 9999, 4000),  # 1mm × 4m = 0.004 m²
    ]
    warnings = detect_overlaps(zones)
    assert warnings == []
    assert MIN_OVERLAP_M2 >= 0.1, "tolerance shouldn't be loose enough to ignore real collisions"


def test_intentional_containment_does_not_warn() -> None:
    # Biophilic zone fully wraps a smaller collab zone — that's nested
    # by design (e.g. plants ringing a focus library), not a collision.
    zones = [
        _biophilic("Greenring", 0, 0, 12_000, 8000),
        _collab("Focus library", 3000, 2000, 9000, 6000),  # fully inside
    ]
    assert detect_overlaps(zones) == []


def test_partial_overlap_above_containment_threshold_still_warns() -> None:
    # Inner zone is 80% inside the outer — below the 95% containment
    # cutoff, so we DO warn (likely a misalignment, not nesting).
    zones = [
        _biophilic("Greenring", 0, 0, 10_000, 5000),
        _collab("Café", 8000, 0, 14_000, 5000),  # half inside, half out
    ]
    warnings = detect_overlaps(zones)
    assert len(warnings) == 1


# ─────────────────────────────── workstation cluster ─────────────────────────


def test_workstation_cluster_bbox_matches_ruby_placement() -> None:
    # 5 desks at orientation 0, spacing 1600. Each desk is 1600×800.
    # Ruby places desks at (origin + i*1600 along +x). So bbox spans
    # 5 desks * 1600 = 8000 wide + 800 deep, anchored at origin.
    cluster = _cluster("Tech row", origin=(1000, 500), count=5)
    overlap_with_self = detect_overlaps([cluster, cluster])
    # Same cluster vs itself : 100 % overlap → caught as containment,
    # NO warning. Sanity check that containment escape works on
    # workstation clusters too.
    assert overlap_with_self == []

    # Now a meeting room that genuinely sits on top of the row.
    overlap = detect_overlaps([
        cluster,
        _meeting("Stomp", 2000, 0, 6000, 1500),  # crashes through 4 desks
    ])
    assert len(overlap) == 1
    w = overlap[0]
    assert "workstation cluster" in w["zones"][0] or "workstation cluster" in w["zones"][1]


def test_workstation_cluster_orientation_90_extends_along_y() -> None:
    cluster = _cluster(
        "Vertical row", origin=(1000, 500), orientation_deg=90, count=4
    )
    # Bbox ≈ (1000, 500, 1000+1600, 500 + 3*1600 + 800) = (1000,500, 2600, 6100).
    # A meeting room straddling the EAST flank of the cluster bbox must
    # warn — partial overlap (not contained) so the heuristic surfaces it.
    overlap = detect_overlaps([
        cluster,
        _meeting("Y collide", 2000, 4000, 4000, 5500),
    ])
    assert len(overlap) == 1, (
        "expected partial overlap on cluster's east flank to warn; "
        f"got {overlap}"
    )


def test_decorative_zones_are_skipped() -> None:
    # phone_booth, place_*, partition_wall and apply_variant_palette
    # all live in the trace but have no 2D area we score against.
    zones = [
        {"kind": "phone_booth", "position_mm": [1000, 1000], "product_id": "framery_one"},
        {"kind": "place_human", "position_mm": [2000, 2000], "pose": "standing"},
        {"kind": "place_plant", "position_mm": [3000, 3000], "species": "ficus_lyrata"},
        {
            "kind": "place_hero", "slug": "chair_office",
            "position_mm": [4000, 4000], "orientation_deg": 0,
        },
        {"kind": "partition_wall", "start_mm": [0, 0], "end_mm": [5000, 0], "kind_value": "acoustic"},
        {"kind": "apply_variant_palette", "walls": "white", "floor": "wood", "accent": "moss"},
    ]
    assert detect_overlaps(zones) == []


# ─────────────────────────────── full-mix scenario ────────────────────────────


def test_real_world_mix_only_flags_the_real_collision() -> None:
    """A realistic variant trace : 1 boardroom, 1 collab, 1 biophilic
    that contains the collab, 2 workstation clusters, several phone
    booths + decor. Only one ACTUAL collision in the mix."""

    zones = [
        _meeting("Boardroom", 20_000, 18_000, 26_000, 22_000),
        _collab("Café central", 8_000, 4_000, 14_000, 12_000),
        _biophilic("Greenring", 6_000, 2_000, 16_000, 14_000),  # contains café
        _cluster("Tech row", origin=(30_000, 4_000), count=8),
        _cluster("Product row", origin=(30_000, 6_000), count=8),
        # Real collision : second workstation row sits ON the first one
        # because oy is too close (depth=800, but row at y=6000 overlaps
        # row at y=4000+800=4800 by no margin … actually y=4000-4800 vs
        # y=6000-6800 — 1.2m gap, fine). Force one.
        _meeting("Stomp", 30_000, 3500, 36_000, 5000),  # smashes Tech row
        {"kind": "phone_booth", "position_mm": [50_000, 50_000], "product_id": "framery_one"},
    ]
    warnings = detect_overlaps(zones)
    # Stomp vs Tech row is the only real collision.
    assert len(warnings) == 1
    labels = warnings[0]["zones"]
    assert "Stomp" in labels
    assert any("workstation cluster" in lb or "Tech" in lb for lb in labels)
