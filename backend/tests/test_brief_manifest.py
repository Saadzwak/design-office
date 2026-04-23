from fastapi.testclient import TestClient

from app.main import app


def test_brief_manifest_lists_mcp_resources() -> None:
    client = TestClient(app)
    response = client.get("/api/brief/manifest")
    assert response.status_code == 200
    payload = response.json()
    assert payload["benchmarks_version"].startswith("2026-04-22")
    # 10 originals + 3 added for Iteration 16 (mood board + client profiles
    # + material finishes).
    assert len(payload["files"]) == 13
    expected = {
        "acoustic-standards.md",
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
