"""Unit tests for the iter-17 B adjacency-validator plumbing.

Covers the coercion helper that sits between the LLM's JSON and the
Pydantic `AdjacencyAudit` model, plus structural assertions on the
`design://adjacency-rules` resource itself — we want any accidental
deletion of a rule the validator's system prompt references to fail
CI immediately rather than silently slip into production.
"""

from __future__ import annotations

from pathlib import Path

from app.models import AdjacencyAudit, AdjacencyViolation
from app.surfaces.testfit import _coerce_adjacency_audit


RESOURCES = Path(__file__).resolve().parent.parent / "app" / "data" / "resources"


def test_adjacency_resource_exists_and_cites_all_rule_families() -> None:
    path = RESOURCES / "adjacency-rules.md"
    assert path.exists(), "design://adjacency-rules resource is missing"
    text = path.read_text(encoding="utf-8")
    # Each rule family gets at least one rule. If we drop a family, the
    # adjacency_validator system prompt will start producing broken
    # rule_ids; fail loudly here.
    for rule_id in [
        "acoustic.open_desks_next_to_boardroom",
        "flow.toilets_not_adjacent_to_brainstorm",
        "privacy.hr_office_not_on_public_corridor",
        "daylight.focus_rooms_off_facade",
        "erp.egress_path_not_blocked",
        "zoning.calm_energy_gradient",
        "micro.desk_cluster_face_to_face_acoustic",
        "wellness.mothers_room_proximity_to_wc",
    ]:
        assert f"`{rule_id}`" in text, f"rule_id {rule_id} missing from the resource"

    # Citations section is mandatory — the validator is instructed to
    # copy sources verbatim from it.
    assert "## 10. Citations" in text
    # A few key sources must remain discoverable
    for citation in ["Hongisto", "Banbury", "WELL", "BREEAM", "Leesman"]:
        assert citation in text


def test_coerce_adjacency_audit_happy_path() -> None:
    raw = {
        "score": 74,
        "summary": "Open-plan desks share a wall with the boardroom.",
        "violations": [
            {
                "rule_id": "acoustic.open_desks_next_to_boardroom",
                "severity": "major",
                "zones": ["open_desks_north", "boardroom_main"],
                "description": "12 desks share a wall with the 16-pax boardroom.",
                "suggestion": "Insert a storage wall between the two zones.",
                "source": "WELL v2 Feature S02",
            }
        ],
        "recommendations": [
            "Shift the HR office behind the finance cluster.",
        ],
    }
    audit = _coerce_adjacency_audit(raw)
    assert isinstance(audit, AdjacencyAudit)
    assert audit.score == 74
    assert len(audit.violations) == 1
    v = audit.violations[0]
    assert isinstance(v, AdjacencyViolation)
    assert v.severity == "major"
    assert v.zones == ["open_desks_north", "boardroom_main"]
    assert audit.recommendations == ["Shift the HR office behind the finance cluster."]


def test_coerce_adjacency_audit_clamps_and_defaults() -> None:
    # Score overflow + bad severity + string score + extra keys.
    raw = {
        "score": "180",
        "summary": "",
        "violations": [
            {
                "rule_id": "flow.toilets_not_adjacent_to_brainstorm",
                "severity": "catastrophic",  # invalid → falls back to minor
                "zones": ["wc_core_north", "war_room"],
                "description": "WC block shares a wall with the war room.",
                "suggestion": "Rotate the war room south by one bay.",
                "source": "Leesman Index 2022",
            }
        ],
        "recommendations": ["r1", "r2", "r3", "r4"],  # cap at 3
    }
    audit = _coerce_adjacency_audit(raw)
    assert audit.score == 100  # clamped high
    assert audit.violations[0].severity == "minor"
    assert len(audit.recommendations) == 3  # capped


def test_coerce_adjacency_audit_caps_violations_at_ten() -> None:
    raw = {
        "score": 20,
        "violations": [
            {
                "rule_id": f"rule.fake.{i}",
                "severity": "minor",
                "zones": ["a", "b"],
                "description": "x",
                "suggestion": "y",
                "source": "z",
            }
            for i in range(20)
        ],
    }
    audit = _coerce_adjacency_audit(raw)
    assert len(audit.violations) == 10


def test_coerce_adjacency_audit_handles_garbage() -> None:
    # Missing fields, wrong types, None values — must not raise.
    raw = {
        "score": None,
        "summary": None,
        "violations": [None, "not-a-dict", {"severity": "minor"}],
        "recommendations": None,
    }
    audit = _coerce_adjacency_audit(raw)
    assert audit.score == 0
    # Two of the three violation entries are invalid; only the dict one
    # survives, with defaulted rule_id / description.
    assert len(audit.violations) == 1
    assert audit.violations[0].rule_id == "unknown"
