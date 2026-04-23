"""Iter-18i — structured micro-zoning coercion + endpoint contract.

No live Opus calls here. The coercion function is the safety net
between the LLM's JSON and Pydantic validation — these tests lock
in every fallback path so a prompt drift on fal.ai's side can't
crash the pipeline.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.models import (
    AcousticTarget,
    StructuredAdjacencyCheck,
    StructuredFurniturePiece,
    StructuredMaterial,
    StructuredZone,
)
from app.surfaces.testfit import (
    _coerce_acoustic,
    _coerce_furniture,
    _coerce_materials,
    _coerce_structured_adjacency,
    _coerce_structured_zones,
)


# ─────────────────────────────────────────── coercion: furniture ──

def test_coerce_furniture_happy_path() -> None:
    raw = [
        {
            "brand": "Vitra",
            "name": "Eames Segmented table",
            "quantity": 1,
            "dimensions_mm": "300 × 100 cm",
            "catalog_id": "vitra_eames_segmented",
        },
        {
            "brand": "Herman Miller",
            "name": "Jarvis",
            "quantity": "12",
            "dimensions_mm": "160 × 80 cm",
        },
    ]
    got = _coerce_furniture(raw)
    assert len(got) == 2
    assert isinstance(got[0], StructuredFurniturePiece)
    assert got[0].catalog_id == "vitra_eames_segmented"
    # Quantity string gets coerced to int.
    assert got[1].quantity == 12
    assert got[1].catalog_id is None


def test_coerce_furniture_rejects_unnamed_and_bad_qty() -> None:
    raw = [
        {"brand": "Vitra"},  # no name
        "not a dict",
        {"name": "Aeron", "quantity": "banana"},  # bad qty → defaults to 1
    ]
    got = _coerce_furniture(raw)
    assert len(got) == 1
    assert got[0].name == "Aeron"
    assert got[0].quantity == 1


def test_coerce_furniture_caps_at_eight() -> None:
    raw = [{"name": f"Item {i}"} for i in range(20)]
    assert len(_coerce_furniture(raw)) == 8


def test_coerce_furniture_empty_and_garbage() -> None:
    assert _coerce_furniture(None) == []
    assert _coerce_furniture("nope") == []
    assert _coerce_furniture([]) == []


# ─────────────────────────────────────────── coercion: materials ──

def test_coerce_materials_valid_surfaces_only() -> None:
    raw = [
        {"surface": "floor", "brand": "Amtico", "name": "Worn Oak"},
        {"surface": "ATRIUM", "brand": "", "name": "Fallback"},  # invalid → other
        {"surface": "textile", "brand": "Kvadrat", "name": "Felt"},
    ]
    got = _coerce_materials(raw)
    assert [m.surface for m in got] == ["floor", "other", "textile"]
    assert all(isinstance(m, StructuredMaterial) for m in got)


def test_coerce_materials_skips_unnamed() -> None:
    assert _coerce_materials([{"surface": "floor", "brand": "Amtico"}]) == []


# ─────────────────────────────────────────── coercion: acoustic ──

def test_coerce_acoustic_happy_path() -> None:
    raw = {
        "rw_target_db": 44,
        "dnt_a_target_db": 38,
        "tr60_target_s": 0.5,
        "source": "NF S 31-080 · performant",
    }
    got = _coerce_acoustic(raw)
    assert isinstance(got, AcousticTarget)
    assert got.rw_target_db == 44
    assert got.dnt_a_target_db == 38
    assert got.tr60_target_s == 0.5


def test_coerce_acoustic_accepts_alias_dnt_target_db() -> None:
    raw = {"rw_target_db": 40, "dnt_target_db": 36}
    got = _coerce_acoustic(raw)
    assert got is not None
    assert got.dnt_a_target_db == 36


def test_coerce_acoustic_returns_none_when_all_empty() -> None:
    assert _coerce_acoustic({}) is None
    assert _coerce_acoustic({"source": "whatever"}) is None


def test_coerce_acoustic_coerces_strings() -> None:
    got = _coerce_acoustic({"rw_target_db": "44", "tr60_target_s": "0.4"})
    assert got is not None
    assert got.rw_target_db == 44
    assert got.tr60_target_s == 0.4


# ─────────────────────────────────────────── coercion: adjacency ──

def test_coerce_adjacency_rule_ids_capped_at_3() -> None:
    raw = {
        "ok": False,
        "note": "Close to WC",
        "rule_ids": ["a", "b", "c", "d", "e"],
    }
    got = _coerce_structured_adjacency(raw)
    assert isinstance(got, StructuredAdjacencyCheck)
    assert not got.ok
    assert len(got.rule_ids) == 3


def test_coerce_adjacency_defaults() -> None:
    got = _coerce_structured_adjacency("bad")
    assert got.ok is True
    assert got.note == ""
    assert got.rule_ids == []


# ─────────────────────────────────────────── coercion: zones ──

def test_coerce_zones_renumbers_contiguously() -> None:
    raw = [
        {"n": 5, "name": "Boardroom", "surface_m2": 24, "icon": "presentation"},
        {"n": 99, "name": "Open work", "surface_m2": 180, "icon": "layout-grid"},
    ]
    got = _coerce_structured_zones(raw)
    assert [z.n for z in got] == [1, 2]
    assert [z.name for z in got] == ["Boardroom", "Open work"]


def test_coerce_zones_normalises_icons_and_status() -> None:
    raw = [
        {
            "n": 1,
            "name": "Zone",
            "surface_m2": 10,
            "icon": "unknown-icon",
            "status": "CATASTROPHIC",
        }
    ]
    got = _coerce_structured_zones(raw)
    assert got[0].icon == "file-text"  # fallback
    assert got[0].status == "ok"       # fallback


def test_coerce_zones_caps_at_fourteen() -> None:
    raw = [{"n": i + 1, "name": f"Z{i}", "surface_m2": 5} for i in range(20)]
    got = _coerce_structured_zones(raw)
    assert len(got) == 14


def test_coerce_zones_garbage_input_returns_empty() -> None:
    assert _coerce_structured_zones(None) == []
    assert _coerce_structured_zones("bad") == []
    assert _coerce_structured_zones([None, "bad", 42]) == []


def test_coerce_zones_handles_stringy_surface() -> None:
    raw = [
        {"n": 1, "name": "Z", "surface_m2": "86"},
        {"n": 2, "name": "Z2", "surface_m2": "not-a-number"},
    ]
    got = _coerce_structured_zones(raw)
    assert got[0].surface_m2 == 86
    assert got[1].surface_m2 == 0


def test_full_zone_roundtrip_through_pydantic() -> None:
    raw = [
        {
            "n": 1,
            "name": "Boardroom",
            "surface_m2": 24,
            "icon": "presentation",
            "status": "ok",
            "narrative": "Tucked behind storage walls.",
            "furniture": [
                {
                    "brand": "Vitra",
                    "name": "Eames Segmented",
                    "quantity": 1,
                    "dimensions_mm": "300 × 100 cm",
                    "catalog_id": "vitra_eames_segmented",
                }
            ],
            "materials": [
                {"surface": "floor", "brand": "Amtico", "name": "Worn Oak", "note": ""}
            ],
            "acoustic": {
                "rw_target_db": 44,
                "dnt_a_target_db": 38,
                "tr60_target_s": 0.5,
                "source": "NF S 31-080",
            },
            "adjacency": {
                "ok": True,
                "note": "Quiet buffer in place.",
                "rule_ids": ["acoustic.open_desks_next_to_boardroom"],
            },
        }
    ]
    got = _coerce_structured_zones(raw)
    assert len(got) == 1
    z = got[0]
    assert isinstance(z, StructuredZone)
    assert z.furniture[0].catalog_id == "vitra_eames_segmented"
    assert z.materials[0].brand == "Amtico"
    assert z.acoustic is not None and z.acoustic.rw_target_db == 44
    assert z.adjacency.rule_ids == ["acoustic.open_desks_next_to_boardroom"]

    # Re-serialise to JSON + back — catches any Pydantic drift.
    blob = z.model_dump_json()
    reloaded = StructuredZone.model_validate_json(blob)
    assert reloaded == z


# ─────────────────────────────────────────── endpoint contract ──

def test_endpoint_requires_api_key(monkeypatch) -> None:
    from app.main import settings as live_settings

    original = live_settings.anthropic_api_key
    monkeypatch.setattr(live_settings, "anthropic_api_key", "")
    client = TestClient(app)
    payload = {
        "client_name": "Lumen",
        "client_industry": "tech_startup",
        "floor_plan": {
            "level": 0,
            "name": "Lumen",
            "scale_unit": "mm",
            "envelope": {"points": [{"x": 0, "y": 0}, {"x": 60000, "y": 0}, {"x": 60000, "y": 40000}, {"x": 0, "y": 40000}]},
            "columns": [],
            "cores": [],
            "windows": [],
            "doors": [],
            "stairs": [],
            "text_labels": [],
            "source_confidence": 1.0,
        },
        "variant": {
            "style": "atelier",
            "title": "Atelier",
            "narrative": "x",
            "metrics": {
                "workstation_count": 130,
                "meeting_room_count": 6,
                "phone_booth_count": 14,
                "collab_surface_m2": 320,
                "amenity_surface_m2": 260,
                "circulation_m2": 450,
                "total_programmed_m2": 1898,
                "flex_ratio_applied": 0.76,
                "notes": [],
            },
            "sketchup_trace": [],
            "screenshot_paths": [],
        },
        "programme_markdown": "# Lumen\n",
    }
    response = client.post("/api/testfit/microzoning/structured", json=payload)
    assert response.status_code == 503
    assert "ANTHROPIC_API_KEY" in response.json()["detail"]

    # Restore so other tests in this session don't see the mutation.
    monkeypatch.setattr(live_settings, "anthropic_api_key", original)
