from __future__ import annotations

import json
from pathlib import Path

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
from app.surfaces.export import ExportRequest, ExportSurface, dxf_path_for


def _mini_plan() -> FloorPlan:
    return FloorPlan(
        level=0,
        name="Lumen (test)",
        envelope=Polygon2D(
            points=[
                Point2D(x=0, y=0),
                Point2D(x=60_000, y=0),
                Point2D(x=60_000, y=40_000),
                Point2D(x=0, y=40_000),
            ]
        ),
        columns=[],
        cores=[],
        windows=[],
        stairs=[],
    )


def _mini_variant() -> VariantOutput:
    return VariantOutput(
        style=VariantStyle.ATELIER,
        title="Atelier Nord (test)",
        narrative="Test variant.",
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
                "tool": "create_workstation_cluster",
                "params": {
                    "origin_mm": [5000, 5000],
                    "orientation_deg": 0,
                    "count": 4,
                    "row_spacing_mm": 1600,
                    "product_id": "steelcase_migration_se_1600",
                },
            },
            {
                "tool": "create_meeting_room",
                "params": {
                    "corner1_mm": [20000, 18000],
                    "corner2_mm": [26000, 22000],
                    "capacity": 8,
                    "name": "Huddle Atelier",
                    "table_product": "hm_everywhere_round_1200",
                },
            },
            {
                "tool": "create_phone_booth",
                "params": {
                    "position_mm": [42000, 8000],
                    "product_id": "framery_one_compact",
                },
            },
            {
                "tool": "create_partition_wall",
                "params": {
                    "start_mm": [15000, 10000],
                    "end_mm": [25000, 10000],
                    "kind": "acoustic",
                },
            },
            {
                "tool": "create_collab_zone",
                "params": {
                    "bbox_mm": [28000, 5000, 50000, 15000],
                    "style": "cafe",
                },
            },
            {
                "tool": "apply_biophilic_zone",
                "params": {"bbox_mm": [30000, 30000, 40000, 38000]},
            },
        ],
    )


def test_export_surface_writes_dxf_with_all_layers() -> None:
    import ezdxf

    surface = ExportSurface()
    req = ExportRequest(
        client_name="Lumen",
        floor_plan=_mini_plan(),
        variant=_mini_variant(),
        scale=100,
        project_reference="LUMEN-TEST",
    )
    resp = surface.generate(req)
    assert resp.dxf_bytes > 2000
    assert resp.sheet == "A1"
    assert resp.scale == "1:100"
    assert set(resp.layers) == {"AGENCEMENT", "MOBILIER", "COTATIONS", "CLOISONS", "CIRCULATIONS"}
    assert resp.trace_length >= 15

    path = dxf_path_for(resp.export_id)
    assert path is not None and path.exists()

    # Validate the DXF can be re-opened and contains at least one
    # entity on each of the five Design Office layers.
    doc = ezdxf.readfile(str(path))
    layer_names = {layer.dxf.name for layer in doc.layers}
    for expected in ("AGENCEMENT", "MOBILIER", "COTATIONS", "CLOISONS", "CIRCULATIONS"):
        assert expected in layer_names, f"missing layer {expected}"

    entities_by_layer: dict[str, int] = {}
    for ent in doc.modelspace():
        entities_by_layer[ent.dxf.layer] = entities_by_layer.get(ent.dxf.layer, 0) + 1
    for layer in ("AGENCEMENT", "MOBILIER", "CLOISONS", "COTATIONS", "CIRCULATIONS"):
        assert entities_by_layer.get(layer, 0) > 0, (
            f"expected at least one entity on {layer}, got {entities_by_layer}"
        )

    manifest = path.with_suffix(".manifest.json")
    # Manifest file is next to the .dxf
    manifest = path.parent / f"{resp.export_id}.manifest.json"
    assert manifest.exists()
    data = json.loads(manifest.read_text(encoding="utf-8"))
    assert data["export_id"] == resp.export_id
    assert data["client_name"] == "Lumen"


def test_export_endpoint_returns_404_for_missing_id() -> None:
    client = TestClient(app)
    r = client.get("/api/export/dxf/not_a_real_id_xyz")
    assert r.status_code == 404


def test_export_endpoint_roundtrip_downloads_dxf() -> None:
    client = TestClient(app)
    req = ExportRequest(
        client_name="Lumen",
        floor_plan=_mini_plan(),
        variant=_mini_variant(),
    )
    post = client.post("/api/export/dwg", json=json.loads(req.model_dump_json()))
    assert post.status_code == 200, post.text
    payload = post.json()
    assert payload["scale"] == "1:100"
    assert payload["dxf_bytes"] > 2000

    get = client.get(f"/api/export/dxf/{payload['export_id']}")
    assert get.status_code == 200
    assert get.headers["content-type"].startswith("application/acad")
    assert len(get.content) > 2000
