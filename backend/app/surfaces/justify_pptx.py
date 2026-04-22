"""Client-pitch PowerPoint renderer for the Justify argumentaire.

Complements `_render_client_pdf` in `justify.py`: same sourced content,
different format. The PPTX is 16:9, 6 slides in the Design Office palette,
safe to hand to a client meeting or a steering committee.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.util import Inches, Pt

from app.models import VariantOutput
from app.surfaces.justify import OUT_DIR as PDF_OUT_DIR  # reuse dir layout

PPTX_OUT_DIR = Path(__file__).resolve().parent.parent / "out" / "justify_pptx"

# Design Office palette (mirrors Section 11 of CLAUDE.md).
INK = RGBColor(0x0E, 0x0E, 0x0C)
INK_SOFT = RGBColor(0x18, 0x18, 0x16)
BONE = RGBColor(0xFA, 0xF9, 0xF5)
BONE_TEXT = RGBColor(0xEC, 0xEB, 0xE4)
TERRACOTTA = RGBColor(0xC9, 0x69, 0x4E)
OCHRE = RGBColor(0xA6, 0x8A, 0x5B)
NEUTRAL_400 = RGBColor(0x75, 0x71, 0x6A)
NEUTRAL_300 = RGBColor(0xA7, 0xA3, 0x98)


@dataclass(frozen=True)
class PptxBuild:
    pptx_id: str
    path: Path
    slide_count: int
    bytes: int


def render_pitch_deck(
    *,
    client_name: str,
    variant: VariantOutput,
    argumentaire_markdown: str,
    project_reference: str | None = None,
) -> PptxBuild:
    """Render the 6-slide pitch deck. Returns a `PptxBuild` summary with the
    id + on-disk path.
    """

    PPTX_OUT_DIR.mkdir(parents=True, exist_ok=True)
    pptx_id = hashlib.sha1(
        f"pptx:{client_name}:{variant.style.value}:{argumentaire_markdown[:400]}".encode("utf-8")
    ).hexdigest()[:16]
    target = PPTX_OUT_DIR / f"{pptx_id}.pptx"

    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    sections = _split_argumentaire(argumentaire_markdown)

    _build_cover_slide(prs, client_name=client_name, variant=variant)
    _build_bet_slide(prs, client_name=client_name, section=sections.get("1", ""))
    _build_metrics_slide(prs, variant=variant)
    _build_research_slide(prs, sections=sections)
    _build_regulatory_slide(prs, sections=sections)
    _build_next_steps_slide(prs, sections=sections, project_reference=project_reference)

    prs.save(str(target))
    size = target.stat().st_size

    return PptxBuild(
        pptx_id=pptx_id,
        path=target,
        slide_count=len(prs.slides),
        bytes=size,
    )


# ---------------------------------------------------------------------------
# Slide builders
# ---------------------------------------------------------------------------


def _blank_slide(prs: Presentation) -> tuple:
    layout = prs.slide_layouts[6]  # blank
    slide = prs.slides.add_slide(layout)
    # Paint the background ink.
    _add_background(slide, INK, prs.slide_width, prs.slide_height)
    return slide, prs.slide_width, prs.slide_height


def _add_background(slide, fill: RGBColor, w, h) -> None:
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, w, h)
    shape.line.fill.background()
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill


def _add_text(
    slide,
    left: float,
    top: float,
    width: float,
    height: float,
    text: str,
    *,
    font: str = "Inter",
    size: int = 14,
    color: RGBColor = BONE_TEXT,
    bold: bool = False,
    italic: bool = False,
    letter_spacing: int | None = None,
) -> None:
    box = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    tf = box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = text
    run.font.name = font
    run.font.size = Pt(size)
    run.font.color.rgb = color
    run.font.bold = bold
    run.font.italic = italic


def _add_hr(slide, left: float, top: float, width: float, color: RGBColor = OCHRE) -> None:
    line = slide.shapes.add_connector(1, Inches(left), Inches(top), Inches(left + width), Inches(top))
    line.line.color.rgb = color
    line.line.width = Pt(1.0)


def _build_cover_slide(prs: Presentation, *, client_name: str, variant: VariantOutput) -> None:
    slide, w, h = _blank_slide(prs)

    _add_text(
        slide,
        0.8,
        0.6,
        12,
        0.35,
        "Design Office — argumentaire client",
        font="Courier New",
        size=11,
        color=TERRACOTTA,
        letter_spacing=250,
    )
    _add_text(
        slide,
        0.8,
        1.2,
        12,
        2.6,
        f"{client_name}\n« {variant.title} »",
        font="Calibri",
        size=56,
        color=BONE_TEXT,
        bold=True,
    )
    _add_hr(slide, 0.8, 4.0, 4.0)
    _add_text(
        slide,
        0.8,
        4.2,
        12,
        2.4,
        f"Parti : {variant.style.value.replace('_', ' ').title()}\n"
        f"Postes : {variant.metrics.workstation_count}\n"
        f"Flex ratio : {variant.metrics.flex_ratio_applied:.2f}\n"
        f"Total programmé : ≈ {round(variant.metrics.total_programmed_m2)} m²",
        font="Calibri",
        size=20,
        color=BONE_TEXT,
    )
    _add_text(
        slide,
        0.8,
        6.8,
        12,
        0.4,
        f"{datetime.now(tz=timezone.utc).date().isoformat()} · Built with Opus 4.7 · MIT License",
        font="Courier New",
        size=10,
        color=NEUTRAL_400,
    )


def _build_bet_slide(prs: Presentation, *, client_name: str, section: str) -> None:
    slide, _, _ = _blank_slide(prs)
    _eyebrow(slide, "01 · Le pari")
    _add_text(
        slide,
        0.8,
        1.15,
        12,
        1.0,
        f"Pourquoi cette variante pour {client_name}",
        font="Calibri",
        size=36,
        color=BONE_TEXT,
        bold=True,
    )
    _add_hr(slide, 0.8, 2.2, 4.0)
    body = _condense(section, max_chars=1100)
    _add_text(
        slide, 0.8, 2.6, 12, 4.4, body, font="Calibri", size=18, color=BONE_TEXT
    )


def _build_metrics_slide(prs: Presentation, *, variant: VariantOutput) -> None:
    slide, _, _ = _blank_slide(prs)
    _eyebrow(slide, "02 · Programme retenu")
    _add_text(
        slide,
        0.8,
        1.15,
        12,
        1.0,
        "Chiffres clés de la variante",
        font="Calibri",
        size=36,
        color=BONE_TEXT,
        bold=True,
    )
    _add_hr(slide, 0.8, 2.2, 4.0)

    metrics = [
        ("Postes individuels", str(variant.metrics.workstation_count)),
        ("Réunions", str(variant.metrics.meeting_room_count)),
        ("Phone booths", str(variant.metrics.phone_booth_count)),
        ("Flex ratio", f"{variant.metrics.flex_ratio_applied:.2f}"),
        ("Collab (m²)", f"{round(variant.metrics.collab_surface_m2)}"),
        ("Total programmé (m²)", f"{round(variant.metrics.total_programmed_m2)}"),
    ]

    x0, y0 = 0.8, 2.8
    col_w, col_h = 4.1, 1.7
    gutter = 0.2
    for i, (label, value) in enumerate(metrics):
        col = i % 3
        row = i // 3
        left = x0 + col * (col_w + gutter)
        top = y0 + row * (col_h + gutter)
        card = slide.shapes.add_shape(
            MSO_SHAPE.ROUNDED_RECTANGLE,
            Inches(left),
            Inches(top),
            Inches(col_w),
            Inches(col_h),
        )
        card.adjustments[0] = 0.06
        card.line.color.rgb = NEUTRAL_400
        card.line.width = Pt(0.5)
        card.fill.solid()
        card.fill.fore_color.rgb = INK_SOFT

        _add_text(
            slide,
            left + 0.3,
            top + 0.25,
            col_w - 0.6,
            0.35,
            label.upper(),
            font="Courier New",
            size=10,
            color=NEUTRAL_300,
        )
        _add_text(
            slide,
            left + 0.3,
            top + 0.65,
            col_w - 0.6,
            0.9,
            value,
            font="Calibri",
            size=38,
            color=BONE_TEXT,
            bold=True,
        )


def _build_research_slide(prs: Presentation, *, sections: dict[str, str]) -> None:
    slide, _, _ = _blank_slide(prs)
    _eyebrow(slide, "03 · Ce que dit la recherche")
    _add_text(
        slide,
        0.8,
        1.15,
        12,
        1.0,
        "Acoustique · Biophilie · Flex",
        font="Calibri",
        size=36,
        color=BONE_TEXT,
        bold=True,
    )
    _add_hr(slide, 0.8, 2.2, 4.0)

    body = _condense(sections.get("2", ""), max_chars=1400)
    _add_text(
        slide, 0.8, 2.6, 12, 4.4, body, font="Calibri", size=15, color=BONE_TEXT
    )
    _add_text(
        slide,
        0.8,
        6.7,
        12,
        0.5,
        "Sources : Browning 2014 · Nieuwenhuis 2014 · Ulrich 1984 · NF S 31-080 · Leesman 2024",
        font="Courier New",
        size=9,
        color=NEUTRAL_300,
    )


def _build_regulatory_slide(prs: Presentation, *, sections: dict[str, str]) -> None:
    slide, _, _ = _blank_slide(prs)
    _eyebrow(slide, "04 · Ce que dit la réglementation")
    _add_text(
        slide,
        0.8,
        1.15,
        12,
        1.0,
        "ERP type W · PMR · Code du travail",
        font="Calibri",
        size=36,
        color=BONE_TEXT,
        bold=True,
    )
    _add_hr(slide, 0.8, 2.2, 4.0)

    body = _condense(sections.get("3", ""), max_chars=1500)
    _add_text(
        slide, 0.8, 2.6, 12, 4.4, body, font="Calibri", size=15, color=BONE_TEXT
    )
    _add_text(
        slide,
        0.8,
        6.7,
        12,
        0.5,
        "Sources : Arrêté 20 avril 2017 · Règlement sécurité ERP type W · R. 4222 / R. 4223 · EN 12464-1",
        font="Courier New",
        size=9,
        color=NEUTRAL_300,
    )


def _build_next_steps_slide(
    prs: Presentation, *, sections: dict[str, str], project_reference: str | None
) -> None:
    slide, _, _ = _blank_slide(prs)
    _eyebrow(slide, "05 · Prochaines étapes & KPIs")
    _add_text(
        slide,
        0.8,
        1.15,
        12,
        1.0,
        "Ce qu'il faut pour démarrer",
        font="Calibri",
        size=36,
        color=BONE_TEXT,
        bold=True,
    )
    _add_hr(slide, 0.8, 2.2, 4.0)

    kpis = _condense(sections.get("5", ""), max_chars=600)
    steps = _condense(sections.get("6", ""), max_chars=700)

    _add_text(
        slide,
        0.8,
        2.7,
        5.9,
        0.35,
        "RÉSULTATS ATTENDUS 6–12 MOIS",
        font="Courier New",
        size=10,
        color=OCHRE,
    )
    _add_text(slide, 0.8, 3.1, 5.9, 3.4, kpis, font="Calibri", size=14, color=BONE_TEXT)

    _add_text(
        slide,
        7.0,
        2.7,
        5.9,
        0.35,
        "PROCHAINES ÉTAPES",
        font="Courier New",
        size=10,
        color=OCHRE,
    )
    _add_text(slide, 7.0, 3.1, 5.9, 3.4, steps, font="Calibri", size=14, color=BONE_TEXT)

    footer = f"Projet : {project_reference or 'DO-CAT-B'} · Built with Opus 4.7"
    _add_text(
        slide,
        0.8,
        6.85,
        12,
        0.4,
        footer,
        font="Courier New",
        size=9,
        color=NEUTRAL_300,
    )


def _eyebrow(slide, text: str) -> None:
    _add_text(
        slide,
        0.8,
        0.6,
        12,
        0.35,
        text.upper(),
        font="Courier New",
        size=10,
        color=TERRACOTTA,
    )


# ---------------------------------------------------------------------------
# Markdown helpers
# ---------------------------------------------------------------------------


_SECTION_RE = re.compile(r"^##\s+(\d+)\.\s*(.+?)\s*$", flags=re.MULTILINE)


def _split_argumentaire(md: str) -> dict[str, str]:
    """Split the consolidator Markdown by its numbered `## N. Title` headings.

    Returns {"1": "...body...", "2": "...", ...}. Each body is the raw
    Markdown between that heading and the next one (or EOF).
    """

    out: dict[str, str] = {}
    matches = list(_SECTION_RE.finditer(md))
    for i, m in enumerate(matches):
        idx = m.group(1)
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(md)
        out[idx] = md[start:end].strip()
    return out


def _condense(raw: str, *, max_chars: int) -> str:
    """Turn Markdown subsection body into slide-friendly plain text.

    Strips `### X` subheadings (keeping a separator line), drops bold/italic
    markers, preserves `- ` bullet markers as `•`, truncates to `max_chars`
    with an ellipsis.
    """

    if not raw:
        return ""
    text = raw
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"(?<!\*)\*([^*\n]+?)\*(?!\*)", r"\1", text)
    text = re.sub(r"^###\s+(.+?)\s*$", r"— \1", text, flags=re.MULTILINE)
    text = re.sub(r"^-\s+", "• ", text, flags=re.MULTILINE)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = text.strip()
    if len(text) > max_chars:
        text = text[: max_chars - 1].rstrip() + "…"
    return text


def pptx_path_for(pptx_id: str) -> Path | None:
    candidate = PPTX_OUT_DIR / f"{pptx_id}.pptx"
    return candidate if candidate.exists() else None


def pdf_out_dir() -> Path:
    """Helper to keep `main.py` tidy — the Justify PDF directory lives in
    `justify.py` as the canonical source of truth.
    """

    return PDF_OUT_DIR
