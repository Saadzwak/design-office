"""Visual Mood Board — iter-17 C.

The existing `moodboard.py` ships a lovingly composed A3 PDF (palette
swatches, material picks, furniture callouts, sources). This module
adds a second artefact alongside it : a Pinterest-style composite
image rendered by NanoBanana Pro on fal.ai.

The prompt composer is deliberately rich — Saad's directive explicitly
said the visual must reflect the macro-zoning, micro-zoning AND the
underlying MoodBoardResponse selection. The generated image is therefore
a projection of the whole project's creative brief, not a decoration.

Caching happens inside `NanoBananaClient` (disk + sha256 key), so the
same prompt + industry + retained variant never pays twice.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models import VariantOutput
from app.services.nanobanana_client import (
    GeneratedImage,
    NanoBananaClient,
    NanoBananaError,
)


BACKEND_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = BACKEND_ROOT / "data" / "generated_images"

Industry = Literal[
    "tech_startup",
    "law_firm",
    "bank_insurance",
    "consulting",
    "creative_agency",
    "healthcare",
    "public_sector",
    "other",
]


# Each industry gets a curated "mood register" that steers the model
# away from generic stock photography. These are real design-world
# references the model will recognise.
INDUSTRY_REGISTER: dict[str, str] = {
    "tech_startup": (
        "contemporary Scandinavian office, warm oak floors, plants, "
        "soft linen curtains, Muuto Fiber chairs, Vitra Eames lounges, "
        "exposed concrete ceiling, paper pendants, natural daylight, "
        "brass fixtures, calm not cluttered"
    ),
    "law_firm": (
        "London partnership office, Farrow & Ball Card Room Green "
        "panelling, Dinesen Douglas floors, walnut bookcases, brass "
        "library lamps, bouclé reading chairs, heritage library mood, "
        "editorial stillness, antique rug, no tech visible"
    ),
    "bank_insurance": (
        "refined banking floor, charcoal oak, brushed bronze, cool "
        "natural stone, Scandi conference tables, wool-felt acoustic "
        "panels, soft indirect lighting, leather bound benches, "
        "quiet confidence, muted sage"
    ),
    "consulting": (
        "New York boutique consultancy, travertine reception, nordic "
        "oak, deep navy accents, Hay About-A-Chairs, Vitra side tables, "
        "archival prints, generous whitespace, soft overhead light"
    ),
    "creative_agency": (
        "Berlin creative studio, plaster walls, Kiln terracotta floor "
        "tile, raw plywood shelving, mohair bouclé seating, Acid yellow "
        "highlight, Mutina Margarita tiles, dieter rams-era lighting, "
        "art books, lived-in energy"
    ),
    "healthcare": (
        "contemporary clinic workspace, warm white walls, light birch, "
        "soft green accents, Arper upholstery, plants, artwork that "
        "reads as reassuring, diffuse daylight, matte finishes"
    ),
    "public_sector": (
        "civic office interior, sturdy oak, Bauhaus-era ergonomic "
        "chairs, cork pinboards, linoleum floors, readable signage in "
        "sans-serif, acoustic felt in warm grey"
    ),
    "other": (
        "neutral contemporary office, Organic Modern palette, warm oak, "
        "paper pendants, olive-green accents, terracotta details"
    ),
}


# Variant style → atmospheric cue. These translate the three macro-
# zoning archetypes into visual direction.
VARIANT_ATMOSPHERE: dict[str, str] = {
    "villageois": (
        "team neighbourhood feel — rooms organised around a central "
        "plaza with social collab at the core, warm wood cladding, "
        "biophilic planters, generous pinboards"
    ),
    "atelier": (
        "quiet studio discipline — library-like focus stripes along "
        "the façade, collaboration tucked behind, long oak work "
        "surfaces, editorial calm"
    ),
    "hybride_flex": (
        "plug-and-play hybrid — modular furniture on casters, writable "
        "walls, brand-forward graphics, flexible light-cube seating, "
        "generous brand expression"
    ),
}


class VisualMoodBoardRequest(BaseModel):
    client_name: str = "Client"
    industry: Industry = "tech_startup"
    variant: VariantOutput
    # The upstream MoodBoardResponse.selection dict — palette swatches,
    # material picks, signature pieces. Optional ; if provided the
    # visual prompt inherits its palette hexes verbatim for consistency.
    mood_board_selection: dict[str, Any] | None = None
    macro_zoning_summary: str | None = None
    micro_zoning_summary: str | None = None
    aspect_ratio: Literal["3:2", "16:9", "4:3", "1:1"] = "3:2"
    brand_keywords: list[str] = Field(default_factory=list)


class VisualMoodBoardResponse(BaseModel):
    visual_image_id: str
    path_rel: str  # relative to repo root, for serving
    cache_hit: bool
    model: str
    prompt: str
    aspect_ratio: str
    bytes_size: int


def _palette_hex_from_selection(selection: dict[str, Any] | None) -> list[str]:
    if not selection:
        return []
    atmosphere = selection.get("atmosphere") or {}
    palette = atmosphere.get("palette") if isinstance(atmosphere, dict) else None
    if not isinstance(palette, list):
        return []
    out: list[str] = []
    for entry in palette:
        hx = (entry or {}).get("hex") if isinstance(entry, dict) else None
        if isinstance(hx, str) and hx.startswith("#"):
            out.append(hx)
    return out[:6]


def _material_strings_from_selection(selection: dict[str, Any] | None) -> list[str]:
    if not selection:
        return []
    materials = selection.get("materials") or []
    out: list[str] = []
    if isinstance(materials, list):
        for m in materials[:5]:
            if not isinstance(m, dict):
                continue
            name = m.get("name") or m.get("label") or m.get("material")
            brand = m.get("brand") or ""
            if name:
                line = f"{brand} {name}".strip()
                out.append(line)
    return out


def compose_prompt(req: VisualMoodBoardRequest) -> str:
    """Build the NanoBanana text-to-image prompt from the full project
    context. Kept as a pure function so tests can assert the right
    inputs land in the prompt without hitting fal.ai.
    """

    register = INDUSTRY_REGISTER.get(req.industry, INDUSTRY_REGISTER["other"])
    atmosphere = VARIANT_ATMOSPHERE.get(
        str(req.variant.style.value if hasattr(req.variant.style, "value") else req.variant.style),
        "",
    )
    palette_hexes = _palette_hex_from_selection(req.mood_board_selection)
    materials = _material_strings_from_selection(req.mood_board_selection)
    brand_bits = ", ".join(req.brand_keywords) if req.brand_keywords else ""

    palette_line = (
        "Use exactly this palette as the image colour DNA — never drift: "
        + ", ".join(palette_hexes)
    ) if palette_hexes else "Organic Modern palette — warm ivory, forest green #2F4A3F, sand, sun yellow, clay terracotta"

    materials_line = (
        "Spotlight these real materials on visible surfaces: "
        + "; ".join(materials)
    ) if materials else ""

    macro = (req.macro_zoning_summary or "").strip()
    micro = (req.micro_zoning_summary or "").strip()
    context_block = ""
    if macro:
        context_block += f"\nMACRO-ZONING DIRECTION: {macro[:400]}"
    if micro:
        context_block += f"\nMICRO-ZONING DETAIL: {micro[:400]}"

    # The prompt is deliberately narrative. NanoBanana / Gemini 3 Pro
    # Image responds best to cinematic direction, not tag-soup.
    prompt = f"""A Pinterest-grade composite mood board for a {req.industry.replace('_', ' ')} office
fit-out — for {req.client_name}, retained variant "{req.variant.title}".
Magazine layout, asymmetric grid, negative space, not a collage
grid. Hand-laid feel, architect's studio table aesthetic.

ATMOSPHERE: {register}. {atmosphere}.

{palette_line}. {materials_line}
{context_block}

Place visible, legible elements (left-to-right, loosely):
- 2 hero photographs of office interiors (one wide establishing
  shot, one intimate detail of a desk / reading nook);
- a vertical strip of material swatches (wood, textile, stone,
  paint) with small hand-written labels;
- 3-4 signature furniture pieces on a soft shadow cast onto the
  surface (lounge chair, pendant lamp, table);
- a cluster of 3-5 paint-chip palette squares in the agreed hexes;
- 1 biophilic accent (a real plant, not illustrated);
- optional: a printed floor-plan fragment sketched with fine line
  weight, tucked in one corner.

STYLE DIRECTION: editorial, Kinfolk / Dwell / Wallpaper* magazine,
natural light from one side, subtle paper texture, no tiling, no
overlap glitches. No text captions, no watermarks, no logos. Sharp
focus. Image should read as arranged by a senior architect — not
as a stock collage.

Do NOT generate floor plans on the centre stage — this is the
atmosphere board, not the plan. {brand_bits}
"""
    return " ".join(prompt.split())  # collapse whitespace


@dataclass
class VisualMoodBoardSurface:
    client: NanoBananaClient

    def generate(
        self, req: VisualMoodBoardRequest
    ) -> VisualMoodBoardResponse:
        prompt = compose_prompt(req)
        try:
            image: GeneratedImage = self.client.text_to_image(
                prompt=prompt,
                aspect_ratio=req.aspect_ratio,
                num_images=1,
                output_format="png",
            )
        except NanoBananaError:
            raise

        # The generated_images folder sits under backend/app/data. We
        # serve it via a static route so the frontend can reference the
        # image by id.
        repo_root = BACKEND_ROOT.parent.parent
        try:
            path_rel = str(image.path.relative_to(repo_root))
        except ValueError:
            path_rel = str(image.path)

        return VisualMoodBoardResponse(
            visual_image_id=image.cache_key,
            path_rel=path_rel,
            cache_hit=image.from_cache,
            model=image.model,
            prompt=image.prompt,
            aspect_ratio=image.aspect_ratio,
            bytes_size=image.bytes_size,
        )


def compile_default_surface() -> VisualMoodBoardSurface:
    return VisualMoodBoardSurface(client=NanoBananaClient())


def generated_image_path(image_id: str) -> Path | None:
    """Resolve a cache id to an on-disk path. Used by the FastAPI
    static-file endpoint. Returns None if the id is unknown or unsafe.
    """

    # Whitelist: 32 hex chars only.
    if not image_id or len(image_id) != 32 or any(
        c not in "0123456789abcdef" for c in image_id
    ):
        return None
    path = OUT_DIR / f"{image_id}.png"
    return path if path.exists() else None
