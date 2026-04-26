"""Tests for the iter-33 follow-up — HTML→PDF magazine deck."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.models import VariantMetrics, VariantOutput, VariantStyle
from app.surfaces.justify_html_pdf import (
    PDF_OUT_DIR,
    _build_template_context,
    _format_caption_items,
    _parse_bullets,
    _parse_programme,
    _resolve_to_disk,
    _split_argumentaire,
    _split_lede,
    _to_data_url,
    pdf_path_for,
)


def _mini_variant() -> VariantOutput:
    return VariantOutput(
        style=VariantStyle.ATELIER,
        title="L'Atelier Nord",
        narrative="—",
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


# ---------------------------------------------------------------------------
# URL → disk path resolver
# ---------------------------------------------------------------------------


def test_resolve_to_disk_returns_none_for_empty() -> None:
    assert _resolve_to_disk(None) is None
    assert _resolve_to_disk("") is None


def test_resolve_to_disk_passes_through_existing_path(tmp_path: Path) -> None:
    f = tmp_path / "x.png"
    f.write_bytes(b"\x89PNG\r\n\x1a\n")
    assert _resolve_to_disk(str(f)) == f


def test_resolve_to_disk_translates_nanobanana_url() -> None:
    from app.surfaces.zone_overlay import OUT_DIR as GEN_DIR

    GEN_DIR.mkdir(parents=True, exist_ok=True)
    fake_id = "deadbeef33htmlpdfresolverunit01"
    target = GEN_DIR / f"{fake_id}.png"
    try:
        target.write_bytes(b"\x89PNG\r\n\x1a\n")
        assert _resolve_to_disk(f"/api/generated-images/{fake_id}") == target
    finally:
        target.unlink(missing_ok=True)


def test_resolve_to_disk_handles_query_string() -> None:
    from app.surfaces.zone_overlay import OUT_DIR as GEN_DIR

    GEN_DIR.mkdir(parents=True, exist_ok=True)
    fake_id = "cafebabe33htmlpdfresolverunit02"
    target = GEN_DIR / f"{fake_id}.png"
    try:
        target.write_bytes(b"\x89PNG\r\n\x1a\n")
        assert _resolve_to_disk(f"/api/generated-images/{fake_id}?v=42") == target
    finally:
        target.unlink(missing_ok=True)


def test_to_data_url_handles_png(tmp_path: Path) -> None:
    f = tmp_path / "tiny.png"
    f.write_bytes(b"\x89PNG\r\n\x1a\n")
    url = _to_data_url(f)
    assert url is not None
    assert url.startswith("data:image/png;base64,")


def test_to_data_url_returns_none_when_path_missing() -> None:
    assert _to_data_url(None) is None
    assert _to_data_url(Path("/path/does/not/exist.png")) is None


# ---------------------------------------------------------------------------
# Markdown helpers
# ---------------------------------------------------------------------------


SAMPLE_ARG = """## 1. The bet

Lumen is a fintech that bets on focus. The atelier nord lights the postes
day-long while parking the social spine in the south sun.

## 2. Research

Acoustic compliance, biophilic patterns, flex ratios.

## 5. KPIs

- Leesman Lmi cible ≥ 70 (Excellent)
- Acoustic compliance Performant on 100 % des postes
- EUI ≤ 110 kWh/m²/an

## 6. Next steps

1. Confirm FTE split per team.
2. Engage bureau de contrôle.
3. Launch detailed test-fit.
"""


def test_split_argumentaire_pulls_numbered_sections() -> None:
    out = _split_argumentaire(SAMPLE_ARG)
    assert set(out.keys()) == {"1", "2", "5", "6"}
    assert "fintech that bets" in out["1"]
    assert "Leesman Lmi" in out["5"]


def test_split_lede_pulls_first_sentence_when_paragraph_is_long() -> None:
    """Long first paragraphs split at the first sentence break > 40 chars."""

    long_first = (
        "Lumen is a fintech that bets on focus and ritual at all times. "
        "The atelier nord lights the postes day-long. A second sentence."
    )
    lede, body = _split_lede(f"{long_first}\n\nA second paragraph.")
    assert lede == "Lumen is a fintech that bets on focus and ritual at all times."
    # Remainder of paragraph + second paragraph stay in the body.
    assert any("atelier nord" in p for p in body)
    assert any("second paragraph" in p for p in body)


def test_split_lede_keeps_short_first_paragraph_whole() -> None:
    """Short first paragraphs (< 40-char sentence break) stay whole as the
    lede — better editorial than truncating mid-thought."""

    short_first = "Lumen is a fintech. Many lines below."
    lede, body = _split_lede(f"{short_first}\n\nSecond paragraph.")
    assert lede == short_first
    assert any("second paragraph" in p.lower() for p in body)


def test_split_lede_handles_empty_input() -> None:
    assert _split_lede("") == ("", [])


def test_parse_bullets_falls_back_to_default() -> None:
    out = _parse_bullets("", default=["A", "B"])
    assert out == ["A", "B"]


def test_parse_bullets_picks_dashes_and_numbers() -> None:
    text = "- alpha\n* beta\n1. gamma\n2. delta"
    out = _parse_bullets(text, default=[])
    assert out == ["alpha", "beta", "gamma", "delta"]


def test_parse_programme_extracts_label_value_detail() -> None:
    md = """## 1. Postes
130 postes individuels en façade nord.
## 2. Réunions
18 salles dont 4 grandes."""
    out = _parse_programme(md)
    assert len(out) == 2
    assert out[0]["label"] == "Postes"
    assert "130" in out[0]["value"]
    assert "18" in out[1]["value"]


def test_parse_programme_falls_back_when_empty() -> None:
    out = _parse_programme("")
    assert len(out) == 6  # default 6 placeholders
    assert all("label" in i for i in out)


def test_format_caption_items_skips_empty() -> None:
    items = [
        {"material": "European oak", "finish": "oiled"},
        {"name": "Series 1", "brand": "Steelcase"},
        {},  # empty
    ]
    out = _format_caption_items(items, keys=("material", "name", "finish", "brand"))
    assert len(out) == 2
    assert out[0]["primary"] == "European oak"
    assert out[1]["primary"] == "Series 1"


# ---------------------------------------------------------------------------
# Template context
# ---------------------------------------------------------------------------


def test_build_template_context_minimum_inputs() -> None:
    ctx = _build_template_context(
        client_name="Lumen",
        variant=_mini_variant(),
        argumentaire_markdown=SAMPLE_ARG,
        project_reference=None,
        sketchup_iso_path=None,
        tagline=None,
        palette_hexes=None,
        programme_markdown=None,
        other_variants=None,
        sketchup_iso_by_style=None,
        gallery_tile_paths=None,
        materials=None,
        furniture=None,
    )
    # Cover + meta
    assert ctx["client_name"] == "Lumen"
    assert ctx["variant_title"] == "L'Atelier Nord"
    assert ctx["workstation_count"] == 130
    assert ctx["total_m2"] == 2050
    # Brief
    assert ctx["brief_lede"]
    # Programme — 6 default cards when no markdown supplied.
    assert len(ctx["programme_items"]) == 6
    # Evidence — 6 hardcoded cards.
    assert len(ctx["evidence"]) == 6
    # New iter-33-follow-up sections
    assert ctx["about_summary"]
    assert len(ctx["about_cells"]) >= 4
    assert len(ctx["compare_criteria"]) == 5
    assert len(ctx["kpi_dials"]) == 4
    assert len(ctx["milestones"]) == 8
    # Variant overview always exists, even with no other variants.
    assert len(ctx["variants_overview"]) >= 1
    assert ctx["variants_overview"][0]["retained"] is True


def test_build_template_context_dedupes_retained_in_variant_pages() -> None:
    """A duplicate-style explored variant must not occupy a slot."""

    retained = _mini_variant()
    others = [
        VariantOutput(
            style=VariantStyle.ATELIER,  # dup of retained — must be dropped
            title="dup",
            narrative="—",
            metrics=retained.metrics,
        ),
        VariantOutput(
            style=VariantStyle.VILLAGEOIS,
            title="Quartier Sud",
            narrative="—",
            metrics=retained.metrics,
        ),
    ]
    ctx = _build_template_context(
        client_name="L",
        variant=retained,
        argumentaire_markdown="",
        project_reference=None,
        sketchup_iso_path=None,
        tagline=None,
        palette_hexes=None,
        programme_markdown=None,
        other_variants=others,
        sketchup_iso_by_style=None,
        gallery_tile_paths=None,
        materials=None,
        furniture=None,
    )
    overview_titles = [v["title"] for v in ctx["variants_overview"]]
    page_titles = [v["title"] for v in ctx["variant_pages"]]
    # Both arrays should have the retained + Quartier Sud, no "dup".
    assert "dup" not in overview_titles
    assert "dup" not in page_titles
    assert "Quartier Sud" in overview_titles
    assert ctx["variants_overview"][0]["retained"] is True
    # Compare criteria scored across both real variants.
    for crit in ctx["compare_criteria"]:
        assert len(crit["bars"]) == 2
        # Exactly one bar marked retained per criterion.
        assert sum(1 for b in crit["bars"] if b["retained"]) == 1


def test_build_template_context_drops_sketchup_inputs() -> None:
    """SketchUp iso URLs must NOT make it into the template context.

    Iter-33 follow-up — Saad explicitly asked us to remove SketchUp
    renders from the client deck. They should be silently ignored
    even when the caller passes them (API parity with the PPTX).
    """

    sketchup_iso = "/api/testfit/screenshot/atelier_iso_ne.png"
    ctx = _build_template_context(
        client_name="Lumen",
        variant=_mini_variant(),
        argumentaire_markdown="",
        project_reference=None,
        sketchup_iso_path=sketchup_iso,
        tagline=None,
        palette_hexes=None,
        programme_markdown=None,
        other_variants=None,
        sketchup_iso_by_style={"atelier": sketchup_iso},
        gallery_tile_paths=None,
        materials=None,
        furniture=None,
    )
    # Verify no /api/testfit/screenshot/ URL leaks into any image slot.
    for key in (
        "cover_image",
        "retained_image",
        "atmosphere_image",
        "biophilic_image",
        "materials_image",
        "furniture_image",
        "brief_image",
    ):
        val = ctx.get(key)
        if val is not None:
            assert "testfit/screenshot" not in val
    for page in ctx["variant_pages"]:
        if page.get("image"):
            assert "testfit/screenshot" not in page["image"]


# ---------------------------------------------------------------------------
# pdf_path_for
# ---------------------------------------------------------------------------


def test_pdf_path_for_unknown_returns_none() -> None:
    assert pdf_path_for("does_not_exist") is None


# ---------------------------------------------------------------------------
# End-to-end render — gated on a Chromium binary being present.
# ---------------------------------------------------------------------------


def _has_chrome() -> bool:
    from app.surfaces.justify_html_pdf import _CHROME_CANDIDATES

    return any(p.exists() for p in _CHROME_CANDIDATES)


@pytest.mark.skipif(
    not _has_chrome(),
    reason="Chromium binary not installed — magazine PDF render needs Chrome / Edge.",
)
def test_render_magazine_pdf_writes_a_real_pdf() -> None:
    from app.surfaces.justify_html_pdf import render_magazine_pdf

    build = render_magazine_pdf(
        client_name="Lumen",
        variant=_mini_variant(),
        argumentaire_markdown=SAMPLE_ARG,
        project_reference="LUMEN-TEST",
    )
    assert build.path.exists()
    # A real chromium-printed PDF is at least ~50 KB even with no images.
    assert build.bytes > 30_000
    # Output looks like a PDF.
    head = build.path.read_bytes()[:5]
    assert head == b"%PDF-"


def test_out_dir_created() -> None:
    assert PDF_OUT_DIR.exists()
