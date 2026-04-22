from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.models import VariantMetrics, VariantOutput, VariantStyle
from app.surfaces.justify_pptx import (
    PPTX_OUT_DIR,
    _condense,
    _split_argumentaire,
    pptx_path_for,
    render_pitch_deck,
)


def _mini_variant() -> VariantOutput:
    return VariantOutput(
        style=VariantStyle.ATELIER,
        title="L'Atelier Nord — Test",
        narrative="Test.",
        metrics=VariantMetrics(
            workstation_count=130,
            meeting_room_count=18,
            phone_booth_count=14,
            collab_surface_m2=420,
            amenity_surface_m2=300,
            circulation_m2=380,
            total_programmed_m2=2050,
            flex_ratio_applied=0.75,
            notes=[],
        ),
    )


ARGUMENTAIRE = """# Lumen — Pourquoi cette variante

## 1. Le pari

La variante atelier nord fait un pari simple : rendre au bureau ce que le
domicile ne peut pas donner.

## 2. Ce que dit la recherche

### Acoustique & confort sonore

NF S 31-080 niveau Performant, D2,S ≥ 7 dB, rD ≤ 5 m. Hongisto 2005 montre
qu'au-delà de STI 0.21 la performance se dégrade.

### Biophilie & neuroarchitecture

Browning 14 patterns, Nieuwenhuis 2014 : **+15 %** de productivité avec les
plantes.

## 3. Ce que dit la réglementation

ERP type W catégorie 4, effectif < 300. Ascenseur PMR obligatoire.

## 4. Arbitrages et incertitudes

- Seuils CO exacts [À VÉRIFIER]
- Escalier central : dispense à négocier

## 5. Résultats attendus, 6 et 12 mois

- Leesman Lmi cible ≥ 70 (Excellent)
- % seats window sight-line ≥ 90 %

## 6. Prochaines étapes

1. Confirmer la répartition FTE par équipe
2. Engager le bureau de contrôle
3. Lancer le test-fit détaillé

## 7. Sources

- design://acoustic-standards
- design://flex-ratios
"""


def test_split_argumentaire_captures_sections() -> None:
    sections = _split_argumentaire(ARGUMENTAIRE)
    assert set(sections.keys()) == {"1", "2", "3", "4", "5", "6", "7"}
    assert "pari simple" in sections["1"]
    assert "catégorie 4" in sections["3"]


def test_condense_trims_and_strips_markdown() -> None:
    out = _condense("**bold** and *italic* `code`\n- item", max_chars=80)
    assert "**" not in out
    assert "•" in out


def test_render_pitch_deck_writes_six_slides() -> None:
    build = render_pitch_deck(
        client_name="Lumen",
        variant=_mini_variant(),
        argumentaire_markdown=ARGUMENTAIRE,
        project_reference="LUMEN-TEST",
    )
    assert build.path.exists()
    assert build.bytes > 10_000  # a real PPTX is at least ~20 KB
    assert build.slide_count == 6
    # Validate it can be reopened.
    from pptx import Presentation

    prs = Presentation(str(build.path))
    assert len(prs.slides) == 6
    # 13.333 in × 914400 EMU/in, rounded; allow small tolerance.
    assert 12_180_000 < prs.slide_width < 12_200_000
    # 7.5 in × 914400 = 6 858 000 EMU exactly.
    assert prs.slide_height == 6_858_000


def test_pptx_endpoint_returns_404_for_missing_id() -> None:
    client = TestClient(app)
    response = client.get("/api/justify/pptx/unknown_id_xyz")
    assert response.status_code == 404


def test_pptx_endpoint_streams_existing_file() -> None:
    build = render_pitch_deck(
        client_name="Lumen",
        variant=_mini_variant(),
        argumentaire_markdown=ARGUMENTAIRE,
    )
    assert pptx_path_for(build.pptx_id) is not None
    client = TestClient(app)
    response = client.get(f"/api/justify/pptx/{build.pptx_id}")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    )
    assert len(response.content) == build.bytes


def test_out_dir_created() -> None:
    assert PPTX_OUT_DIR.exists()
