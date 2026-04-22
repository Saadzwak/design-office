import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.surfaces.justify import _markdown_blocks, _render_client_pdf, pdf_path_for
from app.models import VariantMetrics, VariantOutput, VariantStyle


def test_markdown_blocks_parses_structure() -> None:
    md = """# Title

## Section A

Paragraph line one
continues line two.

### Sub A

- first bullet
- second bullet

---

Paragraph in next block."""
    blocks = _markdown_blocks(md)
    kinds = [b[0] for b in blocks]
    assert kinds == ["h1", "h2", "p", "h3", "bullet", "bullet", "rule", "p"]


def test_render_client_pdf_writes_file() -> None:
    variant = VariantOutput(
        style=VariantStyle.ATELIER,
        title="L'Atelier — test",
        narrative="Test narrative.",
        metrics=VariantMetrics(
            workstation_count=130,
            meeting_room_count=18,
            phone_booth_count=14,
            collab_surface_m2=420,
            amenity_surface_m2=290,
            circulation_m2=380,
            total_programmed_m2=2050,
            flex_ratio_applied=0.75,
            notes=["ok"],
        ),
    )
    pdf_id = _render_client_pdf(
        client_name="Lumen",
        variant=variant,
        argumentaire_markdown=(
            "# Lumen — Pourquoi cette variante\n\n"
            "## 1. Le pari\n\n"
            "Une phrase.\n\n"
            "- point A\n"
            "- point B\n\n"
            "## Sources\n\n"
            "- [Leesman Index](https://leesmanindex.com/)\n"
        ),
    )
    path = pdf_path_for(pdf_id)
    assert path is not None
    assert path.exists()
    assert path.stat().st_size > 500


def test_justify_pdf_endpoint_404(tmp_path: Path) -> None:
    client = TestClient(app)
    response = client.get("/api/justify/pdf/does_not_exist_xyz")
    assert response.status_code == 404


def test_sample_justify_fixture_has_expected_shape() -> None:
    fixture = Path(__file__).parent / "fixtures" / "justify_output_sample.json"
    if not fixture.exists():
        # Fixture is only produced by scripts/run_lumen_justify.py — skip silently.
        return
    data = json.loads(fixture.read_text(encoding="utf-8"))
    assert "argumentaire" in data
    assert "sub_outputs" in data
    assert any(s["name"] == "Consolidator" for s in data["sub_outputs"])
    names = {s["name"] for s in data["sub_outputs"]}
    assert {"Acoustic", "Biophilic", "Regulatory", "Programming", "Consolidator"}.issubset(names)
