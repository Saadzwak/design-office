from __future__ import annotations

import json
from typing import Any

from fastapi.testclient import TestClient

from app.main import app
from app.models import (
    FloorPlan,
    Point2D,
    Polygon2D,
    VariantMetrics,
    VariantOutput,
    VariantStyle,
)
from app.surfaces import testfit
from app.surfaces.testfit import IterateRequest, iterate_variant


def _plan() -> FloorPlan:
    return FloorPlan(
        level=0,
        name="Lumen test",
        envelope=Polygon2D(
            points=[
                Point2D(x=0, y=0),
                Point2D(x=60_000, y=0),
                Point2D(x=60_000, y=40_000),
                Point2D(x=0, y=40_000),
            ]
        ),
    )


def _variant() -> VariantOutput:
    return VariantOutput(
        style=VariantStyle.ATELIER,
        title="Atelier Nord",
        narrative="Initial narrative.",
        metrics=VariantMetrics(
            workstation_count=130,
            meeting_room_count=14,
            phone_booth_count=14,
            collab_surface_m2=420,
            amenity_surface_m2=300,
            circulation_m2=380,
            total_programmed_m2=2050,
            flex_ratio_applied=0.75,
            notes=[],
        ),
        sketchup_trace=[
            {
                "tool": "create_meeting_room",
                "params": {
                    "corner1_mm": [20000, 18000],
                    "corner2_mm": [26000, 22000],
                    "capacity": 12,
                    "name": "Boardroom",
                    "table_product": "vitra_eames_segmented_4000",
                },
            },
        ],
    )


class _FakeResponse:
    """iter-23 — support both legacy `text` and new `tool_use` block
    shapes so existing tests (text response) + new structured tests
    (dict response) can share this stub."""

    def __init__(
        self,
        text: str | None = None,
        tool_use: dict[str, Any] | None = None,
        in_tokens: int = 1000,
        out_tokens: int = 500,
    ):
        self.usage = type("U", (), {"input_tokens": in_tokens, "output_tokens": out_tokens})()
        blocks: list[Any] = []
        if tool_use is not None:
            blocks.append(
                type("B", (), {"type": "tool_use", "input": tool_use, "name": "emit"})()
            )
        if text is not None:
            blocks.append(type("B", (), {"text": text, "type": "text"})())
        self.content = blocks


class _FakeClient:
    """Minimal Claude client stub for the iterate tests."""

    def __init__(self, text: str | None = None, tool_use: dict[str, Any] | None = None) -> None:
        self._text = text
        self._tool_use = tool_use
        self.last_kwargs: dict[str, Any] | None = None

    def messages_create(self, **kwargs: Any) -> _FakeResponse:
        self.last_kwargs = kwargs
        return _FakeResponse(text=self._text, tool_use=self._tool_use)


def _fake_orch(text: str | None = None, tool_use: dict[str, Any] | None = None) -> testfit.Orchestration:
    client = _FakeClient(text=text, tool_use=tool_use)
    orch = testfit.Orchestration(client=client)
    return orch


def test_iterate_enlarges_boardroom_and_keeps_style() -> None:
    # iter-23 — iterate now uses tool_use; pass the payload as the
    # structured `input` of a tool_use block instead of as JSON text.
    payload = {
        "style": "atelier",
        "title": "Atelier Nord",
        "narrative": "Updated narrative — boardroom enlarged to 40 m².",
        "zones": [
            {
                "kind": "meeting_room",
                "corner1_mm": [20000, 18000],
                "corner2_mm": [30000, 22000],
                "capacity": 14,
                "name": "Boardroom",
                "table_product": "vitra_eames_segmented_4000",
            }
        ],
        "metrics": {
            "workstation_count": 130,
            "meeting_room_count": 14,
            "phone_booth_count": 14,
            "collab_surface_m2": 420,
            "amenity_surface_m2": 300,
            "circulation_m2": 380,
            "total_programmed_m2": 2060,
            "flex_ratio_applied": 0.75,
            "notes": [
                "Boardroom corner2_mm moved from [26000,22000] to [30000,22000] to enlarge to 40 m².",
            ],
        },
    }
    req = IterateRequest(
        instruction="Agrandis la boardroom",
        floor_plan=_plan(),
        variant=_variant(),
        programme_markdown="# programme",
        client_name="Lumen",
    )
    resp = iterate_variant(req, orchestration=_fake_orch(tool_use=payload))
    assert resp.variant.style == VariantStyle.ATELIER
    assert resp.variant.metrics.notes[0].startswith("Boardroom")
    assert resp.variant.metrics.total_programmed_m2 == 2060
    # Replay should have produced a fresh trace with the updated meeting room.
    meeting_rooms = [
        e for e in resp.variant.sketchup_trace if e["tool"] == "create_meeting_room"
    ]
    assert meeting_rooms, "replay should emit at least one meeting room"
    assert tuple(meeting_rooms[0]["params"]["corner2_mm"]) == (30000, 22000)


def test_iterate_surface_raises_when_tool_call_missing() -> None:
    # iter-23 — with tool_use, the failure mode changed. Instead of
    # "malformed JSON" we get "API error" when Claude refuses to emit
    # the tool_use block (e.g. returns text). The surface now wraps
    # that as a ValueError with the underlying message.
    req = IterateRequest(
        instruction="foo",
        floor_plan=_plan(),
        variant=_variant(),
    )
    orch = _fake_orch(text="this is not a tool call")
    try:
        iterate_variant(req, orchestration=orch)
    except ValueError as exc:
        assert "API error" in str(exc) or "tool_use" in str(exc)
    else:
        raise AssertionError("expected ValueError")


def test_iterate_endpoint_rejects_short_instruction() -> None:
    client = TestClient(app)
    resp = client.post(
        "/api/testfit/iterate",
        json={
            "instruction": "ok",  # min_length=3
            "floor_plan": json.loads(_plan().model_dump_json()),
            "variant": json.loads(_variant().model_dump_json()),
        },
    )
    assert resp.status_code == 422


def test_sketchup_shot_path_for_rejects_traversal_and_extensions() -> None:
    from app.surfaces.testfit import sketchup_shot_path_for

    # Not a .png ⇒ None
    assert sketchup_shot_path_for("foo.txt") is None
    assert sketchup_shot_path_for("foo") is None
    # Path traversal ⇒ None (regex forbids '/' and '..')
    assert sketchup_shot_path_for("..%2Fmain.py") is None
    assert sketchup_shot_path_for("../../../etc/passwd") is None
    assert sketchup_shot_path_for("subdir/file.png") is None
    # Valid name but missing file ⇒ None
    assert sketchup_shot_path_for("doesnotexist.png") is None


def test_screenshot_endpoint_404_on_missing() -> None:
    client = TestClient(app)
    resp = client.get("/api/testfit/screenshot/missing_file_abc.png")
    assert resp.status_code == 404


def test_screenshot_endpoint_rejects_traversal() -> None:
    client = TestClient(app)
    resp = client.get("/api/testfit/screenshot/..%2Ffoo.png")
    assert resp.status_code == 404
