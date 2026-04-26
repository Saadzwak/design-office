"""Surface 3 — Justify (Research & Cite Level-3 orchestration)."""

from __future__ import annotations

import hashlib
import json
import logging
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel, Field

from app.agents.orchestrator import Orchestration, SubAgent
from app.claude_client import ClaudeClient
from app.models import FloorPlan, VariantOutput, VariantStyle

log = logging.getLogger(__name__)

BACKEND_ROOT = Path(__file__).resolve().parent.parent
PROMPTS_DIR = BACKEND_ROOT / "prompts" / "agents"
RESOURCES_DIR = BACKEND_ROOT / "data" / "resources"
BENCHMARKS_DIR = BACKEND_ROOT / "data" / "benchmarks"
OUT_DIR = BACKEND_ROOT / "out" / "justify"

RESOURCES_FOR_ACOUSTIC = [
    "acoustic-standards.md",
    "collaboration-spaces.md",
    "neuroarchitecture.md",  # Hongisto cognitive cost
]
RESOURCES_FOR_BIOPHILIC = [
    "neuroarchitecture.md",
    "biophilic-office.md",
    "ergonomic-workstation.md",
]
RESOURCES_FOR_REGULATORY = [
    "pmr-requirements.md",
    "erp-safety.md",
    "ergonomic-workstation.md",
]
RESOURCES_FOR_PROGRAMMING = [
    "office-programming.md",
    "flex-ratios.md",
    "collaboration-spaces.md",
]


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _load_resources(filenames: list[str]) -> str:
    return "\n\n---\n\n".join(
        f"# FILE: design://{(RESOURCES_DIR / n).stem}\n\n{_read(RESOURCES_DIR / n)}"
        for n in filenames
    )


class JustifyRequest(BaseModel):
    client_name: str = Field(default="Client")
    brief: str = Field(..., min_length=50)
    programme_markdown: str = Field(..., min_length=50)
    floor_plan: FloorPlan
    variant: VariantOutput
    language: str = "en"
    client_logo_data_url: str | None = Field(
        default=None,
        description=(
            "Optional `data:image/...;base64,…` URL uploaded on the Brief "
            "page. When provided, the PPTX pitch deck embeds it on the "
            "cover + footer."
        ),
    )
    sketchup_iso_path: str | None = Field(
        default=None,
        description=(
            "Optional absolute path to a PNG iso render of the retained "
            "variant. When provided, the PPTX cover uses it as the "
            "flagship right-column image."
        ),
    )
    # Iter-20e — magazine deck inputs. All optional : if absent, the
    # renderer falls back to the core 6-slide deck gracefully.
    mood_board_selection: dict | None = Field(
        default=None,
        description=(
            "Curator JSON from POST /api/moodboard/generate (or its "
            "client-side equivalent). Used to pull tagline, palette, "
            "materials and furniture into the PPTX mood slides."
        ),
    )
    other_variants: list[VariantOutput] | None = Field(
        default=None,
        description=(
            "The two non-retained macro-zoning variants. Used on the "
            "'Three variants' strip slide so the client sees the full "
            "decision set, not just the winner."
        ),
    )
    sketchup_iso_by_style: dict[str, str] | None = Field(
        default=None,
        description=(
            "Map `{style.value: iso_path}` — per-variant 3D iso render "
            "paths for the three-variants strip. Keys are "
            "`villageois|atelier|hybride_flex`."
        ),
    )
    gallery_tile_paths: dict[str, str] | None = Field(
        default=None,
        description=(
            "NanoBanana gallery tile paths keyed by theme "
            "(`atmosphere|materials|furniture|biophilic`). Used on the "
            "Atmosphere + Materials slides."
        ),
    )


class JustifySubOutput(BaseModel):
    name: str
    text: str
    tokens: dict[str, int]
    duration_ms: int


class JustifyResponse(BaseModel):
    argumentaire: str
    sub_outputs: list[JustifySubOutput]
    tokens: dict[str, int]
    pdf_id: str | None = None
    pptx_id: str | None = None
    # Iter-33 follow-up — the HTML→PDF "magazine" deck. Rendered via
    # Jinja2 + Tailwind-style CSS + headless Chromium, with embedded
    # NanoBanana / SketchUp imagery. Same content as `pptx_id`, different
    # typographic ceiling.
    magazine_pdf_id: str | None = None
    # Iter-33 follow-up v3 — when `magazine_pdf_id` is None, this
    # carries the reason (e.g. "RuntimeError: Headless Chromium not
    # found"). The frontend surfaces it as a toast so the user knows
    # why the Download button isn't there.
    magazine_pdf_error: str | None = None


_SUB_USER_TEMPLATE = """Client : {client_name} — language : {language}

<brief>
{brief}
</brief>

<programme>
{programme_markdown}
</programme>

<floor_plan>
{floor_plan_json}
</floor_plan>

<variant>
{variant_json}
</variant>

<resources_excerpts>
{resources}
</resources_excerpts>

Respond per your system instructions. Return only the Markdown block."""


_CONSOLIDATOR_USER = """Client : {client_name} — language : {language}

Sub-agent memos (concatenated in order Acoustic / Biophilic / Regulatory /
Programming) :

<sub_outputs>
{sub_outputs}
</sub_outputs>

Produce the consolidated argumentaire per your system instructions."""


@dataclass
class JustifySurface:
    orchestration: Orchestration

    def _sub_agent(self, name: str, prompt_file: str, max_tokens: int = 6000) -> SubAgent:
        return SubAgent(
            name=name,
            system_prompt=_read(PROMPTS_DIR / prompt_file),
            user_template=_SUB_USER_TEMPLATE,
            max_tokens=max_tokens,
        )

    def _consolidator_agent(self) -> SubAgent:
        return SubAgent(
            name="Consolidator",
            system_prompt=_read(PROMPTS_DIR / "justify_consolidator.md"),
            user_template=_CONSOLIDATOR_USER,
            max_tokens=8000,
        )

    def generate(self, req: JustifyRequest) -> JustifyResponse:
        agents = [
            ("Acoustic", self._sub_agent("Acoustic", "justify_acoustic.md"), RESOURCES_FOR_ACOUSTIC),
            ("Biophilic", self._sub_agent("Biophilic", "justify_biophilic.md"), RESOURCES_FOR_BIOPHILIC),
            ("Regulatory", self._sub_agent("Regulatory", "justify_regulatory.md"), RESOURCES_FOR_REGULATORY),
            ("Programming", self._sub_agent("Programming", "justify_programming.md"), RESOURCES_FOR_PROGRAMMING),
        ]

        floor_plan_json = req.floor_plan.model_dump_json()
        variant_json = req.variant.model_dump_json()
        base_ctx = {
            "client_name": req.client_name,
            "language": req.language,
            "brief": req.brief,
            "programme_markdown": req.programme_markdown,
            "floor_plan_json": floor_plan_json,
            "variant_json": variant_json,
        }

        def _run(name: str, agent: SubAgent, resource_files: list[str]) -> tuple[str, object]:
            ctx = dict(base_ctx)
            ctx["resources"] = _load_resources(resource_files)
            return name, self.orchestration.run_subagent(agent, ctx, tag="justify.research")

        with ThreadPoolExecutor(max_workers=len(agents)) as pool:
            futures = [pool.submit(_run, n, a, r) for n, a, r in agents]
            results = [f.result() for f in futures]

        sub_outputs = [
            JustifySubOutput(
                name=name,
                text=out.text,
                tokens={"input": out.input_tokens, "output": out.output_tokens},
                duration_ms=out.duration_ms,
            )
            for name, out in results
        ]

        consolidator = self._consolidator_agent()
        consolidator_ctx = dict(base_ctx)
        consolidator_ctx["sub_outputs"] = "\n\n---\n\n".join(
            f"# {s.name}\n\n{s.text}" for s in sub_outputs
        )
        cons_out = self.orchestration.run_subagent(
            consolidator, consolidator_ctx, tag="justify.consolidate"
        )

        sub_outputs.append(
            JustifySubOutput(
                name=cons_out.name,
                text=cons_out.text,
                tokens={"input": cons_out.input_tokens, "output": cons_out.output_tokens},
                duration_ms=cons_out.duration_ms,
            )
        )

        total_in = sum(s.tokens["input"] for s in sub_outputs)
        total_out = sum(s.tokens["output"] for s in sub_outputs)

        pdf_id = _render_client_pdf(
            client_name=req.client_name,
            variant=req.variant,
            argumentaire_markdown=cons_out.text,
        )
        pptx_id: str | None = None
        try:
            from app.surfaces.justify_pptx import render_pitch_deck

            # Pull tagline + palette + materials + furniture from the mood-board
            # curator JSON when available. Shape mirrors MoodBoardResponse.selection
            # (see `app/surfaces/moodboard.py`) : header.tagline,
            # atmosphere.palette[{name, hex, role}], materials[], furniture[].
            mb = req.mood_board_selection or {}
            tagline_mb = None
            palette_hexes_mb: list[str] = []
            materials_mb: list[dict] = []
            furniture_mb: list[dict] = []
            if isinstance(mb, dict):
                tagline_mb = (mb.get("header") or {}).get("tagline")
                palette_list = (mb.get("atmosphere") or {}).get("palette") or []
                for sw in palette_list:
                    if isinstance(sw, dict) and sw.get("hex"):
                        palette_hexes_mb.append(str(sw["hex"]))
                raw_mat = mb.get("materials") or []
                raw_fur = mb.get("furniture") or []
                materials_mb = [m for m in raw_mat if isinstance(m, dict)]
                furniture_mb = [f for f in raw_fur if isinstance(f, dict)]

            pptx = render_pitch_deck(
                client_name=req.client_name,
                variant=req.variant,
                argumentaire_markdown=cons_out.text,
                client_logo_data_url=req.client_logo_data_url,
                sketchup_iso_path=req.sketchup_iso_path,
                tagline=tagline_mb,
                palette_hexes=palette_hexes_mb or None,
                programme_markdown=req.programme_markdown,
                other_variants=req.other_variants,
                sketchup_iso_by_style=req.sketchup_iso_by_style,
                gallery_tile_paths=req.gallery_tile_paths,
                materials=materials_mb or None,
                furniture=furniture_mb or None,
            )
            pptx_id = pptx.pptx_id
        except Exception:  # noqa: BLE001
            # PowerPoint is a bonus artefact — if python-pptx is missing or the
            # renderer hiccups on a weird input, leave `pptx_id` None so the
            # PDF path still succeeds.
            pptx_id = None

        # Iter-33 follow-up — render the HTML→PDF magazine deck.
        # Headless Chromium prints take ~6-12 s ; we run after the
        # other artefacts are committed so a Chromium failure leaves
        # pdf+pptx intact.
        #
        # Iter-33 follow-up v3 — the previous bare `except Exception`
        # swallowed every error silently (missing browser, font CDN
        # down, malformed input, ImportError after a partial deploy).
        # Saad observed the symptom : "Compose pitch deck reruns but
        # no PDF appears" — because magazine_pdf_id silently became
        # None. We now log the exception with class + message so the
        # next failure shows up in the server logs and on the fresh
        # response (via a `magazine_pdf_error` field for the frontend
        # to surface if needed).
        magazine_pdf_id: str | None = None
        magazine_pdf_error: str | None = None
        try:
            from app.surfaces.justify_html_pdf import render_magazine_pdf

            magazine = render_magazine_pdf(
                client_name=req.client_name,
                variant=req.variant,
                argumentaire_markdown=cons_out.text,
                project_reference=None,
                sketchup_iso_path=req.sketchup_iso_path,
                tagline=tagline_mb,
                palette_hexes=palette_hexes_mb or None,
                programme_markdown=req.programme_markdown,
                other_variants=req.other_variants,
                sketchup_iso_by_style=req.sketchup_iso_by_style,
                gallery_tile_paths=req.gallery_tile_paths,
                materials=materials_mb or None,
                furniture=furniture_mb or None,
            )
            magazine_pdf_id = magazine.pdf_id
            log.info(
                "magazine pdf rendered: client=%s variant=%s pdf_id=%s "
                "bytes=%d gallery_tiles=%d other_variants=%d",
                req.client_name,
                req.variant.style.value,
                magazine.pdf_id,
                magazine.bytes,
                len(req.gallery_tile_paths or {}),
                len(req.other_variants or []),
            )
        except Exception as exc:  # noqa: BLE001
            magazine_pdf_error = f"{type(exc).__name__}: {exc}"
            log.exception(
                "magazine pdf render failed: client=%s variant=%s — %s",
                req.client_name,
                req.variant.style.value,
                magazine_pdf_error,
            )

        return JustifyResponse(
            argumentaire=cons_out.text,
            sub_outputs=sub_outputs,
            tokens={"input": total_in, "output": total_out},
            pdf_id=pdf_id,
            pptx_id=pptx_id,
            magazine_pdf_id=magazine_pdf_id,
            magazine_pdf_error=magazine_pdf_error,
        )


def compile_default_surface() -> JustifySurface:
    return JustifySurface(orchestration=Orchestration(client=ClaudeClient()))


# ---------------------------------------------------------------------------
# PDF generation — ReportLab
# ---------------------------------------------------------------------------


def _render_client_pdf(
    *, client_name: str, variant: VariantOutput, argumentaire_markdown: str
) -> str:
    """Render the consolidated argumentaire to an A4 PDF. Returns the `pdf_id`
    used to retrieve it via GET /api/justify/pdf/{pdf_id}.
    """

    from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        HRFlowable,
        PageBreak,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
    )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pdf_id = hashlib.sha1(
        f"{client_name}:{variant.style.value}:{argumentaire_markdown[:500]}".encode("utf-8")
    ).hexdigest()[:16]
    pdf_path = OUT_DIR / f"{pdf_id}.pdf"

    styles = getSampleStyleSheet()
    base_font = "Helvetica"

    # Organic Modern palette — ivory paper feel even in print.
    # ink #1C1F1A · forest #2F4A3F · sand #C9B79C · ink-soft #2F3330.
    hero_style = ParagraphStyle(
        "DOHero",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=24,
        leading=30,
        textColor="#1C1F1A",
        spaceAfter=6,
    )
    eyebrow_style = ParagraphStyle(
        "DOEyebrow",
        parent=styles["Normal"],
        fontName="Courier-Bold",
        fontSize=9,
        leading=11,
        textColor="#2F4A3F",
        spaceAfter=12,
    )
    h2_style = ParagraphStyle(
        "DOH2",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=19,
        textColor="#1C1F1A",
        spaceBefore=14,
        spaceAfter=6,
    )
    h3_style = ParagraphStyle(
        "DOH3",
        parent=styles["Heading3"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        textColor="#2F3330",
        spaceBefore=10,
        spaceAfter=4,
    )
    body_style = ParagraphStyle(
        "DOBody",
        parent=styles["BodyText"],
        fontName=base_font,
        fontSize=10.5,
        leading=14.5,
        textColor="#1C1F1A",
        alignment=TA_JUSTIFY,
        spaceAfter=6,
    )
    bullet_style = ParagraphStyle(
        "DOBullet",
        parent=body_style,
        leftIndent=14,
        bulletIndent=0,
        alignment=TA_LEFT,
    )

    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2.2 * cm,
        bottomMargin=2 * cm,
        title=f"Archoff — {client_name}",
        author="Archoff",
    )

    story: list = []
    story.append(Paragraph("Archoff — client argumentaire", eyebrow_style))
    story.append(Paragraph(f"{client_name} · variant « {variant.title} »", hero_style))
    story.append(
        Paragraph(
            f"Parti: {variant.style.value.replace('_', ' ')} · {variant.metrics.workstation_count} desks · "
            f"flex ratio {variant.metrics.flex_ratio_applied:.2f} · "
            f"total programmed ≈ {round(variant.metrics.total_programmed_m2)} m²",
            body_style,
        )
    )
    story.append(Spacer(1, 6))
    story.append(HRFlowable(color="#C9B79C", thickness=0.7, width="100%"))
    story.append(Spacer(1, 12))

    for block in _markdown_blocks(argumentaire_markdown):
        kind, text = block
        if kind == "h1":
            story.append(Paragraph(text, hero_style))
        elif kind == "h2":
            story.append(Paragraph(text, h2_style))
        elif kind == "h3":
            story.append(Paragraph(text, h3_style))
        elif kind == "bullet":
            story.append(Paragraph("• " + text, bullet_style))
        elif kind == "rule":
            story.append(HRFlowable(color="#C9B79C", thickness=0.4, width="100%"))
            story.append(Spacer(1, 6))
        elif kind == "pagebreak":
            story.append(PageBreak())
        else:
            story.append(Paragraph(text, body_style))

    doc.build(story)
    return pdf_id


def pdf_path_for(pdf_id: str) -> Path | None:
    candidate = OUT_DIR / f"{pdf_id}.pdf"
    return candidate if candidate.exists() else None


def _markdown_blocks(md: str) -> list[tuple[str, str]]:
    """Very small Markdown → block iterator : headings, bullets, paragraphs,
    rules. No nested lists, no code blocks — the consolidator output is
    clean.
    """

    blocks: list[tuple[str, str]] = []
    buffer: list[str] = []

    def flush_paragraph() -> None:
        if buffer:
            text = " ".join(b.strip() for b in buffer).strip()
            if text:
                blocks.append(("p", _inline_md_to_rl(text)))
        buffer.clear()

    for raw_line in md.splitlines():
        line = raw_line.rstrip()
        if not line.strip():
            flush_paragraph()
            continue
        if line.startswith("# "):
            flush_paragraph()
            blocks.append(("h1", _inline_md_to_rl(line[2:].strip())))
        elif line.startswith("## "):
            flush_paragraph()
            blocks.append(("h2", _inline_md_to_rl(line[3:].strip())))
        elif line.startswith("### "):
            flush_paragraph()
            blocks.append(("h3", _inline_md_to_rl(line[4:].strip())))
        elif line.startswith("- "):
            flush_paragraph()
            blocks.append(("bullet", _inline_md_to_rl(line[2:].strip())))
        elif line.startswith("* "):
            flush_paragraph()
            blocks.append(("bullet", _inline_md_to_rl(line[2:].strip())))
        elif line.strip() == "---":
            flush_paragraph()
            blocks.append(("rule", ""))
        else:
            buffer.append(line)
    flush_paragraph()
    return blocks


def _inline_md_to_rl(text: str) -> str:
    """Translate the subset of inline Markdown we emit into ReportLab HTML
    tags. Bold **x** → <b>x</b>, italic *x* → <i>x</i>, links [t](u) →
    <link href="u" color="#2F4A3F">t</link>, inline code `c` → <font
    face="Courier">c</font>.
    """

    import re

    def bold(m: re.Match[str]) -> str:
        return f"<b>{m.group(1)}</b>"

    def italic(m: re.Match[str]) -> str:
        return f"<i>{m.group(1)}</i>"

    def code(m: re.Match[str]) -> str:
        return f'<font face="Courier">{m.group(1)}</font>'

    def link(m: re.Match[str]) -> str:
        label = m.group(1)
        url = m.group(2).replace("&", "&amp;")
        return f'<link href="{url}" color="#2F4A3F">{label}</link>'

    # Escape XML-reserved before inserting tags, but preserve our own tags afterwards.
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"\*\*(.+?)\*\*", bold, text)
    text = re.sub(r"(?<!\*)\*([^*\n]+?)\*(?!\*)", italic, text)
    text = re.sub(r"`([^`]+)`", code, text)
    text = re.sub(r"\[([^\]]+?)\]\(([^)]+?)\)", link, text)
    return text
