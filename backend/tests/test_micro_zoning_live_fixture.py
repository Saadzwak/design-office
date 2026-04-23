"""Live-fixture regression for the iter-18i structured micro-zoning.

`microzoning_atelier_structured.json` captures a live Opus 4.7 run
of `POST /api/testfit/microzoning/structured` against the Lumen
atelier variant. This test asserts the pipeline produced structurally
sound zones — not just that the coercion helpers handle canned JSON.

Catches : icon name drift (the validator rejects unknown aliases),
surface-area sanity, at-least-one of each family (work / collab /
support / hospitality), contiguous numbering, roundtrip-through-
Pydantic integrity.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.models import StructuredMicroZoningResponse

FIXTURE = (
    Path(__file__).resolve().parent
    / "fixtures"
    / "microzoning_atelier_structured.json"
)


def _load() -> StructuredMicroZoningResponse:
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    return StructuredMicroZoningResponse.model_validate(data)


def test_fixture_parses_through_pydantic_cleanly() -> None:
    resp = _load()
    assert resp.variant_style == "atelier"
    assert 10 <= len(resp.zones) <= 14


def test_zone_numbering_is_contiguous() -> None:
    resp = _load()
    ns = [z.n for z in resp.zones]
    assert ns == list(range(1, len(ns) + 1))


def test_icons_are_within_the_whitelist() -> None:
    from app.models import ZONE_ICON_ALIASES

    resp = _load()
    for z in resp.zones:
        assert z.icon in ZONE_ICON_ALIASES, (
            f"Zone {z.n} ({z.name}) has non-whitelisted icon {z.icon}"
        )


def test_statuses_are_canonical() -> None:
    resp = _load()
    for z in resp.zones:
        assert z.status in {"ok", "warn", "error"}


def test_surfaces_are_sane() -> None:
    resp = _load()
    for z in resp.zones:
        assert 0 < z.surface_m2 < 1000, (
            f"Zone {z.n} has implausible surface {z.surface_m2}"
        )


def test_every_zone_has_narrative_or_at_least_one_material() -> None:
    """No-content zones would leave the drawer empty — reject."""

    resp = _load()
    for z in resp.zones:
        assert z.narrative or z.materials or z.furniture, (
            f"Zone {z.n} has nothing to render"
        )


def test_furniture_cites_real_brands() -> None:
    """At least half the zones reference a furniture brand — if every
    entry has a blank brand, the agent is generating placeholders.
    """

    resp = _load()
    zones_with_brand = sum(
        1 for z in resp.zones if any(f.brand for f in z.furniture)
    )
    assert zones_with_brand >= max(1, len(resp.zones) // 2), (
        f"Only {zones_with_brand}/{len(resp.zones)} zones cite a brand."
    )


def test_at_least_one_zone_per_key_family() -> None:
    """Sanity : the 14-zone drill-down must cover open work, a collab
    slot, a hospitality slot, and a support slot. If the agent
    dropped one of these whole families, the brief wasn't honoured.
    """

    resp = _load()
    icons = {z.icon for z in resp.zones}
    # Open work
    assert "layout-grid" in icons, "Missing open-work zone"
    # Some collab variant (boardroom / users / mic / presentation)
    assert icons & {"presentation", "users", "mic"}, "Missing collab zone"
    # Hospitality
    assert icons & {"coffee", "sun", "armchair"}, "Missing hospitality zone"
    # Support (phone / archive / file-text)
    assert icons & {"phone", "archive", "file-text"}, "Missing support zone"


def test_acoustic_targets_exist_when_expected() -> None:
    """Boardrooms, phone booths and focus rooms should carry an
    acoustic target. If the LLM stopped emitting them, we want to
    notice.
    """

    resp = _load()
    expected_icons = {"presentation", "phone", "mic"}
    zones_with_expected_icon = [
        z for z in resp.zones if z.icon in expected_icons
    ]
    if zones_with_expected_icon:
        zones_with_acoustic = [
            z for z in zones_with_expected_icon if z.acoustic is not None
        ]
        assert len(zones_with_acoustic) >= 1, (
            f"No acoustic target on any of the {len(zones_with_expected_icon)} "
            "collab/quiet zones."
        )


def test_markdown_summary_survives() -> None:
    resp = _load()
    # 150-400 words per the system prompt. Tolerant lower bound.
    wc = len(resp.markdown.split())
    assert wc >= 50, f"Markdown summary is only {wc} words."
