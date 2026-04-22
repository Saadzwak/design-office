"""AutoCAD MCP client — headless ezdxf + live File IPC backends.

The forked `puran-water/autocad-mcp` exposes two backends by design :

- **ezdxf** — pure-Python DXF generation, runs without AutoCAD installed.
  Perfect for automated tests and for generating the DWG file we ship with
  the demo regardless of whether Saad has AutoCAD up.
- **File IPC** — writes command files to a watched folder ; the in-AutoCAD
  LISP dispatcher reads them and executes in the running editor. This is
  the path used for the "Open in AutoCAD" live-demo flow.

`get_backend()` selects automatically :

1. If the settings point to a File-IPC watch folder that exists and is
   writable, return `FileIpcBackend` (live AutoCAD mode).
2. Otherwise return `EzdxfHeadlessBackend` (always works).

Both backends implement the same `AutoCadBackend` protocol and both record
their calls for the variant trace / demo replay.
"""

from __future__ import annotations

import json
import os
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from app.config import get_settings


class AutoCadBackend(Protocol):
    def call(self, command: str, **params: Any) -> dict[str, Any]: ...
    def trace(self) -> list[dict[str, Any]]: ...


# ---------------------------------------------------------------------------
# ezdxf headless backend
# ---------------------------------------------------------------------------


@dataclass
class EzdxfHeadlessBackend:
    """Pure-Python DXF writer. Produces a .dxf file that AutoCAD can open
    natively, without needing AutoCAD running.

    The backend buffers commands and materialises them at `save()` time.
    """

    out_path: Path
    _calls: list[dict[str, Any]] = field(default_factory=list)
    _layers: dict[str, dict[str, Any]] = field(default_factory=dict)
    _entities: list[dict[str, Any]] = field(default_factory=list)

    def call(self, command: str, **params: Any) -> dict[str, Any]:
        entry = {"command": command, "params": params, "t": time.time()}
        self._calls.append(entry)

        if command == "new_drawing":
            self._layers.clear()
            self._entities.clear()
            return {"ok": True, "drawing": params.get("name", "design_office.dxf")}
        if command == "add_layer":
            self._layers[params["name"]] = params
            return {"ok": True}
        if command in {
            "draw_polyline",
            "draw_line",
            "draw_circle",
            "draw_rectangle",
            "draw_text",
            "draw_dimension",
            "draw_block_ref",
        }:
            self._entities.append(entry)
            return {"ok": True}
        if command == "save":
            return self._materialise()
        if command == "plot_pdf":
            return {"ok": True, "path": str(self.out_path.with_suffix(".pdf")), "note": "ezdxf backend: plot emulated, call real plot on File IPC"}
        return {"ok": True, "note": f"noop (headless): {command}"}

    def _materialise(self) -> dict[str, Any]:
        import ezdxf

        doc = ezdxf.new(setup=True)
        # Standard set of Design Office layers — extended with any user layers.
        defaults = {
            "AGENCEMENT": {"color": 7},
            "MOBILIER": {"color": 5},
            "COTATIONS": {"color": 3},
            "CLOISONS": {"color": 1},
            "CIRCULATIONS": {"color": 8},
        }
        for name, cfg in {**defaults, **self._layers}.items():
            if name not in doc.layers:
                doc.layers.add(name, color=cfg.get("color", 7))
        msp = doc.modelspace()
        for entry in self._entities:
            cmd = entry["command"]
            p = entry["params"]
            layer = p.get("layer", "AGENCEMENT")
            if cmd == "draw_line":
                msp.add_line(p["start_mm"], p["end_mm"], dxfattribs={"layer": layer})
            elif cmd == "draw_polyline":
                msp.add_lwpolyline(p["points_mm"], dxfattribs={"layer": layer}, close=bool(p.get("closed", False)))
            elif cmd == "draw_circle":
                msp.add_circle(p["center_mm"], p["radius_mm"], dxfattribs={"layer": layer})
            elif cmd == "draw_rectangle":
                x0, y0 = p["corner1_mm"]
                x1, y1 = p["corner2_mm"]
                msp.add_lwpolyline(
                    [(x0, y0), (x1, y0), (x1, y1), (x0, y1)],
                    dxfattribs={"layer": layer}, close=True,
                )
            elif cmd == "draw_text":
                msp.add_text(
                    p.get("text", ""),
                    dxfattribs={"layer": layer, "height": p.get("height_mm", 150)},
                ).set_placement(p["position_mm"])
            elif cmd == "draw_dimension":
                # Basic linear dimension between two points.
                msp.add_aligned_dim(
                    p["p1_mm"], p["p2_mm"], distance=p.get("offset_mm", 500),
                    dxfattribs={"layer": layer},
                )
            elif cmd == "draw_block_ref":
                # We don't carry a block library here ; draw a box + label as a placeholder.
                x, y = p["position_mm"]
                w = p.get("width_mm", 1600)
                h = p.get("depth_mm", 800)
                msp.add_lwpolyline(
                    [(x, y), (x + w, y), (x + w, y + h), (x, y + h)],
                    dxfattribs={"layer": layer}, close=True,
                )
                msp.add_text(
                    p.get("product_id", "?"),
                    dxfattribs={"layer": layer, "height": 80},
                ).set_placement((x + w / 2, y + h / 2))
        self.out_path.parent.mkdir(parents=True, exist_ok=True)
        doc.saveas(self.out_path)
        return {"ok": True, "path": str(self.out_path), "entity_count": len(self._entities)}

    def trace(self) -> list[dict[str, Any]]:
        return list(self._calls)


# ---------------------------------------------------------------------------
# File-IPC backend (live AutoCAD)
# ---------------------------------------------------------------------------


@dataclass
class FileIpcBackend:
    """Talks to the in-AutoCAD LISP dispatcher via a shared watch folder.

    Protocol (matches puran-water/autocad-mcp lisp-code/mcp_dispatch.lsp) :
    write a JSON command file to `watch_dir/in/<uuid>.json`, poll
    `watch_dir/out/<uuid>.json` for the response.
    """

    watch_dir: Path
    timeout_s: float = 15.0
    poll_interval_s: float = 0.25
    _calls: list[dict[str, Any]] = field(default_factory=list)

    @property
    def in_dir(self) -> Path:
        return self.watch_dir / "in"

    @property
    def out_dir(self) -> Path:
        return self.watch_dir / "out"

    def call(self, command: str, **params: Any) -> dict[str, Any]:
        self.in_dir.mkdir(parents=True, exist_ok=True)
        self.out_dir.mkdir(parents=True, exist_ok=True)
        request_id = uuid.uuid4().hex
        entry = {"command": command, "params": params, "id": request_id}
        self._calls.append(entry)
        in_file = self.in_dir / f"{request_id}.json"
        out_file = self.out_dir / f"{request_id}.json"
        in_file.write_text(json.dumps(entry), encoding="utf-8")

        t0 = time.time()
        while time.time() - t0 < self.timeout_s:
            if out_file.exists():
                try:
                    payload = json.loads(out_file.read_text(encoding="utf-8"))
                except json.JSONDecodeError:
                    time.sleep(self.poll_interval_s)
                    continue
                try:
                    out_file.unlink()
                except OSError:
                    pass
                return payload
            time.sleep(self.poll_interval_s)
        raise TimeoutError(
            f"AutoCAD File-IPC timeout after {self.timeout_s:.0f}s for command '{command}'. "
            f"Is AutoCAD running with mcp_dispatch.lsp loaded?"
        )

    def trace(self) -> list[dict[str, Any]]:
        return list(self._calls)


# ---------------------------------------------------------------------------
# Selector
# ---------------------------------------------------------------------------


def get_backend(
    *,
    force: str | None = None,
    default_out: Path | None = None,
) -> AutoCadBackend:
    """Pick the best available backend.

    `force` accepts `"ezdxf"` or `"file_ipc"` to override auto-detection.
    `default_out` overrides where ezdxf writes the DXF.
    """

    settings = get_settings()
    repo_root = Path(__file__).resolve().parent.parent.parent.parent
    watch_dir_env = os.getenv("AUTOCAD_MCP_WATCH_DIR") or settings.__dict__.get("autocad_mcp_watch_dir")
    watch_dir = Path(watch_dir_env) if watch_dir_env else repo_root / "autocad_watch"

    if force == "file_ipc":
        return FileIpcBackend(watch_dir=watch_dir)
    if force == "ezdxf":
        return EzdxfHeadlessBackend(out_path=default_out or repo_root / "out" / "design_office.dxf")

    if watch_dir.exists() and os.access(watch_dir, os.W_OK):
        return FileIpcBackend(watch_dir=watch_dir)
    return EzdxfHeadlessBackend(
        out_path=default_out or repo_root / "out" / "design_office.dxf"
    )


# ---------------------------------------------------------------------------
# Facade — high-level operations used by the Export surface
# ---------------------------------------------------------------------------


@dataclass
class AutoCadFacade:
    backend: AutoCadBackend

    def new_drawing(self, name: str = "design_office.dxf") -> None:
        self.backend.call("new_drawing", name=name)

    def add_layers(self, layers: dict[str, int] | None = None) -> None:
        for name, colour in (layers or {}).items():
            self.backend.call("add_layer", name=name, color=colour)

    def draw_envelope(self, points_mm: list[tuple[float, float]], layer: str = "AGENCEMENT") -> None:
        self.backend.call("draw_polyline", points_mm=points_mm, closed=True, layer=layer)

    def draw_column(self, x_mm: float, y_mm: float, radius_mm: float, layer: str = "AGENCEMENT") -> None:
        self.backend.call("draw_circle", center_mm=(x_mm, y_mm), radius_mm=radius_mm, layer=layer)

    def draw_partition(self, start_mm: tuple[float, float], end_mm: tuple[float, float], layer: str = "CLOISONS") -> None:
        self.backend.call("draw_line", start_mm=start_mm, end_mm=end_mm, layer=layer)

    def draw_rectangle(self, corner1_mm: tuple[float, float], corner2_mm: tuple[float, float], layer: str) -> None:
        self.backend.call("draw_rectangle", corner1_mm=corner1_mm, corner2_mm=corner2_mm, layer=layer)

    def draw_furniture(
        self,
        position_mm: tuple[float, float],
        width_mm: float,
        depth_mm: float,
        product_id: str,
        layer: str = "MOBILIER",
    ) -> None:
        self.backend.call(
            "draw_block_ref",
            position_mm=position_mm,
            width_mm=width_mm,
            depth_mm=depth_mm,
            product_id=product_id,
            layer=layer,
        )

    def add_dimension(
        self,
        p1_mm: tuple[float, float],
        p2_mm: tuple[float, float],
        offset_mm: float = 500,
        layer: str = "COTATIONS",
    ) -> None:
        self.backend.call(
            "draw_dimension", p1_mm=p1_mm, p2_mm=p2_mm, offset_mm=offset_mm, layer=layer
        )

    def add_label(
        self,
        position_mm: tuple[float, float],
        text: str,
        height_mm: float = 150,
        layer: str = "AGENCEMENT",
    ) -> None:
        self.backend.call(
            "draw_text", position_mm=position_mm, text=text, height_mm=height_mm, layer=layer
        )

    def save(self) -> dict[str, Any]:
        return self.backend.call("save")

    def plot_pdf(self, sheet: str = "A1") -> dict[str, Any]:
        return self.backend.call("plot_pdf", sheet=sheet)

    def trace(self) -> list[dict[str, Any]]:
        return self.backend.trace()
