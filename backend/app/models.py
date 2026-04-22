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
    text_labels: list[str] = Field(default_factory=list)
    source_confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    source_notes: str | None = None

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
