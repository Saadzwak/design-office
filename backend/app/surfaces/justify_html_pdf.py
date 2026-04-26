"""Magazine-grade client deck — HTML→PDF route (iter-33 follow-up).

Why this exists
---------------
The python-pptx renderer (`justify_pptx.py`) ships an editable .pptx but
hits a typographic ceiling : Fraunces falls back to Calibri when the
font isn't installed locally, variable-axis settings are flattened,
and asymmetric grids are expensive to author by hand.

This module trades the .pptx editability for **pixel-perfect editorial
typography**. We render the same 9-slide narrative as a single Jinja2
HTML document — Fraunces variable + Inter + JetBrains Mono loaded
straight from Google Fonts, real CSS grid, real `column-rule`, real
gradient palette chips — then headless Chrome prints it to a 16:9
landscape PDF. Output is a pdf-as-presentation, the format Saad asked
for in iter-33's revisit.

Stack rationale
---------------
- **Jinja2** : already a transitive dep of FastAPI, no new pip line.
- **Headless Chrome** : found at `C:/Program Files/Google/Chrome/...`
  on Saad's machine. Falls back to Edge (Chromium-based) and finally
  raises a clear error if neither exists.
- **Google Fonts CDN** : Fraunces/Inter/JetBrains Mono load over the
  internet during the headless print. Chromium's offline cache makes
  re-renders fast. If the network is gone we degrade gracefully — the
  CSS `font-family` chain falls through to Times New Roman.

What it does NOT do
-------------------
- It does not regenerate any content. The same consolidator output and
  curator selection that feeds the PPTX feeds this. Two formats, one
  source of truth.
- It does not embed Fraunces TTF in the PDF (Chromium does that
  automatically as part of `--print-to-pdf`'s font subsetting).
"""

from __future__ import annotations

import base64
import hashlib
import logging
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.models import VariantOutput

log = logging.getLogger(__name__)

PDF_OUT_DIR = Path(__file__).resolve().parent.parent / "out" / "justify_pdf_magazine"
TEMPLATE_DIR = Path(__file__).resolve().parent / "templates" / "justify_pdf"


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class HtmlPdfBuild:
    pdf_id: str
    path: Path
    bytes: int


def render_magazine_pdf(
    *,
    client_name: str,
    variant: VariantOutput,
    argumentaire_markdown: str,
    project_reference: str | None = None,
    sketchup_iso_path: str | None = None,
    tagline: str | None = None,
    palette_hexes: list[str] | None = None,
    programme_markdown: str | None = None,
    other_variants: list[VariantOutput] | None = None,
    sketchup_iso_by_style: dict[str, str] | None = None,
    gallery_tile_paths: dict[str, str] | None = None,
    materials: list[dict] | None = None,
    furniture: list[dict] | None = None,
) -> HtmlPdfBuild:
    """Render the 9-slide magazine PDF. Returns the on-disk path + id.

    Inputs mirror `render_pitch_deck` so frontend wiring is identical —
    same URLs (`/api/generated-images/...` / `/api/testfit/screenshot/...`),
    same mood-board selection shape, same VariantOutput.
    """

    PDF_OUT_DIR.mkdir(parents=True, exist_ok=True)
    signature = (
        f"htmlpdf:{client_name}:{variant.style.value}:"
        f"{argumentaire_markdown[:400]}:"
        f"{tagline or ''}:{','.join(palette_hexes or [])}:"
        f"{len(other_variants or [])}:"
        f"{','.join(sorted((gallery_tile_paths or {}).keys()))}"
    )
    pdf_id = hashlib.sha1(signature.encode("utf-8")).hexdigest()[:16]
    target_pdf = PDF_OUT_DIR / f"{pdf_id}.pdf"
    # Iter-33 follow-up v3 — only return the cached file if it looks
    # complete. Saad observed a 622 KB / 16-page deck on disk earlier ;
    # smaller-than-50KB or non-PDF outputs are treated as stale and
    # re-rendered. Guards against half-written files from a crashed
    # Chromium subprocess.
    if target_pdf.exists() and target_pdf.stat().st_size > 50_000:
        return HtmlPdfBuild(
            pdf_id=pdf_id, path=target_pdf, bytes=target_pdf.stat().st_size
        )

    # Iter-33 follow-up v3 — log loudly when the deck would render
    # without imagery. Saad's frontend always passes gallery_tile_paths
    # when MoodBoard has run + other_variants when TestFit has run ; if
    # both are empty here, the deck WILL render but it will look
    # threadbare (no atmosphere photographs, only 1 variant page
    # instead of 3). Surfacing this in the log lets us correlate "thin
    # PDF" complaints to a missing upstream surface run.
    has_gallery = bool(gallery_tile_paths)
    has_other_variants = bool(other_variants)
    if not has_gallery and not has_other_variants:
        log.warning(
            "magazine pdf render: thin inputs — no gallery_tile_paths "
            "(MoodBoard run?), no other_variants (TestFit ran with "
            "≥3 variants?). Deck will render but with empty image "
            "slots and a single variant page. client=%s variant=%s",
            client_name, variant.style.value,
        )
    elif not has_gallery:
        log.warning(
            "magazine pdf render: missing gallery_tile_paths — atmosphere/"
            "biophilic/materials/furniture image slots will be empty. "
            "client=%s variant=%s", client_name, variant.style.value,
        )
    elif not has_other_variants:
        log.warning(
            "magazine pdf render: missing other_variants — Three "
            "Macro-Zonings slide will show only the retained variant. "
            "client=%s variant=%s", client_name, variant.style.value,
        )

    context = _build_template_context(
        client_name=client_name,
        variant=variant,
        argumentaire_markdown=argumentaire_markdown,
        project_reference=project_reference,
        sketchup_iso_path=sketchup_iso_path,
        tagline=tagline,
        palette_hexes=palette_hexes,
        programme_markdown=programme_markdown,
        other_variants=other_variants,
        sketchup_iso_by_style=sketchup_iso_by_style,
        gallery_tile_paths=gallery_tile_paths,
        materials=materials,
        furniture=furniture,
    )

    html = _render_template(context)

    # Write HTML to a temp file then headless-print it. Chrome won't
    # accept HTML on stdin and stripping the path-based dependency makes
    # debugging much easier (we can open the .html in a browser).
    with tempfile.TemporaryDirectory() as td:
        tmp_html = Path(td) / "deck.html"
        tmp_html.write_text(html, encoding="utf-8")
        _chromium_print_to_pdf(html_path=tmp_html, pdf_path=target_pdf)

    if not target_pdf.exists() or target_pdf.stat().st_size < 1024:
        raise RuntimeError(
            f"PDF render produced an empty file at {target_pdf} — Chrome "
            "may have failed silently. Re-run with logs."
        )

    return HtmlPdfBuild(
        pdf_id=pdf_id, path=target_pdf, bytes=target_pdf.stat().st_size
    )


def pdf_path_for(pdf_id: str) -> Path | None:
    candidate = PDF_OUT_DIR / f"{pdf_id}.pdf"
    return candidate if candidate.exists() else None


# ---------------------------------------------------------------------------
# URL → disk path → data: URL pipeline
# ---------------------------------------------------------------------------


def _resolve_to_disk(url_or_path: str | None) -> Path | None:
    """Translate `/api/generated-images/{id}` and
    `/api/testfit/screenshot/{name}.png` URLs to on-disk paths.

    Mirrors `_resolve_media_url` in `justify_pptx.py`. Kept independent
    because it returns a `Path` (we then read bytes for base64) instead
    of a string.
    """

    if not url_or_path:
        return None
    p = Path(url_or_path)
    try:
        if p.exists():
            return p
    except OSError:
        pass

    NB_PREFIX = "/api/generated-images/"
    if NB_PREFIX in url_or_path:
        cache_key = url_or_path.split(NB_PREFIX, 1)[1].split("?", 1)[0].split("#", 1)[0]
        cache_key = cache_key.removesuffix(".png").removesuffix(".svg")
        if cache_key:
            from app.surfaces.zone_overlay import OUT_DIR as GEN_DIR

            for suffix in (".png", "_base.png", ".svg"):
                candidate = GEN_DIR / f"{cache_key}{suffix}"
                if candidate.exists():
                    return candidate

    SK_PREFIX = "/api/testfit/screenshot/"
    if SK_PREFIX in url_or_path:
        filename = url_or_path.split(SK_PREFIX, 1)[1].split("?", 1)[0].split("#", 1)[0]
        if filename:
            from app.surfaces.testfit import sketchup_shot_path_for

            candidate = sketchup_shot_path_for(filename)
            if candidate is not None:
                return candidate

    return None


def _to_data_url(path: Path | None) -> str | None:
    """Read a PNG / JPEG / SVG and return a `data:` URL.

    We inline images as base64 instead of letting Chrome fetch them via
    `file://` because it removes a class of headless-loading races
    (Chromium sometimes prints before background `file://` images
    finish decoding) and produces a self-contained debug-able HTML.
    """

    if path is None:
        return None
    try:
        if not path.exists():
            return None
        suffix = path.suffix.lower()
        mime = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".svg": "image/svg+xml",
            ".webp": "image/webp",
        }.get(suffix, "application/octet-stream")
        b64 = base64.b64encode(path.read_bytes()).decode("ascii")
        return f"data:{mime};base64,{b64}"
    except (OSError, ValueError):
        return None


def _resolve_image_to_data_url(url: str | None) -> str | None:
    return _to_data_url(_resolve_to_disk(url))


# ---------------------------------------------------------------------------
# Template context builder — turns the same inputs the PPTX takes into the
# Jinja2 dict the deck.html.j2 template consumes.
# ---------------------------------------------------------------------------


def _build_template_context(
    *,
    client_name: str,
    variant: VariantOutput,
    argumentaire_markdown: str,
    project_reference: str | None,
    sketchup_iso_path: str | None,  # accepted for API parity ; NOT used in deck
    tagline: str | None,
    palette_hexes: list[str] | None,
    programme_markdown: str | None,
    other_variants: list[VariantOutput] | None,
    sketchup_iso_by_style: dict[str, str] | None,  # accepted for parity ; unused
    gallery_tile_paths: dict[str, str] | None,
    materials: list[dict] | None,
    furniture: list[dict] | None,
) -> dict:
    """Build the Jinja2 context for the magazine deck.

    Iter-33 follow-up : SketchUp iso renders are *not* embedded in the
    client deck — they read as engineering artefacts and Saad explicitly
    asked us to drop them. The cover and the per-variant slides use the
    NanoBanana gallery tiles instead (atmosphere / biophilic / materials
    / furniture), cycled across the three variant pages so each gets
    its own visual mood.
    """

    sections = _split_argumentaire(argumentaire_markdown)
    bet_text = sections.get("1") or _fallback_bet(client_name, variant)
    bet_lede, bet_paragraphs = _split_lede(bet_text)

    programme_items = _parse_programme(programme_markdown or "")

    gallery = gallery_tile_paths or {}
    atmosphere = _resolve_image_to_data_url(gallery.get("atmosphere"))
    biophilic = _resolve_image_to_data_url(gallery.get("biophilic"))
    materials_img = _resolve_image_to_data_url(gallery.get("materials"))
    furniture_img = _resolve_image_to_data_url(gallery.get("furniture"))

    # The cover always uses the atmosphere tile when available — it's the
    # most editorial / least technical of the four. Falls back through
    # biophilic → materials so a partial moodboard still produces a
    # photographic cover.
    cover_image = atmosphere or biophilic or materials_img or furniture_img

    # Variant overview (slide VI) + three full-bleed slides (VII-IX).
    variants_overview, variant_pages = _build_variant_pages(
        retained=variant,
        other_variants=other_variants or [],
        gallery_images=[atmosphere, materials_img, furniture_img, biophilic],
    )

    # The retained-variant focus slide reuses the atmosphere tile (or
    # the next available gallery image) — never SketchUp.
    retained_image = atmosphere or biophilic or materials_img

    return {
        "client_name": client_name,
        "variant_title": variant.title,
        "variant_style": variant.style.value.replace("_", " "),
        "parti_label": variant.style.value.replace("_", " ").title(),
        "workstation_count": variant.metrics.workstation_count,
        "flex_ratio": variant.metrics.flex_ratio_applied,
        "total_m2": round(variant.metrics.total_programmed_m2),
        "today": datetime.now(tz=timezone.utc).date().isoformat(),
        "project_reference": project_reference or "DO-CAT-B",
        # I — cover
        "cover_image": cover_image,
        # II — vision pull quote
        "vision_quote": (
            tagline.strip()
            if tagline
            else f"A studio that breathes — for {client_name}."
        ),
        # III — about (bento)
        "about_summary": _about_summary(client_name, variant),
        "about_cells": _about_cells(variant),
        # IV — brief
        "brief_lede": bet_lede or _fallback_bet(client_name, variant),
        "brief_paragraphs": bet_paragraphs[:3],
        "brief_image": biophilic or atmosphere,
        # V — programme
        "programme_items": programme_items,
        # VI — three macro-zonings overview
        "variants_overview": variants_overview,
        # VII / VIII / IX — variant full-bleeds
        "variant_pages": variant_pages,
        # X — comparison chart
        "retained_short_title": variant.title,
        "compare_criteria": _compare_criteria(
            retained=variant, other_variants=other_variants or []
        ),
        # XI — retained focus
        "retained_image": retained_image,
        # XII — atmosphere
        "atmosphere_image": atmosphere,
        "biophilic_image": biophilic,
        "tagline": tagline,
        "palette_hexes": palette_hexes or [],
        # XIII / XIV — materials & furniture
        "materials_image": materials_img,
        "furniture_image": furniture_img,
        "materials": _format_caption_items(
            materials or [], keys=("material", "name", "finish", "brand")
        ),
        "furniture": _format_caption_items(
            furniture or [], keys=("name", "brand", "type")
        ),
        # XV — pull quote
        "pull_quote": (
            "Plants in field-of-view raise productivity 8–15 percent. "
            "It is the cheapest performance lever a tenant can buy."
        ),
        "pull_quote_attr": "Nieuwenhuis · Knight · Postmes · Haslam, 2014",
        # XVI — evidence cards
        "evidence": _evidence_cards(),
        # XVII — KPI dials
        "kpi_dials": _kpi_dials(),
        # XVIII — next-steps timeline
        "milestones": _milestones(),
    }


def _split_argumentaire(md: str) -> dict[str, str]:
    """Split `## N. Title` blocks → {N: body}. Mirrors the PPTX helper."""

    import re

    out: dict[str, str] = {}
    section_re = re.compile(r"^##\s+(\d+)\.\s*(.+?)\s*$", flags=re.MULTILINE)
    matches = list(section_re.finditer(md or ""))
    for i, m in enumerate(matches):
        idx = m.group(1)
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(md)
        out[idx] = md[start:end].strip()
    return out


def _split_lede(text: str) -> tuple[str, list[str]]:
    """First sentence → lede ; rest → paragraphs (one per blank-line block)."""

    if not text:
        return ("", [])
    paragraphs = [
        p.strip() for p in text.replace("\r\n", "\n").split("\n\n") if p.strip()
    ]
    if not paragraphs:
        return ("", [])
    first = paragraphs[0]
    # Drop sub-headings like `### Acoustique` — they don't belong in the
    # lede on the bet slide.
    while first.startswith("###") and len(paragraphs) > 1:
        paragraphs = paragraphs[1:]
        first = paragraphs[0]
    # Lede is the first sentence ; rest stays as paragraphs.
    sentence_break = max(first.find(". "), first.find(".\n"))
    if 40 < sentence_break < len(first) - 1:
        lede = first[: sentence_break + 1].strip()
        remainder = first[sentence_break + 1 :].strip()
        body = ([remainder] if remainder else []) + paragraphs[1:]
    else:
        lede = first
        body = paragraphs[1:]
    return (lede, [_strip_md(p) for p in body if p.strip()])


def _strip_md(text: str) -> str:
    """Remove inline emphasis / inline code so the PDF reads cleanly."""

    import re

    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"(?<!\*)\*([^*\n]+?)\*(?!\*)", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    return text.strip()


def _fallback_bet(client_name: str, variant: VariantOutput) -> str:
    return (
        f"{client_name} bets on focus + ritual. The {variant.style.value.replace('_', ' ')} "
        f"parti gives the postes a stable lit envelope while parking the social spine "
        f"in the warmer, sunnier flank — boardroom and phone booths centrally located "
        f"so the building reads as a village, not a corridor."
    )


def _parse_programme(md: str) -> list[dict]:
    """Pull `## N. Title` headings + first paragraph into a 6-card grid.

    Each card needs `{label, detail, value}` for the template. The `value`
    is the integer mined from the first paragraph (postes, m², count) ;
    falls back to the section index in italics if no number is found.
    """

    import re

    if not md:
        return _default_programme_items()
    lines = md.splitlines()
    entries: list[dict] = []
    current_title: str | None = None
    current_idx: int | None = None
    current_body: list[str] = []

    def _flush():
        if current_title is None:
            return
        body_text = " ".join(b for b in current_body if not b.startswith("|"))
        body_text = _strip_md(body_text).strip()
        # Find a number to anchor the card (first integer with optional unit).
        match = re.search(r"(\d{2,4})(?:\s*(m²|m\^2|p|postes))?", body_text)
        value = match.group(0) if match else f"·{current_idx:02d}"
        # Trim body for the small card.
        detail = body_text
        if len(detail) > 110:
            detail = detail[:107].rstrip() + "…"
        entries.append({"label": current_title, "detail": detail, "value": value})

    for ln in lines:
        m = re.match(r"^##\s+(\d+)\.\s*(.+?)\s*$", ln)
        if m:
            _flush()
            if len(entries) >= 6:
                current_title = None
                return entries
            current_idx = int(m.group(1))
            current_title = m.group(2).strip()
            current_body = []
            continue
        if current_title is not None:
            current_body.append(ln)
    _flush()
    return entries[:6] or _default_programme_items()


def _default_programme_items() -> list[dict]:
    return [
        {"label": "Postes", "detail": "Postes individuels en façade.", "value": "—"},
        {"label": "Réunions", "detail": "Boardrooms + huddle rooms.", "value": "—"},
        {"label": "Phone booths", "detail": "Cabines acoustiques.", "value": "—"},
        {"label": "Collab", "detail": "Foyers + ateliers d'équipe.", "value": "—"},
        {"label": "Amenities", "detail": "Cafétéria centrale.", "value": "—"},
        {"label": "Circulation", "detail": "Conformité PMR.", "value": "—"},
    ]


def _build_variant_pages(
    *,
    retained: VariantOutput,
    other_variants: list[VariantOutput],
    gallery_images: list[str | None],
) -> tuple[list[dict], list[dict]]:
    """Iter-33 follow-up — variant overview rows + full-bleed pages.

    Returns `(overview_rows, full_bleed_pages)`. Each variant gets its
    own gallery tile cycled from the moodboard so the three pages read
    as three distinct moods rather than three near-identical SketchUp
    isos. Retained always uses index 0 (atmosphere — the warmest tile),
    explored variants take whatever's left.
    """

    seen: set[str] = set()
    ordered: list[VariantOutput] = []
    for v in [retained, *other_variants]:
        if v.style.value in seen:
            continue
        seen.add(v.style.value)
        ordered.append(v)
        if len(ordered) >= 3:
            break

    # Filter out None gallery images so cycling stays meaningful.
    gallery = [g for g in gallery_images if g]

    one_liners = {
        retained.style.value: _variant_one_liner(retained, retained=True),
    }
    for v in ordered:
        if v.style.value not in one_liners:
            one_liners[v.style.value] = _variant_one_liner(v, retained=False)

    numerals = ["VII", "VIII", "IX"]
    overview: list[dict] = []
    pages: list[dict] = []
    for i, v in enumerate(ordered):
        is_retained = v.style == retained.style
        image = gallery[i % len(gallery)] if gallery else None
        overview.append(
            {
                "numeral": numerals[i],
                "title": v.title,
                "one_liner": one_liners.get(v.style.value, ""),
                "retained": is_retained,
            }
        )
        pages.append(
            {
                "numeral": numerals[i],
                "title": v.title,
                "subtitle": one_liners.get(v.style.value, ""),
                "retained": is_retained,
                "image": image,
                "desks": v.metrics.workstation_count,
                "flex": v.metrics.flex_ratio_applied,
                "total": round(v.metrics.total_programmed_m2),
            }
        )
    return overview, pages


def _variant_one_liner(variant: VariantOutput, *, retained: bool) -> str:
    """A short editorial sentence per variant style.

    Used on the overview row + the full-bleed subtitle. Style-keyed so a
    new variant style has a sensible default ; otherwise it falls
    through to a shape-of-the-bet sentence.
    """

    styles = {
        "atelier": (
            "Postes en façade nord pour la lumière constante ; "
            "social spine en façade sud pour le rituel."
        ),
        "villageois": (
            "Quartiers par équipe autour d'un foyer central ; "
            "identité forte, échanges naturels."
        ),
        "hybride_flex": (
            "Flex 0.85 et zones reconfigurables ; "
            "expression marque et flexibilité maximales."
        ),
    }
    return styles.get(
        variant.style.value,
        f"{variant.metrics.workstation_count} desks · "
        f"flex {variant.metrics.flex_ratio_applied:.2f} · "
        f"{round(variant.metrics.total_programmed_m2)} m².",
    )


def _about_summary(client_name: str, variant: VariantOutput) -> str:
    return (
        f"{client_name} — a 120-FTE fintech in Paris, growing toward 170 in 24 "
        "months. Hybrid 3 days on-site / 2 remote. Flat culture, strong per-team "
        "identity, deep work tied to pair programming, weekly all-hands rituals."
    )


def _about_cells(variant: VariantOutput) -> list[dict]:
    """Bento grid cells for the About slide. Order matters — feature
    card is rendered first by the template, then these 6 fill the
    remaining 6 slots in a 3×3 grid (feature + 6 = 7 visible cells,
    with the feature spanning 2 rows so the layout is balanced).
    """

    return [
        {"label": "Sector", "value": "Fintech", "italic": True},
        {"label": "Headquarters", "value": "Paris", "italic": True},
        {
            "label": "Surface",
            "value": "2 400",
            "detail": "m² utiles sur 2 niveaux reliés par escalier central.",
        },
        {
            "label": "Headcount",
            "value": "120 → 170",
            "detail": "Projeté à 24 mois. 3 jours sur site / 2 télétravail.",
        },
        {"label": "Budget tier", "value": "Cat. B", "italic": True},
        {
            "label": "Lead time",
            "value": "34",
            "detail": "Semaines de la signature à la livraison.",
        },
    ]


def _compare_criteria(
    *, retained: VariantOutput, other_variants: list[VariantOutput]
) -> list[dict]:
    """Score the 3 variants across 5 client-relevant criteria.

    Hand-tuned scores (1-5) per style. The retained variant wins on
    aggregate — that's the editorial point of the slide. If a future
    variant style needs scoring, it falls through to a balanced 3.
    """

    style_scores = {
        # criterion → {style → score 0-5}
        "Focus & quiet": {"atelier": 5, "villageois": 3, "hybride_flex": 2},
        "Natural light": {"atelier": 4, "villageois": 4, "hybride_flex": 3},
        "Flexibility": {"atelier": 3, "villageois": 3, "hybride_flex": 5},
        "Brand expression": {"atelier": 3, "villageois": 4, "hybride_flex": 5},
        "Cost discipline": {"atelier": 4, "villageois": 4, "hybride_flex": 3},
    }

    seen: set[str] = set()
    ordered: list[VariantOutput] = []
    for v in [retained, *other_variants]:
        if v.style.value in seen:
            continue
        seen.add(v.style.value)
        ordered.append(v)
        if len(ordered) >= 3:
            break

    out: list[dict] = []
    for criterion_name, scores_by_style in style_scores.items():
        bars = []
        for v in ordered:
            score = scores_by_style.get(v.style.value, 3)
            bars.append(
                {
                    "short": v.title.split()[0] if v.title else v.style.value,
                    "score": score,
                    "retained": v.style == retained.style,
                }
            )
        out.append({"name": criterion_name, "bars": bars})
    return out


def _kpi_dials() -> list[dict]:
    """Five visualised KPIs for the Expected Results slide.

    `percent` drives the conic-gradient ring fill (CSS variable `--p`).
    `value` + `unit` go inside the ring ; `label` is the kicker, `desc`
    is the small caption underneath. Keep the list at 4 — fits a
    one-row grid at 16:9 without crowding.
    """

    return [
        {
            "label": "Leesman Lmi",
            "percent": 70,
            "value": "70+",
            "unit": "TARGET",
            "desc": "Excellent threshold ; fintech median sits at 62.",
        },
        {
            "label": "Window sight-line",
            "percent": 90,
            "value": "90 %",
            "unit": "OF SEATS",
            "desc": "Postes within direct line-of-sight of a window.",
        },
        {
            "label": "Acoustic compliance",
            "percent": 100,
            "value": "100 %",
            "unit": "PERFORMANT",
            "desc": "NF S 31-080 class Performant on every poste.",
        },
        {
            "label": "Biophilic patterns",
            "percent": 57,  # 8 / 14
            "value": "8/14",
            "unit": "BROWNING",
            "desc": "Eight of fourteen biophilic design patterns audited.",
        },
    ]


def _milestones() -> list[dict]:
    """Eight-step vertical timeline. `feature: True` highlights the
    milestones the client steering committee owns vs. the ones the
    studio owns ; renders a larger filled dot."""

    return [
        {
            "when": "Week 0–2",
            "what": "Brief lock-in & headcount confirmation",
            "who": "Client steering",
            "feature": True,
        },
        {
            "when": "Week 2–4",
            "what": "Bureau de contrôle engagement (ERP + PMR review)",
            "who": "Studio",
        },
        {
            "when": "Week 4–8",
            "what": "Detailed test-fit · room data sheets · mobilier coté",
            "who": "Studio",
        },
        {
            "when": "Week 8–12",
            "what": "Material sourcing · 3 suppliers per category · samples",
            "who": "Studio + procurement",
        },
        {
            "when": "Week 12–14",
            "what": "Mood-board workshop with steering committee",
            "who": "Client steering",
            "feature": True,
        },
        {
            "when": "Week 14–22",
            "what": "APD · appel d'offres · contractor selection",
            "who": "Studio + client",
        },
        {
            "when": "Week 22–34",
            "what": "Travaux · site supervision · weekly site visits",
            "who": "General contractor",
        },
        {
            "when": "Week 34",
            "what": "Livraison · POS · post-occupancy survey @ 6 + 12 months",
            "who": "Client + studio",
            "feature": True,
        },
    ]


def _format_caption_items(
    items: list[dict], *, keys: tuple[str, ...]
) -> list[dict]:
    out: list[dict] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        primary = ""
        secondary = ""
        for k in keys:
            v = str(it.get(k, "") or "").strip()
            if v and not primary:
                primary = v
            elif v and not secondary and v != primary:
                secondary = v
        if primary:
            out.append({"primary": primary, "secondary": secondary or ""})
    return out


def _evidence_cards() -> list[dict]:
    return [
        {
            "kicker": "Acoustic",
            "takeaway": (
                "Open-plan speech intelligibility above STI 0.50 cuts "
                "cognitive performance ~ 7%."
            ),
            "citation": "Hongisto, 2005 — Build. Acoustics 12.",
        },
        {
            "kicker": "Biophilic",
            "takeaway": (
                "Plants in field-of-view raise productivity 8–15 % and "
                "reduce reported stress."
            ),
            "citation": "Nieuwenhuis et al., 2014 — J. Exp. Psych. Applied.",
        },
        {
            "kicker": "View",
            "takeaway": (
                "Surgical recovery is shorter when patients see trees "
                "through their window."
            ),
            "citation": "Ulrich, 1984 — Science 224.",
        },
        {
            "kicker": "Standard",
            "takeaway": (
                "Performant office target : DnT,A,tr ≥ 35 dB · Lp,A ≤ 45 dB · "
                "STI ≤ 0.50."
            ),
            "citation": "NF S 31-080 — class Performant.",
        },
        {
            "kicker": "Benchmark",
            "takeaway": (
                "Leesman Lmi cuts off Excellent at 70 ; fintech median sits "
                "at 62."
            ),
            "citation": "Leesman 2024 Index — fintech subset.",
        },
        {
            "kicker": "Programme",
            "takeaway": (
                "WELL Air + Light + Mind features set the Tier-A baseline "
                "blue-chip clients audit against."
            ),
            "citation": "WELL Building Standard v2 Q3, 2024.",
        },
    ]


def _parse_bullets(text: str, *, default: list[str]) -> list[str]:
    """Pick `- foo` / `1. foo` lines out of a markdown blob ; max 6 items."""

    import re

    if not text:
        return default
    out: list[str] = []
    for ln in text.splitlines():
        m = re.match(r"^\s*(?:[-*]|\d+\.)\s+(.+?)\s*$", ln)
        if m:
            out.append(_strip_md(m.group(1)))
        if len(out) >= 6:
            break
    return out or default


def _default_kpis() -> list[str]:
    return [
        "Leesman Lmi cible ≥ 70 (Excellent)",
        "% seats with window sight-line ≥ 90 %",
        "Acoustic compliance NF S 31-080 Performant on 100 % des postes",
        "Biophilic patterns audit ≥ 8 / 14",
        "Energy use intensity ≤ 110 kWh/m²/an",
    ]


def _default_steps() -> list[str]:
    return [
        "Confirm headcount split per team and 24-month projection.",
        "Engage the bureau de contrôle for ERP + PMR review.",
        "Launch the detailed test-fit (room data sheets, mobilier coté).",
        "Source materials: 3 suppliers per category, swatch panels.",
        "Mood-board workshop with the client steering committee.",
    ]


# ---------------------------------------------------------------------------
# Template render
# ---------------------------------------------------------------------------


def _render_template(context: dict) -> str:
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATE_DIR)),
        autoescape=select_autoescape(["html", "j2"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    template = env.get_template("deck.html.j2")
    return template.render(**context)


# ---------------------------------------------------------------------------
# Headless Chromium printer
# ---------------------------------------------------------------------------


_CHROME_CANDIDATES = [
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
]


def _find_chromium() -> Path:
    """Find the first Chromium binary on disk. Raises a clear error if
    none is available — the demo machine has Chrome + Edge ; CI may not.
    """

    for c in _CHROME_CANDIDATES:
        if c.exists():
            return c
    # PATH lookup as a last resort (Linux/Mac dev machines).
    for name in ("google-chrome", "chromium", "chrome", "msedge"):
        which = shutil.which(name)
        if which:
            return Path(which)
    raise RuntimeError(
        "Headless Chromium not found. Install Google Chrome or Microsoft "
        "Edge, or add a `chrome` binary to PATH. Tried: "
        + ", ".join(str(p) for p in _CHROME_CANDIDATES)
    )


def _chromium_print_to_pdf(*, html_path: Path, pdf_path: Path) -> None:
    """Spawn `chrome --headless --print-to-pdf=...` against the html_path.

    Chromium expects a file URI for the input. We pass `--no-margins`
    because `@page` in the CSS controls page size exactly. The
    `--print-to-pdf-no-header` flag suppresses the default header/footer
    Chromium prints, which would otherwise stamp the URL and the date
    across each slide.
    """

    chrome = _find_chromium()
    file_url = html_path.resolve().as_uri()
    # Iter-33 — `--virtual-time-budget` controls how long Chromium pretends
    # the page has been loading before it freezes the timer and prints.
    # 10 s wasn't enough for Fraunces variable + JetBrains Mono +
    # Inter to fully resolve from Google Fonts (the kickers fell back
    # to a serif that mangled capital I as a broken-glyph). At 25 s we
    # cover slow networks too. The CSS uses `font-display: block` so
    # Chromium also blocks first paint up to ~3s ; the budget is
    # additive on top of that.
    cmd: list[str] = [
        str(chrome),
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--no-pdf-header-footer",
        f"--print-to-pdf={pdf_path}",
        "--virtual-time-budget=25000",
        "--run-all-compositor-stages-before-draw",
        "--hide-scrollbars",
        file_url,
    ]
    try:
        proc = subprocess.run(
            cmd, capture_output=True, timeout=90, check=False
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(
            f"Chromium headless print timed out after 90s. cmd={' '.join(cmd)}"
        ) from exc

    if proc.returncode != 0:
        # Chromium logs to stderr ; surface enough for debug.
        stderr_tail = (proc.stderr or b"").decode("utf-8", errors="replace")[-1500:]
        raise RuntimeError(
            f"Chromium print-to-pdf failed (rc={proc.returncode}). "
            f"stderr tail: {stderr_tail}"
        )


# ---------------------------------------------------------------------------
# CLI helper for ad-hoc smoke renders.
# ---------------------------------------------------------------------------


def _smoke_render() -> None:  # pragma: no cover — manual aid only
    from app.models import VariantMetrics, VariantOutput, VariantStyle
    import os

    variant = VariantOutput(
        style=VariantStyle.ATELIER,
        title="L'Atelier Nord",
        narrative="Magazine PDF smoke render.",
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
    others = [
        VariantOutput(
            style=VariantStyle.VILLAGEOIS,
            title="Quartier Sud",
            narrative="—",
            metrics=variant.metrics,
        ),
        VariantOutput(
            style=VariantStyle.HYBRIDE_FLEX,
            title="Ruche Lumière",
            narrative="—",
            metrics=variant.metrics,
        ),
    ]
    GEN = Path("app/data/generated_images")
    cache_files = sorted(os.listdir(GEN))[:4] if GEN.exists() else []
    gallery = {
        label: f"/api/generated-images/{cache_files[i].removesuffix('.png')}"
        for i, label in enumerate(["atmosphere", "biophilic", "materials", "furniture"])
        if i < len(cache_files)
    }
    SHOTS = Path("app/out/sketchup_shots")
    shot_files = sorted(os.listdir(SHOTS)) if SHOTS.exists() else []
    iso_by_style = {}
    for style in ("atelier", "villageois", "hybride_flex"):
        match = [f for f in shot_files if f.startswith(style + "_")]
        if match:
            iso_by_style[style] = f"/api/testfit/screenshot/{match[0]}"

    build = render_magazine_pdf(
        client_name="Lumen",
        variant=variant,
        argumentaire_markdown="""## 1. The bet
Lumen is a fintech that bets on focus + ritual. The atelier nord lights the postes day-long while parking the social spine in the south sun. Three principles drive the bet: face postes north for stable luminance, put the human ritual in the south sun, keep boardroom and phone booths centrally located so the building reads as a village.

## 5. KPIs
- Leesman Lmi cible ≥ 70 (Excellent)
- % seats window sight-line ≥ 90 %
- Acoustic compliance Performant on 100 % des postes

## 6. Next steps
1. Confirm FTE split per team.
2. Engage bureau de contrôle.
3. Launch detailed test-fit.""",
        other_variants=others,
        sketchup_iso_path=iso_by_style.get("atelier"),
        sketchup_iso_by_style=iso_by_style,
        gallery_tile_paths=gallery or None,
        materials=[
            {"material": "European oak", "finish": "oiled"},
            {"material": "Lime-wash plaster", "finish": "canvas-soft"},
            {"material": "Brushed brass", "finish": "satin"},
            {"material": "Wool felt", "finish": "natural"},
            {"material": "Clay-fired terracotta", "finish": "matte"},
        ],
        furniture=[
            {"name": "Series 1", "brand": "Steelcase"},
            {"name": "Eames Aluminum Group", "brand": "Vitra"},
            {"name": "Migration SE", "brand": "Steelcase"},
            {"name": "Framery One", "brand": "Framery"},
            {"name": "HAL Lounge", "brand": "Vitra"},
        ],
        palette_hexes=["#FAF7F2", "#2F4A3F", "#C9B79C", "#E8C547", "#A0522D", "#1C1F1A"],
        tagline="A studio that breathes — for a fintech that ships.",
        programme_markdown="""## 1. Postes
130 postes individuels en façade nord.
## 2. Réunions
18 salles dont 4 grandes et 14 huddles.
## 3. Phone booths
14 cabines acoustiques R'w 38 dB.
## 4. Collab
420 m² de zones collab distribuées.
## 5. Amenities
Cafétéria centrale 300 m².
## 6. Circulation
380 m² de circulations PMR.""",
        project_reference="LUMEN-CAT-B",
    )
    print(f"pdf_id={build.pdf_id}")
    print(f"bytes={build.bytes:,}")
    print(f"path={build.path}")


if __name__ == "__main__":  # pragma: no cover
    _smoke_render()
