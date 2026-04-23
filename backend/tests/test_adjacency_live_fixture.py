"""Live-run regression for the iter-17 B four-agent pipeline.

`generate_with_adjacency_sample.json` captures a live Opus 4.7 run
of `POST /api/testfit/generate` against the Lumen fixture, AFTER
iter-17 B added the `adjacency_validator` as the 4th Level-2 agent.
This test asserts the full pipeline produced structurally sound
adjacency audits — not just that the `_coerce_adjacency_audit`
helper handles canned JSON.

Failure modes this catches :
- the orchestrator silently dropping `adjacency_resources` from the
  context dict (audit would parse-error and come back as score=0),
- the LLM producing markdown instead of strict JSON (same symptom),
- the model inventing rule_ids outside the catalogue (score inflates
  but references nothing real),
- all three variants scoring 100/100 with zero violations — the
  feature doesn't discriminate and needs a stricter system prompt.
"""

from __future__ import annotations

import json
import re
from pathlib import Path


FIXTURE = (
    Path(__file__).resolve().parent
    / "fixtures"
    / "generate_with_adjacency_sample.json"
)
ADJACENCY_RESOURCE = (
    Path(__file__).resolve().parent.parent
    / "app"
    / "data"
    / "resources"
    / "adjacency-rules.md"
)


def _load() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def _known_rule_ids() -> set[str]:
    text = ADJACENCY_RESOURCE.read_text(encoding="utf-8")
    # Rule ids appear as `rule.section.something` in the headings
    return set(re.findall(r"`([a-z_]+\.[a-z_.]+)`", text))


def test_live_run_yields_adjacency_audit_on_every_variant() -> None:
    data = _load()
    variants = data["variants"]
    assert len(variants) == 3, "expected three variants from the live run"
    for v in variants:
        aud = v.get("adjacency_audit")
        assert aud is not None, f"variant {v['style']} has no adjacency_audit"
        # Score is a proper integer 0..100
        score = aud["score"]
        assert isinstance(score, int)
        assert 0 <= score <= 100
        # Summary is populated (not the parse-error fallback)
        summary = aud.get("summary", "")
        assert summary, f"variant {v['style']} audit has no summary"
        assert "parse error" not in summary.lower()


def test_live_run_scores_discriminate_or_log_why_not() -> None:
    """The three Lumen variants should not all score 100 — if they do,
    the feature doesn't help a real architect. Either the fixture is
    genuinely clean (unlikely for a 2 400 m² plate) or the system
    prompt is too lenient.
    """

    data = _load()
    scores = [v["adjacency_audit"]["score"] for v in data["variants"]]
    # Allow any mix, but at least ONE variant must carry violations.
    total_violations = sum(
        len(v["adjacency_audit"].get("violations", []))
        for v in data["variants"]
    )
    assert total_violations >= 3, (
        f"Expected the live run to surface at least 3 adjacency "
        f"violations across the three variants; got {total_violations}. "
        f"Scores were {scores}."
    )


def test_live_run_violations_cite_real_rule_ids() -> None:
    """Every rule_id on a live violation must exist in the catalogue —
    the LLM must not invent rule ids.
    """

    data = _load()
    known = _known_rule_ids()
    assert len(known) > 20, "rule-id scraper didn't find enough rules"

    seen: set[str] = set()
    for v in data["variants"]:
        for viol in v["adjacency_audit"].get("violations", []):
            rid = viol["rule_id"]
            seen.add(rid)
            assert rid in known, (
                f"LLM cited unknown rule_id {rid!r} on variant {v['style']}"
            )

    # Positive-coverage guard : at least 2 distinct rule families get
    # touched across the three variants. If every variant cites the
    # same one rule, the feature is narrow — that's a signal we'd
    # want to notice.
    families = {rid.split(".")[0] for rid in seen}
    assert len(families) >= 2, (
        f"Live adjacency violations cover only {len(families)} rule "
        f"families ({families!r}). Expected acoustic + flow / privacy / "
        f"zoning / micro coverage."
    )


def test_live_run_severity_fields_are_canonical() -> None:
    data = _load()
    valid = {"info", "minor", "major", "critical"}
    for v in data["variants"]:
        for viol in v["adjacency_audit"].get("violations", []):
            assert viol["severity"] in valid, (
                f"non-canonical severity {viol['severity']!r} on "
                f"variant {v['style']}, rule {viol['rule_id']}"
            )


def test_live_run_descriptions_are_grounded_in_geometry() -> None:
    """Sanity check : at least a handful of descriptions reference
    either a measurement (m, m², mm), a zone label, or an occupant
    count. If every description is vague ("rooms are close together"),
    the audit isn't useful.
    """

    data = _load()
    GROUNDED = re.compile(
        r"\d+\s*(?:m|m²|mm|cm|pax|pax\.|desks?|booths?|rooms?|kPa)",
        re.IGNORECASE,
    )
    grounded_count = 0
    total = 0
    for v in data["variants"]:
        for viol in v["adjacency_audit"].get("violations", []):
            total += 1
            if GROUNDED.search(viol.get("description", "")):
                grounded_count += 1
    assert total >= 3
    assert grounded_count >= total // 2, (
        f"Only {grounded_count}/{total} violation descriptions carry "
        "a concrete geometry / occupant reference. The audit is too "
        "vague to be actionable."
    )
