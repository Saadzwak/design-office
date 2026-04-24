"""Domain models for the Design Office backend.

Everything the orchestrator, SketchUp client and API need to agree on lives
here. Keep it small, Pydantic v2, immutable by default.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class Point2D(BaseModel):
    x: float = Field(..., description="X in millimetres")
    y: float = Field(..., description="Y in millimetres")


class Polygon2D(BaseModel):
    points: list[Point2D] = Field(..., min_length=3)

    def bbox(self) -> tuple[float, float, float, float]:
        xs = [p.x for p in self.points]
        ys = [p.y for p in self.points]
        return (min(xs), min(ys), max(xs), max(ys))


class Column(BaseModel):
    center: Point2D
    radius_mm: float = Field(..., gt=0, description="Column radius in mm (0 = invisible).")
    square: bool = False
    label: str | None = None


class TechnicalCore(BaseModel):
    """Sanitary, shaft, elevator or riser enclosure."""

    kind: Literal["wc", "elevator", "shaft", "mep", "stair"]
    outline: Polygon2D
    label: str | None = None


class Window(BaseModel):
    """Window segment anchored on the enclosure polygon."""

    start: Point2D
    end: Point2D
    facade: Literal["north", "south", "east", "west", "unknown"] = "unknown"
    sill_height_mm: float | None = None
    note: str | None = None


class Door(BaseModel):
    center: Point2D
    width_mm: float = Field(..., gt=0)
    leaves: Literal["single", "double"] = "single"
    fire_rated: bool = False
    swing_side: Literal["left", "right", "both", "unknown"] = "unknown"
    label: str | None = None


class Stair(BaseModel):
    outline: Polygon2D
    connects_levels: list[int] = Field(default_factory=list)
    is_fire_escape: bool = False
    label: str | None = None


# ──────────────────────────── iter-21b — existing partitioning ────────────
# A real fit-out rarely lands on a bare plate. The "Lovable" residential-to-
# office conversion (Saad, 2026-04-24) has 6 apartments, and the LLM was
# laying zones randomly because it couldn't see them. These three models
# carry the existing interior geometry from Vision HD into the variant
# generator + the 2D viewer so reasoning and rendering both stop lying.


class Room(BaseModel):
    """A single enclosed interior cell of the plate, as-built.

    `label` is what the plan SAYS (e.g. "Chambre", "Lot 4", "Cuisine",
    "Open space"). `kind` is a semantic normalisation the variant
    generator can key off. `area_m2` is a hint — computed from the
    polygon when possible, else forwarded from Vision's estimate."""

    polygon: Polygon2D
    label: str | None = None
    kind: Literal[
        "room",
        "corridor",
        "wc",
        "kitchen",
        "stairwell",
        "terrace",
        "utility",
        "unknown",
    ] = "unknown"
    area_m2: float | None = None


class InteriorWall(BaseModel):
    """A straight wall segment INSIDE the envelope — a room divider, not
    the building envelope. Endpoints in mm in the plan-local frame."""

    start: Point2D
    end: Point2D
    thickness_mm: float = Field(default=150.0, gt=0)
    is_load_bearing: bool | None = None


class WallOpening(BaseModel):
    """A door or passage opening cut INTO an `InteriorWall`.

    `wall_index` references the `FloorPlan.interior_walls[]` list.
    `center` is the centre of the opening along the wall (still in mm
    in the plan-local frame). `width_mm` is the clear width."""

    wall_index: int | None = None
    center: Point2D
    width_mm: float = Field(default=900.0, gt=0)
    kind: Literal["door", "passage", "sliding", "double_door", "unknown"] = "door"


class FloorPlan(BaseModel):
    """Output of the PDF parsing pipeline, input to the variant generator."""

    level: int = 0
    name: str | None = None
    scale_unit: Literal["mm", "cm", "m"] = "mm"
    envelope: Polygon2D
    gross_area_m2: float | None = None
    net_area_m2: float | None = None
    columns: list[Column] = Field(default_factory=list)
    cores: list[TechnicalCore] = Field(default_factory=list)
    windows: list[Window] = Field(default_factory=list)
    doors: list[Door] = Field(default_factory=list)
    stairs: list[Stair] = Field(default_factory=list)
    # iter-21b — existing interior partitioning, when Vision sees it.
    # Default empty for back-compat with fixtures / tests that were built
    # against the shell-only schema.
    rooms: list[Room] = Field(default_factory=list)
    interior_walls: list[InteriorWall] = Field(default_factory=list)
    openings: list[WallOpening] = Field(default_factory=list)
    text_labels: list[str] = Field(default_factory=list)
    source_confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    source_notes: str | None = None
    # iter-21d (Phase B) — content-hash id of the source PDF, so the
    # testfit generator can locate the file on disk and drop it into
    # SketchUp as a reference layer underneath each variant. None when
    # the plan was synthesised (fixture) or came from a legacy path.
    plan_source_id: str | None = None
    # iter-21d — real-world envelope dimensions Vision derived at parse
    # time. Kept on the FloorPlan so downstream (MCP import_plan_pdf,
    # the Justify PPT export, etc.) doesn't have to re-compute.
    real_width_m: float | None = None
    real_height_m: float | None = None

    @field_validator("envelope")
    @classmethod
    def _envelope_closed(cls, v: Polygon2D) -> Polygon2D:
        if len(v.points) < 3:
            raise ValueError("Envelope needs at least 3 points.")
        return v

    def computed_area_m2(self) -> float:
        """Polygon area via the shoelace formula, returned in m²."""
        pts = self.envelope.points
        n = len(pts)
        area_mm2 = 0.0
        for i in range(n):
            a = pts[i]
            b = pts[(i + 1) % n]
            area_mm2 += a.x * b.y - b.x * a.y
        area_mm2 = abs(area_mm2) / 2.0
        return area_mm2 / 1_000_000.0


class VariantStyle(str, Enum):
    VILLAGEOIS = "villageois"
    ATELIER = "atelier"
    HYBRIDE_FLEX = "hybride_flex"


class VariantMetrics(BaseModel):
    """Summary metrics a Reviewer agent can check against the programme."""

    workstation_count: int
    meeting_room_count: int
    phone_booth_count: int
    collab_surface_m2: float
    amenity_surface_m2: float
    circulation_m2: float
    total_programmed_m2: float
    flex_ratio_applied: float
    notes: list[str] = Field(default_factory=list)


class AdjacencyViolation(BaseModel):
    """A single adjacency rule violation detected on a variant."""

    rule_id: str  # e.g. "acoustic.open_desks_next_to_boardroom"
    severity: Literal["info", "minor", "major", "critical"] = "minor"
    zones: list[str] = Field(
        default_factory=list,
        description="Zone labels or ids the rule involves (2+ typically).",
    )
    description: str  # human-readable statement of the violation
    suggestion: str = ""  # recommended correction
    source: str = ""  # citation e.g. "WELL Feature S02 — Sound Mapping"


class AdjacencyAudit(BaseModel):
    """Aggregate adjacency-rules score for a variant or a micro-zoning."""

    score: int = Field(
        100,
        ge=0,
        le=100,
        description="0 = catastrophic, 100 = textbook adjacencies.",
    )
    summary: str = ""
    violations: list[AdjacencyViolation] = Field(default_factory=list)
    # Non-blocking recommendations that aren't strict rule violations
    # (e.g. "consider moving plants along the south façade to mitigate glare").
    recommendations: list[str] = Field(default_factory=list)


class VariantOutput(BaseModel):
    """What a variant generator produces."""

    style: VariantStyle
    title: str
    narrative: str
    metrics: VariantMetrics
    sketchup_trace: list[dict] = Field(
        default_factory=list,
        description="Recorded tool calls to SketchUp MCP (mockable).",
    )
    screenshot_paths: list[str] = Field(default_factory=list)
    # iter-24 P1 (Saad, 2026-04-24) : URL relative to the backend root
    # that the frontend can plug directly into `<img src>`. None when no
    # screenshot was captured (mock backend, SketchUp down, or the
    # screenshot file was <1 KB — i.e. not a real render). Keeping
    # `screenshot_paths` alongside for backwards compat with older
    # fixtures + anything that still reads the raw disk path.
    sketchup_shot_url: str | None = None
    # iter-17 B : adjacency audit is optional so older fixtures
    # deserialize unchanged. Newly generated variants include it.
    adjacency_audit: AdjacencyAudit | None = None


# ──────────────────────────── Structured micro-zoning ──────────────────────
# iter-18i : the Claude Design frontend drill-down consumes a typed
# { zones: [{ n, name, surface_m2, icon, status, furniture[],
# materials[], acoustic, adjacency }] } payload. Adding a structured
# output alongside the existing markdown-based micro-zoning keeps the
# current consumers (Brief + regenerations history) working unchanged.


class StructuredFurniturePiece(BaseModel):
    """A furniture entry for a structured micro-zoning zone."""

    brand: str = ""
    name: str
    quantity: int = 1
    dimensions_mm: str = ""  # e.g. "160 × 80 cm" (free-form, rendered as-is)
    # Optional catalog link — when the agent cites a SKU from our furniture
    # catalog JSON it emits the id here so the UI can deep-link later.
    catalog_id: str | None = None


class StructuredMaterial(BaseModel):
    """A finish / material callout for a zone (floor / wall / ceiling etc.)."""

    surface: Literal["floor", "walls", "ceiling", "joinery", "textile", "other"] = "other"
    brand: str = ""
    name: str
    note: str = ""


class AcousticTarget(BaseModel):
    """Acoustic performance target for a zone."""

    rw_target_db: int | None = Field(
        default=None,
        description="Between-room airborne sound insulation index (dB).",
    )
    dnt_a_target_db: int | None = Field(
        default=None,
        description="Standardised level difference target (dB).",
    )
    tr60_target_s: float | None = Field(
        default=None,
        description="Reverberation time target in seconds (0.4 typical open-plan).",
    )
    source: str = ""  # e.g. "NF S 31-080 · performant"


class StructuredAdjacencyCheck(BaseModel):
    """Per-zone adjacency verdict for the micro-zoning drill-down."""

    ok: bool = True
    note: str = ""
    # Optional rule_id(s) from design://adjacency-rules that support the note.
    rule_ids: list[str] = Field(default_factory=list)


ZONE_ICON_ALIASES = {
    "presentation",  # boardroom, training room
    "layout-grid",   # open work
    "phone",         # phone booths
    "users",         # project room / collab
    "stairs",        # social stair
    "coffee",        # café, kitchenette
    "armchair",      # client lounge, informal
    "heart",         # wellness, mothers' room
    "leaf",          # biophilic
    "archive",       # lockers & post
    "sun",           # terrace
    "file-text",     # library / reading
    "mic",           # recording / studio
    "compass",       # reception
    "feather",       # creative / editorial
}


class StructuredZone(BaseModel):
    """A single drill-down zone used by the Micro view in the frontend."""

    n: int = Field(..., ge=1, description="1-indexed zone number; matches the 2D plan.")
    name: str  # e.g. "Boardroom", "Entry café"
    surface_m2: int = Field(..., ge=0)
    icon: str = Field(
        "file-text",
        description="Lucide/icon alias — frontend maps to a lucide-react symbol.",
    )
    status: Literal["ok", "warn", "error"] = "ok"
    furniture: list[StructuredFurniturePiece] = Field(default_factory=list)
    materials: list[StructuredMaterial] = Field(default_factory=list)
    acoustic: AcousticTarget | None = None
    adjacency: StructuredAdjacencyCheck = Field(
        default_factory=StructuredAdjacencyCheck
    )
    narrative: str = ""  # one-paragraph description for the drawer


class StructuredMicroZoningResponse(BaseModel):
    """Typed response of POST /api/testfit/microzoning/structured."""

    variant_style: VariantStyle
    zones: list[StructuredZone] = Field(default_factory=list)
    markdown: str = ""  # human-readable narrative, reuses iter-17 micro markdown
    tokens: dict[str, int] = Field(default_factory=dict)
    duration_ms: int = 0


class ReviewerVerdict(BaseModel):
    style: VariantStyle
    pmr_ok: bool
    erp_ok: bool
    programme_coverage_ok: bool
    issues: list[str] = Field(default_factory=list)
    verdict: Literal["approved", "approved_with_notes", "rejected"] = "approved"


class TestFitResponse(BaseModel):
    floor_plan: FloorPlan
    variants: list[VariantOutput]
    verdicts: list[ReviewerVerdict]
    tokens: dict[str, int] = Field(default_factory=dict)
