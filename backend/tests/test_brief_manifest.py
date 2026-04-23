from fastapi.testclient import TestClient

from app.main import app


def test_brief_manifest_lists_mcp_resources() -> None:
    client = TestClient(app)
    response = client.get("/api/brief/manifest")
    assert response.status_code == 200
    payload = response.json()
    assert payload["benchmarks_version"].startswith("2026-04-22")
    # 10 originals + 3 added for Iteration 16 (mood board + client profiles
    # + material finishes) + 1 added for Iteration 17 (adjacency rules).
    assert len(payload["files"]) == 14
    expected = {
        "acoustic-standards.md",
        "adjacency-rules.md",
        "biophilic-office.md",
        "client-profiles.md",
        "collaboration-spaces.md",
        "erp-safety.md",
        "ergonomic-workstation.md",
        "flex-ratios.md",
        "furniture-brands.md",
        "material-finishes.md",
        "mood-board-method.md",
        "neuroarchitecture.md",
        "office-programming.md",
        "pmr-requirements.md",
    }
    assert set(payload["files"]) == expected


def test_brief_synthesize_rejects_short_brief() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/brief/synthesize",
        json={"brief": "too short"},
    )
    assert response.status_code == 422


def test_live_altamont_brief_is_industry_adapted() -> None:
    """The `altamont_brief_output.json` fixture captures a live Opus 4.7
    Brief synthesis for a London law firm (Altamont & Rees). This test
    asserts that the consolidator actually adapted the programme to the
    legal context rather than producing a generic office programme —
    the same orchestration code that produced Lumen's 0.75 flex and
    open-plan café must produce a law-firm programme with near-1.0
    flex, private partner offices, and a library / wine-cellar trail.
    """

    import json
    from pathlib import Path

    fx = Path(__file__).resolve().parent / "fixtures" / "altamont_brief_output.json"
    data = json.loads(fx.read_text(encoding="utf-8"))

    prog = data["programme"]
    low = prog.lower()

    # Identity correctly preserved
    assert "altamont" in low

    # Industry-specific programme signals — any two of these alone would
    # be suspicious; together they prove the synthesis actually reads as
    # a legal programme rather than a tech one.
    assert "private partner office" in low
    assert "library" in low
    assert "wine cellar" in low or "cellar" in low
    assert "deposition" in low
    assert "tasting kitchen" in low or "private dining" in low

    # Ratio adapted: legal briefs run near 1.0 seats/FTE, not tech's
    # 0.70-0.80. Ensure the programme explicitly documents the higher
    # ratio and justifies it (not just copies Lumen's 0.75).
    assert "1.0 seats" in prog or "1.0 seat" in prog or "ratio ≈ 1" in prog or "near-full-onsite" in low

    # The four-agent trace must all be present
    names = {t["name"] for t in data["trace"]}
    assert {"Effectifs", "Benchmarks", "Contraintes", "Consolidator"} <= names

    # Sanity on token budget — this was a ~90k-in / ~16k-out run
    assert data["tokens"]["input"] > 50_000
    assert data["tokens"]["output"] > 8_000
