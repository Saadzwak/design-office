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
    # Iter-30B Stage 2 — `direction` is the slug of one of the three
    # hardcoded mood-board directions for the project's industry
    # (e.g. tech_startup → atelier-nord | studio-tokyo | loft-parisien).
    # When set, the direction's palette REPLACES the curator's palette
    # in every NanoBanana prompt, and the parti_pris narrative is
    # injected as the `atmosphere_cue` overlay. Same curator selection
    # rendered through three distinct directions = three visually
    # different mood boards (Vitra chair photographed under three
    # different ambient palettes). Backwards-compatible: when None,
    # the legacy single-direction flow runs untouched.
    direction: str | None = None


class VisualMoodBoardResponse(BaseModel):
    visual_image_id: str
    path_rel: str  # relative to repo root, for serving
    cache_hit: bool
    model: str
    prompt: str
    aspect_ratio: str
    bytes_size: int


# ──────────────────────────────────── direction overlays (iter-30B/2) ─

_DIRECTIONS_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "moodboard" / "directions.json"
)

# Default 3-direction set used when an industry has no specific entry
# in `directions.json`. Keeps the schema simple and the demo
# defensive against industries we haven't tuned yet.
_DEFAULT_DIRECTIONS: list[dict[str, Any]] = [
    {
        "slug": "calm-warm",
        "name": "Calm & Warm",
        "tagline": "Oak, linen, brass. Editorial calm.",
        "parti_pris": "Organic Modern editorial — warm oak floors, linen curtains, brass detailing, ivory canvas walls, single forest-green accent. Library-quiet. Reference: Kinfolk magazine offices.",
        "palette_overlay": [
            {"name": "Linen ivory", "hex": "#F2ECE0", "role": "hero"},
            {"name": "Pale oak", "hex": "#CDB28A", "role": "hero"},
            {"name": "Forest green", "hex": "#2F4A3F", "role": "accent"},
            {"name": "Ink soft", "hex": "#2A2E28", "role": "secondary"},
            {"name": "Brushed brass", "hex": "#A88A4F", "role": "highlight"},
        ],
        "atmosphere_cue": "warm oak, linen, brass, forest-green accent, editorial calm",
        "lighting_cue": "soft north daylight, warm 3000 K accents",
    },
    {
        "slug": "minimal-mono",
        "name": "Minimal Mono",
        "tagline": "Plaster, charcoal, the silence between objects.",
        "parti_pris": "Minimal Japanese-inflected workshop — hand-troweled lime plaster walls, charcoal accents, charred-cedar shelving, indigo as the single coloured note. Reference: Tadao Ando + Aesop.",
        "palette_overlay": [
            {"name": "Lime plaster", "hex": "#E5DFD3", "role": "hero"},
            {"name": "Charcoal sumi", "hex": "#2C2A26", "role": "secondary"},
            {"name": "Yakisugi cedar", "hex": "#3A2D24", "role": "secondary"},
            {"name": "Washi rice", "hex": "#F1ECDF", "role": "hero"},
            {"name": "Indigo accent", "hex": "#2A4A66", "role": "accent"},
        ],
        "atmosphere_cue": "lime plaster, charred cedar, washi screens, indigo banner, monastic silence",
        "lighting_cue": "diffused through washi, 2700 K Akari pendants",
    },
    {
        "slug": "library-paris",
        "name": "Library Paris",
        "tagline": "Walnut, emerald, brass. Quiet authority.",
        "parti_pris": "Haussmannian library reframed — herringbone walnut floors, emerald moulded panels, brushed-brass library lamps, cream stucco. Reference: Pierre Yovanovitch.",
        "palette_overlay": [
            {"name": "Cream stucco", "hex": "#EDE6D5", "role": "hero"},
            {"name": "Walnut burl", "hex": "#5A3E29", "role": "secondary"},
            {"name": "Emerald panel", "hex": "#2D4A3A", "role": "accent"},
            {"name": "Brushed brass", "hex": "#A88A4F", "role": "highlight"},
            {"name": "Ink atelier", "hex": "#231F1A", "role": "secondary"},
        ],
        "atmosphere_cue": "herringbone walnut, emerald panels, brass library lamps, oxblood Cassina chairs",
        "lighting_cue": "tungsten library lamps 2700 K, brass cone shades, deep cast shadows",
    },
]


def _load_directions_for(industry: str) -> list[dict[str, Any]]:
    """Read `data/moodboard/directions.json` and return the 3 directions
    for the given industry, falling back to `_DEFAULT_DIRECTIONS` when
    the industry has no tuned entry. Always returns exactly three
    direction dicts so the frontend tab UI is deterministic.
    """

    import json as _json

    if not _DIRECTIONS_PATH.exists():
        return _DEFAULT_DIRECTIONS
    try:
        data = _json.loads(_DIRECTIONS_PATH.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001 — defensive ; never crash the surface
        return _DEFAULT_DIRECTIONS
    industries = data.get("industries") or {}
    found = industries.get(industry)
    if isinstance(found, list) and len(found) >= 3:
        return found[:3]
    return _DEFAULT_DIRECTIONS


def list_directions_for(industry: str) -> list[dict[str, Any]]:
    """Public surface for the frontend — exposes the 3 directions
    (slug, name, tagline, palette_overlay) so the tab UI can render
    them without re-implementing the JSON read on the JS side.
    Strips the heavier `parti_pris` / `atmosphere_cue` / `lighting_cue`
    that only matter inside the prompt assembly.
    """

    out: list[dict[str, Any]] = []
    for d in _load_directions_for(industry):
        out.append(
            {
                "slug": str(d.get("slug", "")),
                "name": str(d.get("name", "")),
                "tagline": str(d.get("tagline", "")),
                "palette_overlay": list(d.get("palette_overlay", [])),
            }
        )
    return out


def _resolve_direction(
    industry: str, slug: str | None
) -> dict[str, Any] | None:
    """Look up the full direction dict (palette + parti_pris + cues)
    for `(industry, slug)`. Returns None when no slug is requested —
    the caller then falls back to the legacy single-direction flow.
    """

    if not slug:
        return None
    for d in _load_directions_for(industry):
        if str(d.get("slug")) == slug:
            return d
    # Unknown slug → fall through to legacy. Don't raise: the frontend
    # may have stale state, and the worst case is a default render.
    return None


def _palette_hexes_from_direction(direction: dict[str, Any] | None) -> list[str]:
    if not direction:
        return []
    pal = direction.get("palette_overlay") or []
    out: list[str] = []
    for entry in pal:
        hx = (entry or {}).get("hex") if isinstance(entry, dict) else None
        if isinstance(hx, str) and hx.startswith("#"):
            out.append(hx)
    return out[:6]


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


def _furniture_strings_from_selection(
    selection: dict[str, Any] | None,
) -> list[str]:
    if not selection:
        return []
    furn = selection.get("furniture") or []
    out: list[str] = []
    if isinstance(furn, list):
        for f in furn[:6]:
            if not isinstance(f, dict):
                continue
            name = f.get("name") or f.get("model") or ""
            brand = f.get("brand") or ""
            if name:
                out.append(f"{brand} {name}".strip())
    return out


def _planting_strings_from_selection(
    selection: dict[str, Any] | None,
) -> list[str]:
    if not selection:
        return []
    p = selection.get("planting")
    if isinstance(p, dict):
        species = p.get("species") or []
        out: list[str] = []
        for s in species[:5] if isinstance(species, list) else []:
            if isinstance(s, str):
                out.append(s)
            elif isinstance(s, dict):
                nm = s.get("name") or s.get("latin") or s.get("common_name")
                if nm:
                    out.append(nm)
        return out
    if isinstance(p, list):
        return [
            str(x) if isinstance(x, str) else str((x or {}).get("name") or "")
            for x in p[:5]
        ]
    return []


def _light_sentence_from_selection(
    selection: dict[str, Any] | None,
) -> str:
    if not selection:
        return ""
    light = selection.get("light") or {}
    if isinstance(light, dict):
        strategy = light.get("strategy") or ""
        kelvin = light.get("temperature_kelvin") or ""
        parts = [s for s in [kelvin, strategy] if s]
        return " · ".join(parts)
    return ""


def _tagline_from_selection(selection: dict[str, Any] | None) -> str:
    if not selection:
        return ""
    header = selection.get("header") or {}
    if isinstance(header, dict):
        return str(header.get("tagline") or "").strip()
    return ""


def compose_prompt(req: VisualMoodBoardRequest) -> str:
    """Build the NanoBanana text-to-image prompt from the full project
    context. Iter-20d (Saad #26) : fuses MORE of the moodboard_curator
    output into the prompt — every palette hex, every material + brand,
    every signature furniture piece + brand, planting species, light
    strategy and Kelvin, plus the tagline verbatim. A richer prompt
    steers NanoBanana into a scene that looks like THIS project, not a
    generic stock mood board.
    """

    register = INDUSTRY_REGISTER.get(req.industry, INDUSTRY_REGISTER["other"])
    atmosphere = VARIANT_ATMOSPHERE.get(
        str(req.variant.style.value if hasattr(req.variant.style, "value") else req.variant.style),
        "",
    )
    # Iter-30B Stage 2 — direction overlay REPLACES the curator palette
    # and augments the atmosphere line with a parti-pris cue. When no
    # direction is supplied the legacy single-direction flow runs
    # untouched (palette comes from the curator selection).
    direction = _resolve_direction(req.industry, req.direction)
    direction_palette = _palette_hexes_from_direction(direction)
    palette_hexes = direction_palette or _palette_hex_from_selection(
        req.mood_board_selection
    )
    if direction:
        atmosphere_cue = str(direction.get("atmosphere_cue") or "").strip()
        parti_pris = str(direction.get("parti_pris") or "").strip()
        if atmosphere_cue:
            atmosphere = (
                f"{atmosphere_cue} — {atmosphere}" if atmosphere else atmosphere_cue
            )
        if parti_pris:
            atmosphere = f"{atmosphere}. PARTI PRIS: {parti_pris}"
    materials = _material_strings_from_selection(req.mood_board_selection)
    furniture = _furniture_strings_from_selection(req.mood_board_selection)
    planting = _planting_strings_from_selection(req.mood_board_selection)
    light = _light_sentence_from_selection(req.mood_board_selection)
    tagline = _tagline_from_selection(req.mood_board_selection)
    brand_bits = ", ".join(req.brand_keywords) if req.brand_keywords else ""

    palette_line = (
        "Use exactly this palette as the image colour DNA — never drift: "
        + ", ".join(palette_hexes)
    ) if palette_hexes else "Organic Modern palette — warm ivory, forest green #2F4A3F, sand, sun yellow, clay terracotta"

    materials_line = (
        "Spotlight these real materials on visible surfaces: "
        + "; ".join(materials)
    ) if materials else ""

    furniture_line = (
        "Include hints of these signature furniture pieces: "
        + "; ".join(furniture)
    ) if furniture else ""

    planting_line = (
        "Biophilic accents — real plants in the frame: "
        + ", ".join(planting)
    ) if planting else ""

    light_line = f"Lighting direction: {light[:240]}." if light else ""

    macro = (req.macro_zoning_summary or "").strip()
    micro = (req.micro_zoning_summary or "").strip()
    context_block = ""
    if tagline:
        context_block += f"\nPROJECT TAGLINE (the feeling to match): \"{tagline}\""
    if macro:
        context_block += f"\nMACRO-ZONING DIRECTION: {macro[:400]}"
    if micro:
        context_block += f"\nMICRO-ZONING DETAIL: {micro[:400]}"

    prompt = f"""A Pinterest-grade composite mood board for a {req.industry.replace('_', ' ')} office
fit-out — for {req.client_name}, retained variant "{req.variant.title}".
Magazine layout, asymmetric grid, negative space, not a collage
grid. Hand-laid feel, architect's studio table aesthetic.

ATMOSPHERE: {register}. {atmosphere}.

{palette_line}. {materials_line}
{furniture_line}
{planting_line}
{light_line}
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


# ──────────────────────────────────────────────── gallery (iter-20d) ──

def _gallery_prompts(
    req: VisualMoodBoardRequest,
) -> list[tuple[str, str]]:
    """Four themed sub-prompts — one per tile in the MoodBoard Pinterest
    collage. Returns `[(label, prompt)]` so the caller can tag the
    resulting image ids by tile type. Saad #26/#27 : every prompt
    pulls from the full curator Selection JSON so NanoBanana paints
    THIS project, not a generic mood board.
    """

    # Iter-30B Stage 2 — direction overlay REPLACES the curator
    # palette. The four gallery tiles are the strongest signal of a
    # direction's identity (atmosphere hero is the "what does this
    # office *feel* like" image), so the overlay is most impactful
    # here.
    direction = _resolve_direction(req.industry, req.direction)
    direction_palette = _palette_hexes_from_direction(direction)
    palette = direction_palette or _palette_hex_from_selection(
        req.mood_board_selection
    )
    materials = _material_strings_from_selection(req.mood_board_selection)
    furniture = _furniture_strings_from_selection(req.mood_board_selection)
    planting = _planting_strings_from_selection(req.mood_board_selection)
    light = _light_sentence_from_selection(req.mood_board_selection)
    tagline = (
        str(direction.get("tagline") or "") if direction else ""
    ) or _tagline_from_selection(req.mood_board_selection)
    industry = req.industry.replace("_", " ")
    parti_pris_bit = (
        f"PARTI PRIS: {str(direction.get('parti_pris') or '').strip()[:400]} "
        if direction
        else ""
    )
    atmosphere_cue_bit = (
        f"ATMOSPHERE: {str(direction.get('atmosphere_cue') or '').strip()[:240]}. "
        if direction
        else ""
    )
    direction_lighting = (
        str(direction.get("lighting_cue") or "").strip() if direction else ""
    )

    palette_str = (
        ", ".join(palette)
        or "warm ivory, forest green #2F4A3F, sand, sun yellow, clay terracotta"
    )
    style_footer = (
        "Editorial, Kinfolk / Dwell / Wallpaper* magazine style, sharp focus, "
        "natural light from one side, subtle paper texture, no text captions, "
        "no watermarks, no logos, no overlap glitches, no stock-photo gloss."
    )

    tagline_bit = f'Feeling: "{tagline}". ' if tagline else ""
    effective_light = direction_lighting or (light[:180] if light else "")
    light_bit = f"Lighting: {effective_light[:200]}. " if effective_light else ""
    materials_str = "; ".join(materials[:6]) or (
        "oak, linen, brass, plaster, acoustic felt"
    )
    furniture_str = "; ".join(furniture[:5]) or (
        "a bouclé lounge chair, an oak conference table, a paper pendant, a task chair"
    )
    planting_str = ", ".join(planting[:4]) or (
        "Ficus lyrata, Monstera deliciosa, Kentia palm"
    )
    hero_background = palette[0] if palette else "warm ivory"

    atmosphere_prompt = (
        f"Hero atmosphere shot of a {industry} office interior for "
        f'{req.client_name} — "{req.variant.title}". '
        f"{atmosphere_cue_bit}"
        f"{parti_pris_bit}"
        f"{tagline_bit}"
        f"Wide establishing composition, deep perspective, daylight, "
        f"real architectural space — not a rendering. "
        f"Palette (exact hexes, hold the line): {palette_str}. "
        f"{light_bit}"
        f"{style_footer}"
    )
    materials_prompt = (
        f"Material tableau — laid flat on an architect's studio table. "
        f"{atmosphere_cue_bit}"
        f"Swatches and samples of: {materials_str}. "
        f"Palette reference: {palette_str}. "
        f"Overhead three-quarter angle, warm cast shadow, fine labels "
        f"optional. {style_footer}"
    )
    furniture_prompt = (
        f"Editorial still-life of the signature furniture pieces for "
        f"{req.client_name}: {furniture_str}. "
        f"{atmosphere_cue_bit}"
        f"Studio backdrop in {hero_background}, single-source daylight. "
        f"{style_footer}"
    )
    biophilic_prompt = (
        f"Biophilic corner of the space — real plants in the frame: "
        f"{planting_str}. "
        f"{atmosphere_cue_bit}"
        f"{light_bit}"
        f"Wood + plaster + greenery composition, quiet morning light. "
        f"Palette: {palette_str}. {style_footer}"
    )

    return [
        ("atmosphere", atmosphere_prompt),
        ("materials", materials_prompt),
        ("furniture", furniture_prompt),
        ("biophilic", biophilic_prompt),
    ]


class GalleryTile(BaseModel):
    label: str  # "atmosphere" / "materials" / "furniture" / "biophilic"
    visual_image_id: str
    path_rel: str
    cache_hit: bool
    prompt: str


class VisualMoodBoardGalleryResponse(BaseModel):
    tiles: list[GalleryTile]
    hero: VisualMoodBoardResponse | None = None
    total_bytes: int = 0
    cache_hits: int = 0


# ──────────────────────────────────────── per-item tiles (iter-30B) ──
# The 4-tile gallery (atmosphere/materials/furniture/biophilic) gives
# the *overall* mood-board hero collage. Iter-30B adds a SECOND layer
# of imagery: one editorial photograph per item in the selection
# (each material, each piece of furniture, each plant, each fixture).
# These replace the hatched <Placeholder> tiles in the frontend
# Pinterest collage and are embedded in the A3 PDF so the document
# finally carries real product photography instead of swatches.
#
# Prompts are tightly scoped to a single object on a neutral
# studio backdrop, in the project's palette. NanoBanana cache keys
# stay stable across reruns — same item + same palette = same image.

ITEM_STYLE_FOOTER = (
    "Editorial product photography, Kinfolk / Wallpaper* / Dwell magazine "
    "aesthetic, single-source soft north daylight, gentle warm cast "
    "shadow, 50mm lens equivalent, sharp focus, subtle paper or linen "
    "texture, neutral matte studio backdrop. No text. No captions. "
    "No watermarks. No logos. No graphics. No floating UI elements. "
    "No collage glitches. One subject only — clean centred composition."
)


def _slug(s: str) -> str:
    """Lowercase ASCII slug — keep [a-z0-9] + hyphens only.

    Iter-30B: this is intentionally ASCII-restricted (not `.isalnum()`)
    so it stays in lock-step with the frontend `slugifyItemKey()`
    helper in `frontend/src/routes/MoodBoard.tsx`. Python's
    `.isalnum()` accepts Unicode letters (`é`, `ñ`, `ç` …) but the
    JS regex `/[a-z0-9]/` does not — divergence would silently miss
    item-key lookups for any client / brand name with accents.
    Both helpers normalise non-alnum to a single `-` and strip
    leading/trailing dashes.
    """

    if not s:
        return ""
    out: list[str] = []
    last_dash = False
    for ch in s.lower():
        if ("a" <= ch <= "z") or ("0" <= ch <= "9"):
            out.append(ch)
            last_dash = False
        elif not last_dash:
            out.append("-")
            last_dash = True
    return "".join(out).strip("-")


def _palette_str(palette_hexes: list[str]) -> str:
    return (
        ", ".join(palette_hexes[:5])
        if palette_hexes
        else "warm ivory, forest green, sand, terracotta accent"
    )


def _material_item_key(item: dict[str, Any]) -> str:
    mat = item.get("material") or item.get("name") or ""
    finish = item.get("finish") or ""
    return f"mat:{_slug(mat)}:{_slug(finish)}".rstrip(":")


def _furniture_item_key(item: dict[str, Any]) -> str:
    brand = item.get("brand") or ""
    name = item.get("name") or item.get("model") or ""
    pid = item.get("product_id") or ""
    if pid:
        return f"fur:{_slug(pid)}"
    parts = [p for p in (_slug(brand), _slug(name)) if p]
    return f"fur:{'-'.join(parts)}" if parts else ""


def _plant_item_key(item: dict[str, Any]) -> str:
    name = item.get("name") or item.get("latin") or ""
    slug = _slug(name)
    return f"pla:{slug}" if slug else ""


def _light_item_key(item: dict[str, Any]) -> str:
    brand = item.get("brand") or ""
    model = item.get("model") or ""
    parts = [p for p in (_slug(brand), _slug(model)) if p]
    return f"lig:{'-'.join(parts)}" if parts else ""


def _direction_cue_str(direction: dict[str, Any] | None) -> str:
    """Iter-30B Stage 2 — `Direction: <slug> — <atmosphere_cue>` line
    that gets baked into every per-item prompt. This is what makes
    the same Vitra chair photograph differently for `atelier-nord`
    vs `studio-tokyo` — the cue appears verbatim in the prompt and
    the cue plus the (different) palette together push NanoBanana
    toward the requested mood. Returns empty when no direction is in
    play (legacy single-direction flow).
    """

    if not direction:
        return ""
    slug = str(direction.get("slug") or "").strip()
    cue = str(direction.get("atmosphere_cue") or "").strip()
    name = str(direction.get("name") or "").strip()
    label = name or slug
    if not (label and cue):
        return ""
    return f"Direction — {label}: {cue[:200]}. "


def _material_prompt(
    item: dict[str, Any],
    palette_str: str,
    direction: dict[str, Any] | None = None,
) -> str:
    # Schema field is `material` (curator output) but fixtures and some
    # legacy paths use `name`. Same for `note`/`sustainability`/etc.
    mat = (item.get("material") or item.get("name") or "").strip()
    finish = (item.get("finish") or "").strip()
    application = (item.get("application") or "").strip()
    note = (item.get("note") or item.get("sustainability") or "").strip()
    brand = (item.get("brand") or "").strip()
    product_ref = (item.get("product_ref") or "").strip()
    head_pieces = [p for p in (brand, mat) if p]
    head = " ".join(head_pieces) or "material sample"
    if finish:
        head = f"{head} — {finish}"
    context_bits = []
    if product_ref:
        context_bits.append(f"reference: {product_ref}")
    if application:
        context_bits.append(f"used as {application}")
    if note:
        context_bits.append(note[:140])
    context = ". ".join(context_bits)
    direction_cue = _direction_cue_str(direction)
    return (
        f"Close-up material sample of {head}. "
        f"Single rectangular swatch laid flat on a neutral linen-toned "
        f"surface, 3/4 overhead angle, fine pencil-line label optional "
        f"but no readable text. Show authentic surface texture: grain, "
        f"weave, brush marks, or polish — whatever is true to {mat or head}. "
        f"{context} "
        f"{direction_cue}"
        f"Project palette context (for ambient cast tones): {palette_str}. "
        f"{ITEM_STYLE_FOOTER}"
    )


def _furniture_prompt(
    item: dict[str, Any],
    palette_str: str,
    direction: dict[str, Any] | None = None,
) -> str:
    brand = (item.get("brand") or "").strip()
    name = (item.get("name") or item.get("model") or "").strip()
    typ = (
        item.get("type") or item.get("category") or item.get("quantity_hint") or ""
    ).strip()
    note = (
        item.get("note")
        or item.get("dimensions")
        or item.get("product_ref")
        or ""
    ).strip()
    head_pieces = [p for p in (brand, name) if p]
    head = " ".join(head_pieces) or "design furniture piece"
    typ_bit = f", a {typ}" if typ else ""
    note_bit = f" {note[:160]}" if note else ""
    direction_cue = _direction_cue_str(direction)
    return (
        f"Studio product photograph of {head}{typ_bit}. "
        f"3/4 angle, isolated against a soft warm-grey plaster backdrop, "
        f"cast shadow falling left, single-source north daylight. "
        f"Material truth: faithful to the real {head} — correct "
        f"silhouette, finish, upholstery, proportions. No stylisation, "
        f"no fantasy variations.{note_bit} "
        f"{direction_cue}"
        f"Ambient palette: {palette_str}. "
        f"{ITEM_STYLE_FOOTER}"
    )


def _plant_prompt(
    item: dict[str, Any],
    palette_str: str,
    direction: dict[str, Any] | None = None,
) -> str:
    name = (item.get("name") or item.get("latin") or "").strip()
    light = (item.get("light") or "").strip()
    care = (item.get("care") or "").strip()
    light_bit = f" Lighting matches its habitat: {light}." if light else ""
    care_bit = f" {care[:120]}" if care else ""
    direction_cue = _direction_cue_str(direction)
    return (
        f"Editorial photograph of a single living {name} in a textured "
        f"unglazed terracotta pot. Set against a warm linen or plaster "
        f"backdrop, soft north daylight, sharp foliage detail, intimate "
        f"composition with breathing room around the plant.{light_bit}{care_bit} "
        f"{direction_cue}"
        f"Ambient palette: {palette_str}. "
        f"{ITEM_STYLE_FOOTER}"
    )


def _light_prompt(
    item: dict[str, Any],
    palette_str: str,
    direction: dict[str, Any] | None = None,
) -> str:
    brand = (item.get("brand") or "").strip()
    model = (item.get("model") or "").strip()
    category = (item.get("category") or "").strip()
    application = (item.get("application") or "").strip()
    head = f"{brand} {model}".strip() or category or "pendant lamp"
    cat_bit = f", a {category}" if category else ""
    app_bit = f" Use case in space: {application}." if application else ""
    direction_cue = _direction_cue_str(direction)
    return (
        f"Editorial product photograph of {head}{cat_bit}. "
        f"Isolated against a neutral warm plaster wall, the lamp itself "
        f"powered on softly so the shade or bulb glows, soft three-quarter "
        f"daylight from the side. Faithful to the real {brand} {model} — "
        f"correct silhouette, finish, proportions.{app_bit} "
        f"{direction_cue}"
        f"Ambient palette: {palette_str}. "
        f"{ITEM_STYLE_FOOTER}"
    )


def _item_tile_specs(
    req: VisualMoodBoardRequest,
) -> list[tuple[str, str, str, str]]:
    """Walk the curator selection and yield one tile spec per item.

    Returns `[(category, item_key, label, prompt)]` where:
    - `category` ∈ {"material", "furniture", "plant", "light"}
    - `item_key` is a stable canonical key for frontend lookup
    - `label` is the human-readable caption
    - `prompt` is the NanoBanana text-to-image prompt
    """

    sel = req.mood_board_selection or {}
    # Iter-30B Stage 2 — direction overlay REPLACES the curator
    # palette in every per-item prompt. Same Vitra chair, three
    # different ambient palettes ⇒ three distinct cache keys ⇒ three
    # visually distinct photographs.
    direction = _resolve_direction(req.industry, req.direction)
    direction_palette = _palette_hexes_from_direction(direction)
    palette_hexes = direction_palette or _palette_hex_from_selection(sel)
    palette_str = _palette_str(palette_hexes)

    specs: list[tuple[str, str, str, str]] = []
    seen: set[str] = set()

    def _push(cat: str, key: str, label: str, prompt: str) -> None:
        if not key or key in seen:
            return
        seen.add(key)
        specs.append((cat, key, label, prompt))

    materials = sel.get("materials") if isinstance(sel, dict) else None
    if isinstance(materials, list):
        for m in materials[:8]:
            if not isinstance(m, dict):
                continue
            mat_name = m.get("material") or m.get("name") or ""
            label = " · ".join(
                s for s in [mat_name, m.get("finish")] if s
            ) or "Material"
            _push(
                "material",
                _material_item_key(m),
                label,
                _material_prompt(m, palette_str, direction),
            )

    furniture = sel.get("furniture") if isinstance(sel, dict) else None
    if isinstance(furniture, list):
        for f in furniture[:8]:
            if not isinstance(f, dict):
                continue
            label = " ".join(
                s for s in [f.get("brand"), f.get("name") or f.get("model")] if s
            ) or "Piece"
            _push(
                "furniture",
                _furniture_item_key(f),
                label,
                _furniture_prompt(f, palette_str, direction),
            )

    planting = sel.get("planting") if isinstance(sel, dict) else None
    if isinstance(planting, dict):
        species = planting.get("species") or []
        if isinstance(species, list):
            for sp in species[:6]:
                if isinstance(sp, dict):
                    label = sp.get("name") or sp.get("latin") or "Plant"
                    _push(
                        "plant",
                        _plant_item_key(sp),
                        label,
                        _plant_prompt(sp, palette_str, direction),
                    )

    light = sel.get("light") if isinstance(sel, dict) else None
    if isinstance(light, dict):
        fixtures = light.get("fixtures") or []
        if isinstance(fixtures, list):
            for fx in fixtures[:5]:
                if not isinstance(fx, dict):
                    continue
                label = " ".join(
                    s for s in [fx.get("brand"), fx.get("model")] if s
                ) or fx.get("category") or "Fixture"
                _push(
                    "light",
                    _light_item_key(fx),
                    label,
                    _light_prompt(fx, palette_str, direction),
                )

    return specs


class ItemTile(BaseModel):
    category: Literal["material", "furniture", "plant", "light"]
    item_key: str
    label: str
    visual_image_id: str
    path_rel: str
    cache_hit: bool
    prompt: str


class VisualMoodBoardItemTilesResponse(BaseModel):
    tiles: list[ItemTile]
    total_bytes: int = 0
    cache_hits: int = 0
    skipped_errors: list[str] = Field(default_factory=list)


@dataclass
class VisualMoodBoardSurface:
    client: NanoBananaClient

    def generate_gallery(
        self, req: VisualMoodBoardRequest
    ) -> VisualMoodBoardGalleryResponse:
        """Iter-20d : produce the 4 themed tiles in one shot, caching
        each one on disk (NanoBanana client handles that internally).
        Returns in a stable `[atmosphere, materials, furniture,
        biophilic]` order so the frontend can map each to a fixed
        Pinterest-collage slot.
        """

        repo_root = BACKEND_ROOT.parent.parent
        tiles: list[GalleryTile] = []
        total_bytes = 0
        cache_hits = 0
        # Iter-33 follow-up — map the gallery slot label to the
        # category the NanoBanana client uses for sidecar tagging +
        # demo-fallback bucket lookup. Stops a "biophilic" slot from
        # accidentally being filled with a "materials" composition
        # (or vice versa) when the cache is partial.
        gallery_label_to_category = {
            "atmosphere": "gallery_atmosphere",
            "biophilic": "gallery_biophilic",
            "materials": "gallery_materials",
            "furniture": "gallery_furniture",
        }
        for label, prompt in _gallery_prompts(req):
            try:
                image: GeneratedImage = self.client.text_to_image(
                    prompt=prompt,
                    aspect_ratio=req.aspect_ratio,
                    num_images=1,
                    output_format="png",
                    category=gallery_label_to_category.get(label),
                    item_key=f"gallery:{label}",
                )
            except NanoBananaError:
                raise

            try:
                path_rel = str(image.path.relative_to(repo_root))
            except ValueError:
                path_rel = str(image.path)

            tiles.append(
                GalleryTile(
                    label=label,
                    visual_image_id=image.cache_key,
                    path_rel=path_rel,
                    cache_hit=image.from_cache,
                    prompt=image.prompt,
                )
            )
            total_bytes += image.bytes_size
            if image.from_cache:
                cache_hits += 1

        return VisualMoodBoardGalleryResponse(
            tiles=tiles,
            hero=None,  # first tile is already the atmosphere hero
            total_bytes=total_bytes,
            cache_hits=cache_hits,
        )

    def generate_item_tiles(
        self, req: VisualMoodBoardRequest
    ) -> VisualMoodBoardItemTilesResponse:
        """Iter-30B : produce ONE editorial product photograph per item
        in the curator selection (per material, per furniture piece,
        per plant, per light fixture).

        These replace the hatched <Placeholder tag="MATERIAL"/"PIECE">
        tiles in the frontend Pinterest collage and are embedded in the
        A3 PDF. NanoBanana caches each image by (model, prompt,
        aspect_ratio) sha256, so reruns of the same selection cost
        nothing.

        We use a 4:5 (portrait) aspect ratio for the tiles — closer to
        editorial product photo crops than the wide 3:2 hero. The
        frontend's `columnCount: 3` masonry layout handles the mixed
        ratios naturally.

        Errors per individual item are caught and reported in
        `skipped_errors` rather than aborting the whole batch — a
        single fal.ai timeout shouldn't kill 11 other tiles.
        """

        repo_root = BACKEND_ROOT.parent.parent
        tiles: list[ItemTile] = []
        total_bytes = 0
        cache_hits = 0
        skipped: list[str] = []
        item_aspect: Literal["3:2", "16:9", "4:3", "1:1"] = "4:3"

        for category, item_key, label, prompt in _item_tile_specs(req):
            try:
                image: GeneratedImage = self.client.text_to_image(
                    prompt=prompt,
                    aspect_ratio=item_aspect,
                    num_images=1,
                    output_format="png",
                    # Iter-33 follow-up — pass the per-item category
                    # ("material" / "furniture" / "plant" / "light") so
                    # the sidecar tags it correctly AND the demo
                    # fallback only picks images from the same category
                    # if there's no exact cache hit. Without this a
                    # "European oak" prompt could be served a plant
                    # photograph because the only filter was aspect.
                    category=category,
                    item_key=item_key,
                )
            except NanoBananaError as exc:
                skipped.append(f"{item_key}: {exc}")
                continue

            try:
                path_rel = str(image.path.relative_to(repo_root))
            except ValueError:
                path_rel = str(image.path)

            tiles.append(
                ItemTile(
                    category=category,  # type: ignore[arg-type]
                    item_key=item_key,
                    label=label,
                    visual_image_id=image.cache_key,
                    path_rel=path_rel,
                    cache_hit=image.from_cache,
                    prompt=image.prompt,
                )
            )
            total_bytes += image.bytes_size
            if image.from_cache:
                cache_hits += 1

        return VisualMoodBoardItemTilesResponse(
            tiles=tiles,
            total_bytes=total_bytes,
            cache_hits=cache_hits,
            skipped_errors=skipped,
        )

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
                category="hero_composite",
                item_key="hero",
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
