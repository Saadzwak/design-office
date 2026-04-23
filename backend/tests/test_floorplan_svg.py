"""2D floor-plan SVG generator — iter-17 D.

Covers the pure renderer (no LLM, no MCP) plus the two HTTP endpoints :

- POST /api/testfit/floor-plan-2d  — caller supplies plan + variant
- GET  /api/testfit/sample/variants/{style}/floor-plan-2d — fixture shortcut

The SVG is consumed downstream by (a) the Test Fit 2D viewer Saad's
brief asks for (iter-18 frontend task), and (b) the NanoBanana
zone-overlay pipeline (iter-17 C) which passes it as a base image to
the image-to-image model.
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.models import FloorPlan, TestFitResponse
from app.surfaces.floorplan_svg import (
    _CATEGORY_FILL,
    _tool_to_category,
    render_floorplan_svg,
)


FIXTURE = (
    Path(__file__).resolve().parent / "fixtures" / "generate_output_sample.json"
)


def _load_sample() -> TestFitResponse:
    return TestFitResponse.model_validate(
        json.loads(FIXTURE.read_text(encoding="utf-8"))
    )


def test_tool_to_category_covers_main_zone_types() -> None:
    assert _tool_to_category("create_workstation_cluster") == "work"
    assert _tool_to_category("create_meeting_room") == "collab"
    assert _tool_to_category("create_phone_booth") == "support"
    assert _tool_to_category("apply_biophilic_zone") == "biophilic"
    assert _tool_to_category("create_cafe") == "hospitality"
    # Unknown tool must fall back without crashing.
    assert _tool_to_category("create_time_machine") == "unknown"


def test_render_envelope_only_is_valid_svg() -> None:
    """Plan with no variant still produces a valid SVG — just the shell."""

    sample = _load_sample()
    svg = render_floorplan_svg(plan=sample.floor_plan, variant=None)
    assert svg.startswith("<svg")
    assert svg.endswith("</svg>")
    assert 'class="env"' in svg
    # No zone labels when there's no variant
    assert 'class="zone-label"' not in svg
    # North marker is always drawn
    assert ">N</text>" in svg


def test_render_with_variant_draws_zones_and_legend() -> None:
    sample = _load_sample()
    variant = sample.variants[0]
    svg = render_floorplan_svg(plan=sample.floor_plan, variant=variant)
    # Every category present in the trace must turn up as a coloured fill.
    # The Lumen villageois fixture carries at least work + collab + support.
    for expected in (_CATEGORY_FILL["work"], _CATEGORY_FILL["collab"]):
        assert expected in svg, f"missing fill {expected}"
    assert "LEGEND" in svg
    # At least a few numbered zones — the Lumen trace has 30+ entries.
    assert svg.count('class="zone-label"') >= 5


def test_post_floor_plan_2d_endpoint_returns_svg() -> None:
    sample = _load_sample()
    client = TestClient(app)
    variant = sample.variants[1]
    payload = {
        "floor_plan": sample.floor_plan.model_dump(mode="json"),
        "variant": variant.model_dump(mode="json"),
        "width_px": 1200,
    }
    response = client.post("/api/testfit/floor-plan-2d", json=payload)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/svg+xml")
    assert b"<svg" in response.content
    assert b"</svg>" in response.content


def test_get_sample_floor_plan_2d_convenience_route() -> None:
    """The GET convenience route lets the demo / judges preview the 2D
    without POSTing the full plan payload.
    """

    client = TestClient(app)
    response = client.get("/api/testfit/sample/variants/atelier/floor-plan-2d")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/svg+xml")
    assert b"<svg" in response.content
    assert b"atelier" in response.content or b"LEGEND" in response.content


def test_get_sample_floor_plan_2d_unknown_style_404s() -> None:
    client = TestClient(app)
    response = client.get("/api/testfit/sample/variants/picasso/floor-plan-2d")
    assert response.status_code == 404


def test_render_gracefully_skips_zero_sized_zones() -> None:
    """A malformed trace entry with zero bbox must not trigger a crash
    nor produce an empty <rect>."""

    sample = _load_sample()
    variant = sample.variants[0].model_copy(
        update={
            "sketchup_trace": [
                {"tool": "create_workstation_cluster", "params": {"bbox_mm": [0, 0, 0, 0]}},
                {"tool": "create_workstation_cluster", "params": {"bbox_mm": [10_000, 10_000, 5_000, 2_500]}},
            ],
        }
    )
    svg = render_floorplan_svg(plan=sample.floor_plan, variant=variant)
    # Exactly 1 zone (the second) should have been drawn.
    assert svg.count('class="zone-label"') == 1
