"""Iter-21b — regression tests for the interior-partitioning pipeline.

Covers the three new pixel→mm extractors and the two testfit summary
helpers. These are the new surfaces that can regress silently (Vision
JSON shape drift, coordinate-flip bugs, empty-list fallbacks)."""

from __future__ import annotations

import pytest

from app.models import (
    FloorPlan,
    InteriorWall,
    Point2D,
    Polygon2D,
    Room,
    WallOpening,
)
from app.pdf.parser import (
    _extract_interior_walls_from_vision,
    _extract_openings_from_vision,
    _extract_rooms_from_vision,
)
from app.surfaces.testfit import (
    _summarise_existing_rooms,
    _summarise_existing_walls,
)


# Image = 1000 × 1000 px, plate = 10 000 × 10 000 mm → 1 px = 10 mm.
IMG = (1000, 1000)
PLATE = (10_000.0, 10_000.0)


def _square_room_px(x0: int, y0: int, x1: int, y1: int) -> dict:
    return {
        "points_px": [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]],
        "label": "Lot 4",
        "kind": "room",
        "area_hint_m2": 18.0,
    }


def test_extract_rooms_rescales_and_flips_y() -> None:
    """Pixel-space Y runs top→bottom ; plan mm Y runs bottom→top. Must flip."""

    vision = {"rooms_px": [_square_room_px(100, 200, 300, 400)]}
    rooms = _extract_rooms_from_vision(vision, IMG, PLATE)
    assert len(rooms) == 1
    r = rooms[0]
    assert r.label == "Lot 4"
    assert r.kind == "room"
    xs = sorted(p.x for p in r.polygon.points)
    ys = sorted(p.y for p in r.polygon.points)
    # 100 px → 1000 mm, 300 px → 3000 mm on X.
    assert abs(xs[0] - 1000) < 1
    assert abs(xs[-1] - 3000) < 1
    # Y flip : px y=200 (top-ish) → mm y=8000 (top of plan, since plate=10000).
    # px y=400 → mm y=6000. So ys[0]=6000, ys[-1]=8000.
    assert abs(ys[0] - 6000) < 1
    assert abs(ys[-1] - 8000) < 1
    # Computed area = 200 × 200 px → 2000 × 2000 mm → 4 m².
    assert abs((r.area_m2 or 0) - 4.0) < 0.1


def test_extract_rooms_drops_tiny_polygons() -> None:
    """Sub-1 m² parasitic detections must be filtered."""

    vision = {
        "rooms_px": [
            # 50 × 50 px = 500 × 500 mm = 0.25 m² — drop.
            {"points_px": [[0, 0], [50, 0], [50, 50], [0, 50]], "label": "noise"},
            # 200 × 200 px = 2000 × 2000 mm = 4 m² — keep.
            _square_room_px(100, 100, 300, 300),
        ]
    }
    rooms = _extract_rooms_from_vision(vision, IMG, PLATE)
    assert len(rooms) == 1
    assert rooms[0].label == "Lot 4"


def test_extract_rooms_handles_missing_and_bad_shapes() -> None:
    """Must never crash on malformed Vision output."""

    # Vision returns empty or missing key → []
    assert _extract_rooms_from_vision({}, IMG, PLATE) == []
    assert _extract_rooms_from_vision({"rooms_px": []}, IMG, PLATE) == []
    # Malformed entries skipped individually.
    vision = {
        "rooms_px": [
            {"points_px": "not-a-list"},
            {"points_px": [[0, 0], [1, 1]]},  # only 2 points
            None,
            _square_room_px(100, 100, 300, 300),  # good
        ]
    }
    rooms = _extract_rooms_from_vision(vision, IMG, PLATE)
    assert len(rooms) == 1


def test_extract_interior_walls_filters_short_segments() -> None:
    vision = {
        "interior_walls_px": [
            {"x1": 100, "y1": 100, "x2": 102, "y2": 100},     # 20 mm — drop
            {"x1": 100, "y1": 100, "x2": 300, "y2": 100},     # 2000 mm — keep
            {"x1": 400, "y1": 200, "x2": 400, "y2": 500, "thickness_hint_mm": 80},
        ]
    }
    walls = _extract_interior_walls_from_vision(vision, IMG, PLATE)
    assert len(walls) == 2
    assert walls[1].thickness_mm == 80.0


def test_extract_interior_walls_clamps_thickness() -> None:
    """Thickness outside [50, 500] mm is unreasonable — clamp, don't trust."""

    vision = {
        "interior_walls_px": [
            {"x1": 0, "y1": 0, "x2": 200, "y2": 0, "thickness_hint_mm": 5},
            {"x1": 0, "y1": 100, "x2": 200, "y2": 100, "thickness_hint_mm": 10000},
        ]
    }
    walls = _extract_interior_walls_from_vision(vision, IMG, PLATE)
    assert walls[0].thickness_mm == 50.0
    assert walls[1].thickness_mm == 500.0


def test_extract_openings_validates_wall_index() -> None:
    """Out-of-range wall_index_hint must be coerced to None."""

    vision = {
        "openings_px": [
            {"center_px": [100, 100], "width_px": 80, "kind": "door", "in_wall_index_hint": 0},
            {"center_px": [200, 100], "width_px": 80, "kind": "passage", "in_wall_index_hint": 99},
            {"center_px": [300, 100], "width_px": 80, "kind": "door", "in_wall_index_hint": -1},
        ]
    }
    ops = _extract_openings_from_vision(vision, IMG, PLATE, wall_count=2)
    assert len(ops) == 3
    assert ops[0].wall_index == 0
    assert ops[1].wall_index is None  # 99 out of range
    assert ops[2].wall_index is None  # -1 rejected


def test_summarise_existing_rooms_renders_markdown_table() -> None:
    plan = _make_plan_with_rooms(
        [
            Room(
                polygon=Polygon2D(
                    points=[
                        Point2D(x=0, y=0),
                        Point2D(x=3000, y=0),
                        Point2D(x=3000, y=3000),
                        Point2D(x=0, y=3000),
                    ]
                ),
                label="Lot 4",
                kind="room",
                area_m2=9.0,
            ),
            Room(
                polygon=Polygon2D(
                    points=[
                        Point2D(x=4000, y=0),
                        Point2D(x=6000, y=0),
                        Point2D(x=6000, y=2000),
                        Point2D(x=4000, y=2000),
                    ]
                ),
                label="Cuisine",
                kind="kitchen",
                area_m2=4.0,
            ),
        ]
    )
    summary = _summarise_existing_rooms(plan)
    assert "idx | label" in summary
    assert "Lot 4" in summary
    assert "Cuisine" in summary
    assert "9.0" in summary


def test_summarise_existing_rooms_empty_fallback() -> None:
    plan = _make_plan_with_rooms([])
    summary = _summarise_existing_rooms(plan)
    assert "bare plate" in summary.lower()


def test_summarise_existing_walls_numbers_walls_and_openings() -> None:
    plan = _make_plan_with_rooms([])
    plan = plan.model_copy(
        update={
            "interior_walls": [
                InteriorWall(
                    start=Point2D(x=0, y=0),
                    end=Point2D(x=3000, y=0),
                    thickness_mm=120,
                    is_load_bearing=False,
                ),
                InteriorWall(
                    start=Point2D(x=0, y=0),
                    end=Point2D(x=0, y=3000),
                    thickness_mm=180,
                    is_load_bearing=True,
                ),
            ],
            "openings": [
                WallOpening(
                    wall_index=0,
                    center=Point2D(x=1500, y=0),
                    width_mm=900,
                    kind="door",
                )
            ],
        }
    )
    summary = _summarise_existing_walls(plan)
    assert "Interior walls" in summary
    assert "Openings" in summary
    # Numbering must be 0-based so the prompt can reference wall idx.
    assert "- 0 |" in summary
    assert "- 1 |" in summary
    # Load-bearing flags must be readable.
    assert "yes" in summary and "no" in summary


def _make_plan_with_rooms(rooms: list[Room]) -> FloorPlan:
    return FloorPlan(
        envelope=Polygon2D(
            points=[
                Point2D(x=0, y=0),
                Point2D(x=10_000, y=0),
                Point2D(x=10_000, y=10_000),
                Point2D(x=0, y=10_000),
            ]
        ),
        rooms=rooms,
    )


# iter-21c — Scale calibration regression


def test_fuse_uses_vision_real_dimensions_for_scale() -> None:
    """iter-21c fix for "Lot 2 area = 3241 m²" bug : when Vision
    returns `envelope_real_dimensions_m`, the fusion step must use
    them to override the hardcoded MM_PER_PT=500. Without this, every
    real PDF came out with 100× inflated surfaces."""

    from app.pdf.parser import fuse

    # Pretend the PDF has a primitive bounding box from 0 to 100 pt wide.
    # At MM_PER_PT=500 (legacy) this would yield a 50 000 mm envelope.
    # Vision says the real envelope is 25 m × 36 m → we expect
    # 25 000 × 36 000 mm in the output.
    vectors = {
        "lines": [],
        "rects": [{"x": 0, "y": 0, "w": 100, "h": 144}],
        "circles": [],
        "page_height_pt": 200,
    }
    vision = {
        "envelope_real_dimensions_m": {
            "width_m": 25.0,
            "height_m": 36.0,
            "source": "scale_label",
            "confidence": 0.95,
        },
        "rooms_px": [],
        "interior_walls_px": [],
        "openings_px": [],
        "windows_px": [],
    }
    plan = fuse(vectors, vision, image_size=(2576, 2576))
    xs = [p.x for p in plan.envelope.points]
    ys = [p.y for p in plan.envelope.points]
    # Tolerance 100 mm — the aspect-ratio-based calibration yields a
    # uniform scale, so height may round differently from width.
    assert abs(max(xs) - 25_000) < 100
    assert abs(max(ys) - 36_000) < 200
    assert plan.real_width_m is not None and abs(plan.real_width_m - 25.0) < 0.2
    assert plan.real_height_m is not None and abs(plan.real_height_m - 36.0) < 0.3


def test_fuse_rejects_absurd_vision_dimensions() -> None:
    """Out-of-range dims (< 150 m² or > 8000 m²) must be ignored and
    fall back to the legacy MM_PER_PT — prevents a hallucinating
    Vision run from breaking the whole pipeline."""

    from app.pdf.parser import MM_PER_PT, fuse

    vectors = {
        "lines": [],
        "rects": [{"x": 0, "y": 0, "w": 100, "h": 100}],
        "circles": [],
        "page_height_pt": 200,
    }
    # Vision claims 500 m × 500 m = 250 000 m² — absurd.
    vision = {
        "envelope_real_dimensions_m": {
            "width_m": 500.0,
            "height_m": 500.0,
            "source": "inferred",
            "confidence": 0.3,
        },
        "rooms_px": [],
        "interior_walls_px": [],
        "openings_px": [],
        "windows_px": [],
    }
    plan = fuse(vectors, vision, image_size=(2576, 2576))
    # Must have fallen back to MM_PER_PT (=500) → 100 pt × 500 = 50 000 mm.
    xs = [p.x for p in plan.envelope.points]
    assert max(xs) == pytest.approx(100 * MM_PER_PT, rel=0.01)
