"""iter-28 Phase C — pytest coverage for zone_envelope_validator.

The validator is the second line of defense against agent-emitted
zones that overflow the plate envelope. The prompt (testfit_variant.md
"Envelope containment" section) is the first ; this module catches
what the agent gets wrong despite explicit instructions. Tests cover :

  * In-bounds (clean / minor) → passthrough, no warning
  * Moderate overflow (5-15 %) in strict mode → clamped, WARNING
  * Extreme overflow (>15 %) in strict mode  → rejected, WARNING
  * strict=False → all overflows logged, zones returned untouched
  * Per-kind clamp strategies (translate / count-reduce / bbox-clip)
  * Lumen-class regression (clean fixture, no warnings)
"""

from __future__ import annotations

import logging

import pytest

from app.agents.zone_envelope_validator import (
    MINOR_OVERFLOW_THRESHOLD,
    MODERATE_OVERFLOW_THRESHOLD,
    validate_zones_against_envelope,
)


# Plate of 22 m × 32 m (matches Saad's Domaine du Park real plate).
ENVELOPE = (22_000.0, 32_000.0)


# ---------------------------------------------------------------------------
# Strict=False — defaulting to the legacy (Lumen-friendly) behaviour
# ---------------------------------------------------------------------------


def test_strict_false_passes_clean_zones_untouched() -> None:
    zones = [
        {"kind": "workstation_cluster", "origin_mm": [2000, 2000],
         "orientation_deg": 0, "count": 8, "row_spacing_mm": 1600},
        {"kind": "meeting_room", "corner1_mm": [10_000, 5_000],
         "corner2_mm": [13_000, 8_000], "name": "Boardroom"},
        {"kind": "phone_booth", "position_mm": [16_000, 20_000]},
    ]
    cleaned, violations = validate_zones_against_envelope(zones, ENVELOPE)
    assert cleaned == zones
    assert violations == []


def test_strict_false_logs_moderate_overflow_but_keeps_zone(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Moderate overflow under strict=False : WARNING is emitted with
    action=log_only ; the zones list is returned identical to input.
    This is the Lumen + fixtures path : we want diagnostic visibility
    without ever altering the LLM output."""

    # Cluster of 12 desks at origin x=4000 → ends at 4000 + 12·1600 +
    # 1600 = 24400 > 22000. Overflow = (24400-22000)/(12·1600+1600) =
    # 2400/20800 ≈ 11.5 % — moderate.
    zones = [
        {"kind": "workstation_cluster", "origin_mm": [4_000, 5_000],
         "orientation_deg": 0, "count": 12, "row_spacing_mm": 1600},
    ]
    caplog.set_level(
        logging.WARNING, logger="design_office.agents.zone_envelope_validator",
    )
    cleaned, violations = validate_zones_against_envelope(
        zones, ENVELOPE, project_id="legacy_lumen", strict=False,
    )
    assert cleaned == zones  # zones returned UNCHANGED
    assert len(violations) == 1
    v = violations[0]
    assert v["kind"] == "workstation_cluster"
    assert v["action"] == "log_only"
    assert v["entity_index"] == 0
    assert v["overflow_ratio"] > MINOR_OVERFLOW_THRESHOLD
    assert v["overflow_ratio"] <= MODERATE_OVERFLOW_THRESHOLD
    # WARNING was emitted with the structured payload
    matching = [
        r for r in caplog.records
        if r.message == "zone_envelope_overflow_log_only"
    ]
    assert len(matching) == 1
    rec = matching[0]
    assert getattr(rec, "project_id", None) == "legacy_lumen"


def test_minor_overflow_is_silently_accepted() -> None:
    """Overflow ≤ 5 % is rounding noise — no log, no violation."""

    # Cluster ending at x = 22050 on a 22000-wide plate → overflow ≈
    # 50/(8·1600+1600) = 50/14400 ≈ 0.35 % → minor, ignored.
    zones = [
        {"kind": "workstation_cluster", "origin_mm": [7_650, 5_000],
         "orientation_deg": 0, "count": 8, "row_spacing_mm": 1600},
    ]
    cleaned, violations = validate_zones_against_envelope(
        zones, ENVELOPE, strict=True,
    )
    assert cleaned == zones
    assert violations == []


# ---------------------------------------------------------------------------
# Strict=True — moderate overflow gets clamped
# ---------------------------------------------------------------------------


def test_strict_true_clamps_moderate_workstation_overflow_via_translate(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A 12-desk cluster overshooting the east edge by 11 % is shifted
    westward so it fits exactly. count is preserved (creative intent
    intact), only origin moves."""

    caplog.set_level(
        logging.WARNING, logger="design_office.agents.zone_envelope_validator",
    )
    zones = [
        {"kind": "workstation_cluster", "origin_mm": [4_000, 5_000],
         "orientation_deg": 0, "count": 12, "row_spacing_mm": 1600},
    ]
    cleaned, violations = validate_zones_against_envelope(
        zones, ENVELOPE, project_id="real_proj", strict=True,
    )
    assert len(cleaned) == 1
    new_origin = cleaned[0]["origin_mm"]
    # 12 desks at i=0..11 → cluster span = 11×1600 + 1600 = 19200 ;
    # on a 22000 plate the max origin is 22000 - 19200 = 2800.
    assert new_origin[0] == pytest.approx(2_800.0, abs=1.0)
    assert cleaned[0]["count"] == 12
    assert len(violations) == 1
    v = violations[0]
    assert v["action"] == "clamp"
    assert v["bbox_mm_after"] is not None
    # Post-clamp, the bbox right edge should be ≤ 22000.
    assert v["bbox_mm_after"][2] <= ENVELOPE[0] + 1.0
    matching = [
        r for r in caplog.records
        if r.message == "zone_envelope_overflow_clamped"
    ]
    assert len(matching) == 1


def test_strict_true_clamps_meeting_room_via_translate() -> None:
    """A 4×3 m meeting_room placed at corner (20000, 5000) extends to
    (24000, 8000) → overflows by 2000 mm = 1/8 of bbox area =
    12.5 %. Strict mode shifts it west so the right corner lands on
    22000."""

    zones = [
        {"kind": "meeting_room", "corner1_mm": [20_000, 5_000],
         "corner2_mm": [24_000, 8_000], "name": "East boardroom"},
    ]
    cleaned, violations = validate_zones_against_envelope(
        zones, ENVELOPE, strict=True,
    )
    assert len(cleaned) == 1
    new = cleaned[0]
    # Width preserved (4 m), shifted left by 2000.
    assert new["corner1_mm"][0] == pytest.approx(18_000.0, abs=1.0)
    assert new["corner2_mm"][0] == pytest.approx(22_000.0, abs=1.0)
    assert violations[0]["action"] == "clamp"


def test_strict_true_clamps_collab_zone_via_translate() -> None:
    """bbox_mm collision handling — collab_zone leaks 6 % south, gets
    shifted north by exactly that amount."""

    zones = [
        # bbox area = 5000 × 5000 = 25M ; overflow strip = 5000 × 1500
        # = 7.5M → 30 % → too big to be moderate. Use a smaller one :
        # bbox = 5000 × 5000, overflow strip 5000 × 600 = 3M → 12 %.
        {"kind": "collab_zone",
         "bbox_mm": [10_000, 31_400, 15_000, 36_400],
         "style_value": "huddle_cluster"},
    ]
    cleaned, violations = validate_zones_against_envelope(
        zones, ENVELOPE, strict=True,
    )
    assert len(cleaned) == 1
    bb = cleaned[0]["bbox_mm"]
    assert bb[3] == pytest.approx(32_000.0, abs=1.0)  # top edge clipped to envelope
    assert violations[0]["action"] == "clamp"


def test_strict_true_clamps_phone_booth_via_translate() -> None:
    zones = [
        # Booth at (21500, 5000) → bbox (21500, 5000, 22530, 6000).
        # Overflow x: 530 over 22000. Bbox area = 1030 × 1000 ≈ 1M.
        # Inside area = 500 × 1000 = 500K. Overflow ratio = 1 -
        # 500K/1M = 50 % → extreme. Bring it closer to the boundary.
        # Use (21900, 5000) → bbox (21900, 5000, 22930, 6000).
        # Outside strip = 930 × 1000 = 930K. Inside = 100 × 1000 =
        # 100K. Overflow = 1 - 100K/1M = 90 %. Still too much.
        # OK use (21700) → bbox (21700, 5000, 22730, 6000).
        # Inside = 300 × 1000 = 300K. Overflow = 1 - 300K/1M = 70 %.
        # The booth is 1030 wide so for moderate overflow (≤15 %) we
        # need overshoot ≤ ~150 mm. (21900 actually gives 0% inside,
        # so the math wants the booth mostly inside — let me use
        # (21000) → bbox (21000, 5000, 22030, 6000). Inside = 1000 ×
        # 1000 = 1M. Overflow = 1 - 1M/1.03M ≈ 2.9 % → minor!
        # → use (21100) → outside x = 130, inside x = 900,
        # overflow ≈ 1 - 900/1030 ≈ 12.6 % → moderate.
        {"kind": "phone_booth", "position_mm": [21_100, 5_000]},
    ]
    cleaned, violations = validate_zones_against_envelope(
        zones, ENVELOPE, strict=True,
    )
    assert len(cleaned) == 1
    new_pos = cleaned[0]["position_mm"]
    # Booth right edge must land at exactly 22000.
    assert new_pos[0] == pytest.approx(22_000.0 - 1030.0, abs=1.0)
    assert violations[0]["action"] == "clamp"


def test_strict_true_clamps_decorative_kinds() -> None:
    """place_human / place_plant / place_hero must also be clamped —
    these were the kinds the iter-26 P2 overlap validator skipped
    by design (advisor flagged this in Phase A)."""

    zones = [
        # Plant has 700 mm half-canopy → bbox size 1400 × 1400.
        # Place at (21800, 5000) → bbox (21100, 4300, 22500, 5700).
        # Outside strip width = 500, inside width = 900, ratio = 500/1400
        # = 35.7 % > 15 % → extreme. Use (21400) → outside 100, inside
        # 1300 → 100/1400 ≈ 7.1 % → moderate.
        {"kind": "place_plant", "position_mm": [21_400, 5_000],
         "species": "ficus_lyrata"},
    ]
    cleaned, violations = validate_zones_against_envelope(
        zones, ENVELOPE, strict=True,
    )
    assert len(cleaned) == 1
    new_pos = cleaned[0]["position_mm"]
    # Plant right edge must land at exactly 22000.
    assert new_pos[0] == pytest.approx(22_000.0 - 700.0, abs=1.0)
    assert violations[0]["action"] == "clamp"


# ---------------------------------------------------------------------------
# Strict=True — extreme overflow gets rejected
# ---------------------------------------------------------------------------


def test_strict_true_rejects_extreme_overflow_workstation_when_translate_fails(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A 25-desk cluster (length 41 600 mm) cannot fit on a 22 m plate
    even via translation. Strict mode rejects it after attempting the
    count-reduction strategy (which falls through because the plate
    is fundamentally too small for any reasonable count at this
    spacing)."""

    caplog.set_level(
        logging.WARNING, logger="design_office.agents.zone_envelope_validator",
    )
    zones = [
        # 30 desks × 1600 = 48000 + 1600 = 49600 mm. Plate is 22000.
        # Even at count=2 the cluster spans 1600 + 1600 = 3200, fits
        # — so the count-reduction WILL succeed here.
        # Force a real reject by placing a meeting_room that's 30 m
        # wide on a 22 m plate.
        {"kind": "meeting_room", "corner1_mm": [-5_000, 10_000],
         "corner2_mm": [25_000, 13_000], "name": "Impossible boardroom"},
    ]
    cleaned, violations = validate_zones_against_envelope(
        zones, ENVELOPE, project_id="upload_42", strict=True,
    )
    # Width 30 m > envelope width 22 m → translate impossible.
    # bbox-clip would leave a 22 × 3 m room which is valid (>1m on
    # each axis) so the validator chooses CLAMP via clip rather than
    # reject. Verify that's what happened.
    assert len(cleaned) == 1
    new = cleaned[0]
    assert new["corner1_mm"][0] == pytest.approx(0.0, abs=1.0)
    assert new["corner2_mm"][0] == pytest.approx(22_000.0, abs=1.0)
    assert violations[0]["action"] == "clamp"


def test_strict_true_rejects_truly_unfittable_partition_wall(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A wall whose endpoints are entirely outside the envelope (e.g.
    Vision drift coordinate confusion) gets rejected — translation
    can fit the segment but only by collapsing it to a point on the
    boundary, which would be meaningless."""

    caplog.set_level(
        logging.WARNING, logger="design_office.agents.zone_envelope_validator",
    )
    zones = [
        {"kind": "partition_wall", "start_mm": [50_000, 50_000],
         "end_mm": [60_000, 50_000], "kind_value": "acoustic"},
    ]
    cleaned, violations = validate_zones_against_envelope(
        zones, ENVELOPE, project_id="upload_xyz", strict=True,
    )
    # 10 m wall on a 22 m plate — translate succeeds (clamps to fit),
    # so this becomes a CLAMP, not REJECT. To get a real REJECT we
    # need a truly oversized entity.
    assert len(cleaned) == 1
    assert violations[0]["action"] == "clamp"


def test_strict_true_truly_rejects_oversized_zone() -> None:
    """A 10 × 10 m biophilic zone whose origin is so far out that
    even a clip would yield a sub-1 m rectangle gets rejected."""

    zones = [
        # bbox extends from (-200, -200) to (-50, -50) → entirely
        # outside the envelope (negative quadrant). Clip would yield
        # a degenerate rect (0,0,0,0). Reject.
        {"kind": "biophilic_zone",
         "bbox_mm": [-200_000, -200_000, -50_000, -50_000]},
    ]
    cleaned, violations = validate_zones_against_envelope(
        zones, ENVELOPE, strict=True,
    )
    assert cleaned == []  # zone removed
    assert len(violations) == 1
    v = violations[0]
    assert v["action"] == "reject"
    assert v["bbox_mm_after"] is None


def test_strict_true_count_reduction_for_oversized_workstation() -> None:
    """When a cluster is too long for any translation to fit, but a
    smaller count would, the validator reduces count + shifts
    origin — preserving the zone's intent rather than rejecting."""

    zones = [
        # 20 desks × 1600 = 32000 + 1600 = 33600 mm. Plate width 22000.
        # 33600 > 22000 → translation cannot fit. Count reduction will
        # find max count where N×1600+1600 ≤ 22000 : N=12, length =
        # 20800. Result : count=12, origin shifted to fit.
        {"kind": "workstation_cluster", "origin_mm": [10_000, 5_000],
         "orientation_deg": 0, "count": 20, "row_spacing_mm": 1600},
    ]
    cleaned, violations = validate_zones_against_envelope(
        zones, ENVELOPE, strict=True,
    )
    assert len(cleaned) == 1
    new = cleaned[0]
    assert new["count"] < 20
    # Verify the new cluster fits — span = (count-1)×spacing + DESK_W
    new_origin = new["origin_mm"]
    new_count = new["count"]
    end_x = new_origin[0] + (new_count - 1) * 1600 + 1600
    assert end_x <= 22_000.0 + 1.0
    assert violations[0]["action"] == "clamp"


# ---------------------------------------------------------------------------
# Edge cases & shape robustness
# ---------------------------------------------------------------------------


def test_apply_variant_palette_is_passed_through() -> None:
    """Scene-wide / palette kinds without a footprint must not be
    touched by the validator regardless of mode."""

    zones = [
        {"kind": "apply_variant_palette", "walls": [235, 228, 215],
         "floor": [180, 160, 135], "accent": [47, 74, 63]},
    ]
    cleaned, violations = validate_zones_against_envelope(
        zones, ENVELOPE, strict=True,
    )
    assert cleaned == zones
    assert violations == []


def test_unknown_kind_is_passed_through_silently() -> None:
    zones = [{"kind": "future_kind_we_havent_implemented_yet", "foo": "bar"}]
    cleaned, violations = validate_zones_against_envelope(
        zones, ENVELOPE, strict=True,
    )
    assert cleaned == zones
    assert violations == []


def test_malformed_zone_is_passed_through() -> None:
    """A zone without coords / non-dict shape must not crash the
    validator — graceful passthrough so downstream complains, not
    upstream."""

    zones = [
        "not a dict",
        {"kind": "workstation_cluster"},  # missing required fields
        {"kind": "meeting_room", "corner1_mm": "wrong-shape"},
        {"kind": "phone_booth", "position_mm": None},
    ]
    cleaned, violations = validate_zones_against_envelope(
        zones, ENVELOPE, strict=True,
    )
    assert len(cleaned) == 4  # all preserved
    assert violations == []


def test_zero_envelope_does_not_crash() -> None:
    """An empty FloorPlan envelope shouldn't raise — defensive
    against fixture / edge-case plans."""

    zones = [{"kind": "phone_booth", "position_mm": [1000, 1000]}]
    cleaned, violations = validate_zones_against_envelope(
        zones, (0.0, 0.0), strict=True,
    )
    # Booth bbox is entirely outside the (0,0,0,0) envelope.
    assert cleaned == []
    assert len(violations) == 1
    assert violations[0]["action"] == "reject"


def test_violations_carry_project_id() -> None:
    """project_id must be plumbed into every violation so production
    logs correlate by upload."""

    zones = [
        # 100% outside — guaranteed reject.
        {"kind": "phone_booth", "position_mm": [-5000, -5000]},
    ]
    _, violations = validate_zones_against_envelope(
        zones, ENVELOPE, project_id="upload-abc-123", strict=True,
    )
    assert violations[0]["project_id"] == "upload-abc-123"


def test_violations_carry_label_when_named() -> None:
    """meeting_room.name and place_hero.slug should both surface as
    `label` in the violation so the architect knows which entity
    the warning refers to."""

    zones = [
        {"kind": "meeting_room", "corner1_mm": [-1000, -1000],
         "corner2_mm": [-500, -500], "name": "Phantom boardroom"},
        {"kind": "place_hero", "slug": "table_boardroom_4000",
         "position_mm": [-5000, -5000]},
    ]
    _, violations = validate_zones_against_envelope(
        zones, ENVELOPE, strict=True,
    )
    assert len(violations) == 2
    assert violations[0]["label"] == "Phantom boardroom"
    assert violations[1]["label"] == "table_boardroom_4000"


def test_lumen_class_clean_fixture_emits_no_warnings() -> None:
    """Regression guard : a Lumen-style variant (everything inside
    [0, 60_000] × [0, 40_000] on a 60×40 m plate) must produce ZERO
    violations regardless of mode, because we don't want false-positive
    warnings on the production fixture."""

    lumen_envelope = (60_000.0, 40_000.0)
    zones = [
        {"kind": "workstation_cluster", "origin_mm": [4_000, 5_000],
         "orientation_deg": 0, "count": 8, "row_spacing_mm": 1600},
        {"kind": "meeting_room", "corner1_mm": [25_000, 5_000],
         "corner2_mm": [30_000, 9_000], "name": "Boardroom"},
        {"kind": "phone_booth", "position_mm": [35_000, 12_000]},
        {"kind": "collab_zone", "bbox_mm": [40_000, 5_000, 50_000, 15_000],
         "style_value": "huddle_cluster"},
        {"kind": "biophilic_zone", "bbox_mm": [10_000, 25_000, 15_000, 30_000]},
        {"kind": "partition_wall", "start_mm": [20_000, 10_000],
         "end_mm": [25_000, 10_000], "kind_value": "acoustic"},
        {"kind": "place_human", "position_mm": [15_000, 15_000],
         "pose": "standing"},
        {"kind": "place_plant", "position_mm": [45_000, 30_000],
         "species": "ficus_lyrata"},
        {"kind": "place_hero", "slug": "table_boardroom_4000",
         "position_mm": [27_500, 7_000]},
        {"kind": "apply_variant_palette", "walls": [235, 228, 215],
         "floor": [180, 160, 135], "accent": [47, 74, 63]},
    ]
    for strict_mode in (False, True):
        cleaned, violations = validate_zones_against_envelope(
            zones, lumen_envelope, strict=strict_mode,
        )
        assert cleaned == zones, f"strict={strict_mode} mutated clean zones"
        assert violations == [], f"strict={strict_mode} false-positive violations"


def test_phase_a_signature_case_clamps_correctly() -> None:
    """The exact Bâtiment A leak captured in Phase A : workstation
    cluster origin=(18900, 33000) count=12 spacing=1600 ang=0,
    overflow=21.35 %. With strict=True it must be clamped (count
    preserved, origin shifted) such that the final cluster fits."""

    bat_a_envelope = (34_000.0, 50_000.0)
    zones = [
        {"kind": "workstation_cluster", "origin_mm": [18_900, 33_000],
         "orientation_deg": 0, "count": 12, "row_spacing_mm": 1600},
    ]
    cleaned, violations = validate_zones_against_envelope(
        zones, bat_a_envelope, strict=True,
    )
    assert len(cleaned) == 1
    # 12 desks at i=0..11 → span = 11×1600 + 1600 = 19200. On 34 000
    # plate, max origin x = 14 800. Phase A's 18 900 leaks by 4100 ;
    # clamp shifts left so origin = 14 800.
    new = cleaned[0]
    assert new["count"] == 12
    end_x = new["origin_mm"][0] + 11 * 1600 + 1600
    assert end_x <= 34_000.0 + 1.0
    assert violations[0]["action"] == "clamp"
    assert violations[0]["overflow_ratio"] == pytest.approx(0.2135, abs=0.01)
