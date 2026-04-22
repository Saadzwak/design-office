from pathlib import Path

from app.mcp.autocad_client import AutoCadFacade, EzdxfHeadlessBackend


def test_ezdxf_backend_writes_dxf(tmp_path: Path) -> None:
    out = tmp_path / "hello.dxf"
    backend = EzdxfHeadlessBackend(out_path=out)
    facade = AutoCadFacade(backend=backend)
    facade.new_drawing("hello.dxf")
    facade.add_layers({"CUSTOM_LAYER": 2})
    facade.draw_envelope([(0, 0), (60_000, 0), (60_000, 40_000), (0, 40_000)])
    facade.draw_column(10_000, 10_000, 200)
    facade.draw_partition((20_000, 0), (20_000, 40_000))
    facade.draw_furniture((1_000, 1_000), 1_600, 800, "steelcase_migration_se_1600")
    facade.add_label((30_000, 20_000), "LUMEN — Niveau 1")
    facade.add_dimension((0, -500), (60_000, -500), offset_mm=500)
    result = facade.save()
    assert result["ok"] is True
    assert out.exists()
    assert out.stat().st_size > 1000
    # Contains standard layers + the custom one.
    trace = facade.trace()
    assert any(c["command"] == "save" for c in trace)
    assert any(c["command"] == "draw_circle" for c in trace)
    assert any(c["command"] == "draw_text" for c in trace)


def test_ezdxf_backend_creates_standard_layers(tmp_path: Path) -> None:
    import ezdxf

    out = tmp_path / "standard.dxf"
    backend = EzdxfHeadlessBackend(out_path=out)
    facade = AutoCadFacade(backend=backend)
    facade.new_drawing("standard.dxf")
    facade.draw_envelope([(0, 0), (1000, 0), (1000, 1000), (0, 1000)])
    facade.save()

    doc = ezdxf.readfile(str(out))
    layer_names = {layer.dxf.name for layer in doc.layers}
    for expected in ("AGENCEMENT", "MOBILIER", "COTATIONS", "CLOISONS", "CIRCULATIONS"):
        assert expected in layer_names, f"missing layer {expected}"
