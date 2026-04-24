"""LLM-facing Pydantic schemas for the tool_use migration (iter-23).

These models describe what Claude MUST emit via the `tool_use` API for
each structured agent. They are deliberately separate from the runtime
domain models in `app.models` :

- `app.models.VariantOutput` carries runtime-only fields (sketchup_trace,
  screenshot_paths, adjacency_audit) filled in by the Python layer
  AFTER the LLM returns. We do NOT want Claude to fabricate those.
- `app.schemas.VariantLLMOutput` is the lean shape Claude fills — just
  style, title, narrative, zones, metrics.

Every schema uses Pydantic v2. Call `model_json_schema()` on the class
to get the JSON Schema dict we pass to `StructuredSubAgent.output_schema`.

Style notes :
- Every field has a clear `description=` ; Claude reads those and they
  shape its output more than any prose in the system prompt.
- Unknown fields are rejected (`model_config = ConfigDict(extra="forbid")`)
  so Claude can't slip an extra "meta" or "confidence" field through.
- Zones use a FLAT discriminator-by-`kind` shape, not a proper
  discriminated union, because Anthropic's tool schema enforcer
  historically struggled with `oneOf` across heterogeneous shapes.
  Every zone field past `kind` is optional ; the Python replay filters
  by kind. Pragmatic, not elegant, but bulletproof.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# ----------------------------------------------------------------------------
# Shared leaf types
# ----------------------------------------------------------------------------


class PointLL(BaseModel):
    """Simple [x, y] mm pair. Claude sometimes emits objects, sometimes
    tuples — we accept lists in the schema and convert Python-side."""

    model_config = ConfigDict(extra="forbid")

    x: float
    y: float


# ----------------------------------------------------------------------------
# Test Fit — Parti Pris Proposer
# ----------------------------------------------------------------------------


class PartiPrisLLMEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(..., description="Short snake_case identifier for this parti pris.")
    title: str = Field(
        ..., description="Short evocative name in the client's language, 3–6 words."
    )
    one_line: str = Field(
        ..., description="One sentence summarising the bet, ≤ 160 chars."
    )
    directive: str = Field(
        ...,
        description=(
            "5–10 sentences describing how the plate reads — zone placement, "
            "flow, the hero move, the quiet places. Written so a variant "
            "generator can execute it on the plate."
        ),
    )
    signature_moves: list[str] = Field(
        ...,
        description="3 to 5 concrete macro-zoning decisions the variant must honour.",
        min_length=3,
        max_length=5,
    )
    trade_off: str = Field(
        ..., description="What this parti pris gives up. One sentence."
    )
    style_classification: Literal["villageois", "atelier", "hybride_flex"] = Field(
        ...,
        description=(
            "Which geometric family this parti pris belongs to. The backend "
            "routes it to the matching variant generator."
        ),
    )


class PartiPrisLLMOutput(BaseModel):
    """What the Parti Pris Proposer emits.

    Forces exactly 3 partis_pris with distinct ids + style_classifications
    so each variant slot gets one.
    """

    model_config = ConfigDict(extra="forbid")

    partis_pris: list[PartiPrisLLMEntry] = Field(
        ...,
        description="Exactly 3 project-tailored partis pris.",
        min_length=3,
        max_length=3,
    )


# ----------------------------------------------------------------------------
# Test Fit — Variant generator
# ----------------------------------------------------------------------------
# Flat discriminator-by-kind for zones. Every non-`kind` field is optional.
# The downstream `_replay_zones` filters by kind to call the right MCP tool.


class VariantZoneLLM(BaseModel):
    """One entity emitted by the variant generator.

    Union-by-kind with all fields optional. Consumers filter by `kind`
    (see `_replay_zones` in testfit.py).
    """

    model_config = ConfigDict(extra="forbid")

    kind: Literal[
        "workstation_cluster",
        "meeting_room",
        "phone_booth",
        "partition_wall",
        "collab_zone",
        "biophilic_zone",
        "place_human",
        "place_plant",
        "place_hero",
        "apply_variant_palette",
    ] = Field(..., description="Zone type. Drives which fields below are used.")

    # workstation_cluster
    origin_mm: list[float] | None = Field(
        None, description="[x, y] in mm for cluster origin / hero placement."
    )
    orientation_deg: float | None = Field(
        None, description="Rotation in degrees (0, 90, 180 or 270 typically)."
    )
    count: int | None = Field(None, description="Number of desks in a cluster.")
    row_spacing_mm: int | None = Field(None, description="Desk row spacing, default 1600.")
    product_id: str | None = Field(
        None, description="Catalogue product id (see furniture/catalog.json)."
    )

    # meeting_room
    corner1_mm: list[float] | None = Field(None, description="[x, y] mm, first corner.")
    corner2_mm: list[float] | None = Field(None, description="[x, y] mm, opposite corner.")
    capacity: int | None = Field(None, description="Meeting-room capacity (2, 4, 8, 12…).")
    name: str | None = Field(None, description="Human-readable room name.")
    table_product: str | None = Field(None, description="Catalogue id of the table.")

    # phone_booth / place_human / place_plant / place_hero
    position_mm: list[float] | None = Field(
        None, description="[x, y] mm for a point-placed entity."
    )

    # partition_wall
    start_mm: list[float] | None = Field(None, description="[x, y] mm, wall start.")
    end_mm: list[float] | None = Field(None, description="[x, y] mm, wall end.")
    kind_value: (
        Literal["acoustic", "glazed", "semi_glazed", "removed"] | None
    ) = Field(
        None,
        description=(
            "Partition wall type. `removed` flags an existing wall the "
            "variant opens (merge). Use this verb for KEEP/MERGE reasoning."
        ),
    )

    # collab_zone
    bbox_mm: list[float] | None = Field(
        None, description="[x0, y0, x1, y1] mm, axis-aligned bbox."
    )
    style_value: (
        Literal["cafe", "lounge", "townhall", "huddle_cluster", "library"] | None
    ) = Field(None, description="Collab-zone style. Drives SketchUp material tint.")

    # place_human
    pose: Literal["standing", "seated", "walking", "female"] | None = Field(
        None, description="Human pose variant. Drives the Ruby primitive shape."
    )

    # place_plant
    species: Literal["ficus_lyrata", "monstera", "pothos", "dracaena"] | None = Field(
        None, description="Plant species. Drives canopy radius + default colour."
    )

    # place_hero
    slug: str | None = Field(
        None,
        description=(
            "Hero slug : `chair_office`, `chair_lounge`, `desk_bench_1600`, "
            "`table_boardroom_4000`, `framery_one`, `sofa_mags`."
        ),
    )

    # apply_variant_palette
    walls: list[int] | None = Field(
        None, description="[R, G, B] 0-255 for wall material tint."
    )
    floor: list[int] | None = Field(None, description="[R, G, B] 0-255 for floor material.")
    accent: list[int] | None = Field(None, description="[R, G, B] 0-255 for accent material.")

    # common on all entities
    color_rgb: list[int] | None = Field(
        None,
        description="[R, G, B] 0-255 colour override for heroes (human / plant / chair / table).",
    )


class VariantMetricsLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workstation_count: int = Field(..., ge=0)
    meeting_room_count: int = Field(..., ge=0)
    phone_booth_count: int = Field(..., ge=0)
    collab_surface_m2: float = Field(..., ge=0)
    amenity_surface_m2: float = Field(..., ge=0)
    circulation_m2: float = Field(..., ge=0)
    total_programmed_m2: float = Field(..., ge=0)
    flex_ratio_applied: float = Field(..., ge=0, le=1.5)
    notes: list[str] = Field(default_factory=list, max_length=20)


class VariantLLMOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    style: Literal["villageois", "atelier", "hybride_flex"]
    title: str = Field(
        ...,
        description=(
            "Variant title — echo the parti pris' TITLE in the client's "
            "vocabulary. Do NOT emit a generic 'Villageois' / 'Atelier' / "
            "'Hybride Flex' label."
        ),
    )
    narrative: str = Field(
        ...,
        description=(
            "3 to 5 paragraphs, 800-1200 words MAX. The architect's briefing. "
            "Reference existing rooms by label, cite resources, name the "
            "trade-off openly."
        ),
    )
    zones: list[VariantZoneLLM] = Field(
        ...,
        description=(
            "Every MCP operation the variant executes. Workstations + "
            "meeting rooms + phone booths + partition walls + collab zones "
            "+ biophilic zones + hero entities (humans, plants, furniture) "
            "+ exactly one apply_variant_palette."
        ),
    )
    metrics: VariantMetricsLLM = Field(
        ..., description="Summary metrics the Reviewer checks against the programme."
    )


# ----------------------------------------------------------------------------
# Test Fit — Reviewer
# ----------------------------------------------------------------------------


class ReviewerLLMOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    style: Literal["villageois", "atelier", "hybride_flex"]
    pmr_ok: bool = Field(..., description="PMR circulation ≥ 1.40 m, WC adapté present.")
    erp_ok: bool = Field(..., description="Issues de secours + désenfumage compliant.")
    programme_coverage_ok: bool = Field(
        ..., description="Workstation count + meeting-room count within ±5 % of programme."
    )
    issues: list[str] = Field(
        default_factory=list,
        description="Per-issue bullets, one sentence each.",
        max_length=20,
    )
    verdict: Literal["approved", "approved_with_notes", "rejected"] = Field(
        ..., description="Overall verdict for the variant."
    )


# ----------------------------------------------------------------------------
# Test Fit — Adjacency Validator
# ----------------------------------------------------------------------------


class AdjacencyViolationLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rule_id: str = Field(..., description="Rule identifier from adjacency-rules.md.")
    severity: Literal["critical", "major", "minor", "info"]
    zones: list[str] = Field(
        ...,
        description="Zone names from the variant trace (1-3 entries).",
        min_length=1,
        max_length=3,
    )
    description: str = Field(
        ..., description="≤ 30 words, plain French or English. No jargon."
    )
    suggestion: str = Field(..., description="≤ 25 words, imperative sentence.")
    source: str = Field(
        ..., description="Short citation (WELL v2 Feature S02, NF S 31-080, …)."
    )


class AdjacencyAuditLLMOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    score: int = Field(..., ge=0, le=100, description="Overall score 0-100.")
    summary: str = Field(
        ...,
        description="One-sentence take on the variant's adjacencies. ≤ 160 chars.",
    )
    violations: list[AdjacencyViolationLLM] = Field(
        default_factory=list, max_length=10
    )
    recommendations: list[str] = Field(
        default_factory=list,
        description="Up to 3 generic recommendations beyond the enumerated violations.",
        max_length=3,
    )


# ----------------------------------------------------------------------------
# Test Fit — Iterate (natural-language variant modification)
# ----------------------------------------------------------------------------
# Same shape as VariantLLMOutput — the iterate agent produces a NEW
# variant payload that replaces the previous one.


IterateLLMOutput = VariantLLMOutput


# ----------------------------------------------------------------------------
# Test Fit — Micro-zoning (structured drill-down per zone)
# ----------------------------------------------------------------------------


class MicroZoningFurniturePieceLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str
    brand: str | None = None
    model: str | None = None
    quantity: int = Field(default=1, ge=1)
    note: str | None = None


class MicroZoningMaterialLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    surface: Literal["floor", "walls", "ceiling", "joinery", "textile", "other"]
    material: str
    finish: str | None = None
    note: str | None = None


class MicroZoningAcousticLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_dnta_db: float | None = None
    target_tr60_s: float | None = None
    strategy: str | None = None


class MicroZoningAdjacencyLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    wants: list[str] = Field(default_factory=list)
    avoids: list[str] = Field(default_factory=list)


class MicroZoningZoneLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    n: int = Field(..., ge=1, description="1-based sequence number.")
    name: str
    surface_m2: float = Field(..., ge=0)
    icon: str | None = None
    status: Literal["keep", "merge", "repurpose", "new"] = "new"
    furniture: list[MicroZoningFurniturePieceLLM] = Field(default_factory=list)
    materials: list[MicroZoningMaterialLLM] = Field(default_factory=list)
    acoustic: MicroZoningAcousticLLM | None = None
    adjacency: MicroZoningAdjacencyLLM | None = None
    narrative: str | None = None


class MicroZoningLLMOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    zones: list[MicroZoningZoneLLM] = Field(..., min_length=3, max_length=30)


# ----------------------------------------------------------------------------
# Mood Board — Curator
# ----------------------------------------------------------------------------


class MoodBoardPaletteSwatchLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    hex: str = Field(..., description="Hex colour `#RRGGBB`.")
    role: str | None = None


class MoodBoardHeaderLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tagline: str | None = None
    industry_note: str | None = None


class MoodBoardAtmosphereLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hero_image_theme: str | None = None
    palette: list[MoodBoardPaletteSwatchLLM] = Field(
        default_factory=list, max_length=6
    )


class MoodBoardMaterialLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    material: str
    finish: str | None = None
    application: str | None = None
    note: str | None = None


class MoodBoardFurnitureLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    brand: str | None = None
    type: str | None = None
    product_id: str | None = None
    note: str | None = None


class MoodBoardPlantingSpeciesLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    light: str | None = None
    care: str | None = None
    note: str | None = None


class MoodBoardPlantingLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    strategy: str | None = None
    species: list[MoodBoardPlantingSpeciesLLM] = Field(default_factory=list)


class MoodBoardLightFixtureLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    brand: str | None = None
    model: str | None = None
    category: str | None = None
    application: str | None = None


class MoodBoardLightLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    strategy: str | None = None
    fixtures: list[MoodBoardLightFixtureLLM] = Field(default_factory=list)


class MoodBoardLLMOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    header: MoodBoardHeaderLLM | None = None
    atmosphere: MoodBoardAtmosphereLLM | None = None
    materials: list[MoodBoardMaterialLLM] = Field(default_factory=list)
    furniture: list[MoodBoardFurnitureLLM] = Field(default_factory=list)
    planting: MoodBoardPlantingLLM | None = None
    light: MoodBoardLightLLM | None = None


# ----------------------------------------------------------------------------
# Vision PDF extractor
# ----------------------------------------------------------------------------


class VisionEnvelopeDimensionsLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    width_m: float = Field(..., ge=0)
    height_m: float = Field(..., ge=0)
    source: Literal["scale_label", "inferred", "unknown"] = "unknown"
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class VisionOrientationArrowLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str | None = None
    from_px: list[float] | None = None
    to_px: list[float] | None = None


class VisionColumnLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cx: float
    cy: float
    r: float


class VisionCoreLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["elevator", "wc", "shaft", "mep", "stair", "unknown"] = "unknown"
    points_px: list[list[float]] = Field(..., min_length=3)
    label: str | None = None


class VisionWindowLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x1: float
    y1: float
    x2: float
    y2: float
    facade: Literal["north", "south", "east", "west", "unknown"] = "unknown"
    style: Literal["single", "double", "curtain_wall", "unknown"] | None = None


class VisionDoorLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    center_px: list[float]
    width_px: float = Field(..., ge=0)
    leaves: Literal["single", "double"] = "single"
    swing_side: Literal["left", "right", "both", "unknown"] = "unknown"
    fire_rated: bool = False


class VisionStairLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    points_px: list[list[float]] = Field(..., min_length=3)
    direction_hint: Literal["up", "down", "both", "unknown"] = "unknown"
    is_fire_escape: bool = False


class VisionRoomLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    points_px: list[list[float]] = Field(..., min_length=3)
    label: str | None = None
    kind: Literal[
        "room", "corridor", "wc", "kitchen", "stairwell", "terrace",
        "utility", "unknown",
    ] = "unknown"
    area_hint_m2: float | None = None


class VisionInteriorWallLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x1: float
    y1: float
    x2: float
    y2: float
    thickness_hint_mm: float | None = None
    is_load_bearing_hint: bool | None = None


class VisionOpeningLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    center_px: list[float]
    width_px: float = Field(..., ge=0)
    kind: Literal["door", "passage", "sliding", "double_door", "unknown"] = "door"
    in_wall_index_hint: int | None = None


class VisionTextLabelLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    center_px: list[float]
    purpose: Literal[
        "room_name", "dimension", "scale", "orientation", "other"
    ] = "other"


class VisionSymbolLLM(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal[
        "wc", "sink", "compass", "title_block", "section_cut", "unknown"
    ] = "unknown"
    center_px: list[float]


class VisionPDFLLMOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scale_label: str | None = None
    envelope_real_dimensions_m: VisionEnvelopeDimensionsLLM
    orientation_arrow: VisionOrientationArrowLLM | None = None
    envelope_points_px: list[list[float]] = Field(..., min_length=3)
    columns_px: list[VisionColumnLLM] = Field(default_factory=list)
    cores: list[VisionCoreLLM] = Field(default_factory=list)
    windows_px: list[VisionWindowLLM] = Field(default_factory=list)
    doors_px: list[VisionDoorLLM] = Field(default_factory=list)
    stairs_px: list[VisionStairLLM] = Field(default_factory=list)
    rooms_px: list[VisionRoomLLM] = Field(default_factory=list)
    interior_walls_px: list[VisionInteriorWallLLM] = Field(default_factory=list)
    openings_px: list[VisionOpeningLLM] = Field(default_factory=list)
    text_labels: list[VisionTextLabelLLM] = Field(default_factory=list)
    symbols_detected: list[VisionSymbolLLM] = Field(default_factory=list)
    uncertainties: list[str] = Field(default_factory=list)


# ----------------------------------------------------------------------------
# Justify — per-agent research output + consolidator
# ----------------------------------------------------------------------------
# The research agents emit markdown today. Keeping them as text is fine :
# the downstream PDF renderer reads markdown. We only migrate
# structured-JSON agents.


# ----------------------------------------------------------------------------
# Brief — programme synthesiser
# ----------------------------------------------------------------------------
# Brief today is consolidated markdown, not JSON. No migration needed.


__all__ = [
    # Parti pris
    "PartiPrisLLMEntry",
    "PartiPrisLLMOutput",
    # Variant
    "VariantZoneLLM",
    "VariantMetricsLLM",
    "VariantLLMOutput",
    # Reviewer + Adjacency
    "ReviewerLLMOutput",
    "AdjacencyViolationLLM",
    "AdjacencyAuditLLMOutput",
    # Iterate
    "IterateLLMOutput",
    # Micro-zoning
    "MicroZoningLLMOutput",
    # Mood board
    "MoodBoardLLMOutput",
    # Vision
    "VisionPDFLLMOutput",
]
