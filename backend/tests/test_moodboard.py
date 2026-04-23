from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.models import VariantOutput
from app.surfaces.moodboard import (
    ClientInfo,
    _render_moodboard_pdf,
    pdf_path_for,
)


def _sample_selection() -> dict:
    return {
        "header": {
            "tagline": "A quiet courtyard of focus between two bright edges.",
            "industry_note": "Tech-startup bias applied.",
        },
        "atmosphere": {
            "hero_image_theme": "biophilic warm minimal open office",
            "palette": [
                {"name": "Ivory canvas", "hex": "#FAF7F2", "role": "hero"},
                {"name": "Forest deep", "hex": "#2F4A3F", "role": "hero"},
                {"name": "Warm oak", "hex": "#C9B79C", "role": "secondary"},
                {"name": "Graphite", "hex": "#34332F", "role": "secondary"},
                {"name": "Lumen sun", "hex": "#E8C547", "role": "accent"},
            ],
        },
        "materials": [
            {
                "category": "floor",
                "name": "Amtico Signature Worn Oak",
                "brand": "Amtico",
                "product_ref": "AR0W7490",
                "application": "Open-plan desks",
                "sustainability": "Low VOC, 25-year wear",
                "swatch_hex": "#B08E5A",
            },
            {
                "category": "wall",
                "name": "Kvadrat Soft Cells Remix 3",
                "brand": "Kvadrat",
                "product_ref": "Remix 3 / 133",
                "application": "Town-hall acoustic wall",
                "sustainability": "Cradle-to-Cradle Silver",
                "swatch_hex": "#8C8F80",
            },
            {
                "category": "ceiling",
                "name": "Ecophon Solo Islands",
                "brand": "Ecophon",
                "product_ref": "Solo Square",
                "application": "Collab heart islands",
                "sustainability": "NRC 0.95",
                "swatch_hex": "#ECEBE4",
            },
            {
                "category": "textile",
                "name": "Kvadrat Steelcut Trio 3",
                "brand": "Kvadrat",
                "product_ref": "Steelcut Trio 3 / 966",
                "application": "Task chair upholstery",
                "sustainability": "Wool, EU Ecolabel",
                "swatch_hex": "#4A5D55",
            },
        ],
        "furniture": [
            {
                "category": "task chair",
                "product_id": "vitra_id_chair",
                "brand": "Vitra",
                "model": "ID Chair Concept",
                "application": "Workstation clusters",
                "dimensions_mm": {"w": 650, "d": 640, "h": 920},
            },
            {
                "category": "phone booth",
                "product_id": "framery_one_compact",
                "brand": "Framery",
                "model": "One Compact",
                "application": "Neighbourhood junctions",
                "dimensions_mm": {"w": 915, "d": 915, "h": 2200},
            },
        ],
        "planting": {
            "strategy": "South façade = Monstera; north courtyard = ZZ + Kentia.",
            "species": [
                {"name": "Monstera deliciosa", "light": "bright indirect", "care": "medium"},
                {"name": "ZZ plant", "light": "low", "care": "easy"},
                {"name": "Kentia palm", "light": "medium", "care": "easy"},
            ],
        },
        "light": {
            "strategy": "3000 K lounge, 3500 K collab, 4000 K desks.",
            "fixtures": [
                {
                    "category": "pendant",
                    "brand": "Muuto",
                    "model": "Ambit Rail",
                    "application": "Town hall",
                },
                {
                    "category": "task",
                    "brand": "Artemide",
                    "model": "Tolomeo LED",
                    "application": "Workstations",
                },
            ],
        },
        "notes": ["Industry bias applied: tech_startup"],
    }


def _sample_variant() -> VariantOutput:
    # Pull the atelier variant from the saved Lumen fixture so we have a
    # realistic object.
    fixture = (
        Path(__file__).resolve().parent
        / "fixtures"
        / "generate_output_sample.json"
    )
    data = json.loads(fixture.read_text(encoding="utf-8"))
    variant_payload = next(v for v in data["variants"] if v["style"] == "atelier")
    return VariantOutput.model_validate(variant_payload)


def test_moodboard_pdf_round_trip(tmp_path: Path) -> None:
    """The renderer writes a real PDF on disk and `pdf_path_for` finds it."""
    client = ClientInfo(
        name="Lumen",
        industry="tech_startup",
        tagline="A quiet co-architect for office interiors.",
    )
    variant = _sample_variant()
    pdf_id = _render_moodboard_pdf(
        client=client,
        variant=variant,
        selection=_sample_selection(),
        project_reference="LUMEN-MB",
    )
    path = pdf_path_for(pdf_id)
    assert path is not None
    assert path.exists()
    assert path.stat().st_size > 2_000  # real PDF, not a stub
    # PDF header sanity check.
    with path.open("rb") as fh:
        assert fh.read(5) == b"%PDF-"


def test_moodboard_pdf_endpoint_404_on_missing() -> None:
    client = TestClient(app)
    response = client.get("/api/moodboard/pdf/doesnotexist123")
    assert response.status_code == 404


def test_moodboard_pdf_endpoint_streams_existing_file() -> None:
    # First render a PDF so we have something to retrieve.
    client_info = ClientInfo(name="Lumen", industry="tech_startup")
    variant = _sample_variant()
    pdf_id = _render_moodboard_pdf(
        client=client_info,
        variant=variant,
        selection=_sample_selection(),
        project_reference=None,
    )
    client = TestClient(app)
    response = client.get(f"/api/moodboard/pdf/{pdf_id}")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert int(response.headers["content-length"]) > 2_000
