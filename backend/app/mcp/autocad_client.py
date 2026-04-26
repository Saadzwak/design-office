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
        # Standard set of Archoff layers — extended with any user layers.
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

    iter-22 (Saad, 2026-04-24) — rewritten to match the actual protocol
    of `puran-water/autocad-mcp`'s `mcp_dispatch.lsp` :

    - Command files live FLAT in `watch_dir/` with prefix
      `autocad_mcp_cmd_<request_id>.json`
    - Result files come back as `autocad_mcp_result_<request_id>.json`
    - JSON shape in : `{"request_id": "...", "command": "...", ...params}`
    - JSON shape out : `{"request_id": "...", "ok": bool, "payload": ...,
      "error": "..." | null}`

    AutoCAD's LISP dispatcher is one-shot (`c:mcp-dispatch` scans the
    folder once and returns). To run fully un-attended we try to use
    `SendCommand("MCP-DISPATCH\\n")` via pywin32 COM after each drop.
    `cold_mode=True` disables the COM trigger and falls back to Saad
    manually typing `MCP-DISPATCH` in AutoCAD — useful for ping tests
    / paranoid debug sessions."""

    watch_dir: Path
    timeout_s: float = 30.0
    poll_interval_s: float = 0.25
    _calls: list[dict[str, Any]] = field(default_factory=list)
    # Lazy-import pywin32 only when the backend actually runs. Tests
    # on non-Windows (CI) or machines without pywin32 stay green.
    _com_app: Any | None = None
    _com_probed: bool = False

    def _probe_com(self) -> Any | None:
        """Return a cached ACAD application COM object, or None if
        pywin32 is unavailable / AutoCAD isn't running."""
        if self._com_probed:
            return self._com_app
        self._com_probed = True
        try:
            import win32com.client  # type: ignore[import-not-found]

            # AutoCAD LT 2026 also responds to the generic ProgID.
            # Fall through the list — the first one that answers wins.
            progids = ["AutoCAD.Application", "AutoCAD.Application.LT.26"]
            for pid in progids:
                try:
                    self._com_app = win32com.client.GetActiveObject(pid)
                    return self._com_app
                except Exception:  # noqa: BLE001
                    continue
        except Exception:  # noqa: BLE001
            # pywin32 missing / no matching AutoCAD process
            pass
        return None

    def _trigger_dispatch(self) -> bool:
        """Fire MCP-DISPATCH in the running AutoCAD via COM.

        Returns True when the call was dispatched, False otherwise.
        A False result isn't fatal — the caller will still poll for the
        result file. If Saad types MCP-DISPATCH manually, the loop
        completes anyway (just slower).
        """
        app = self._probe_com()
        if app is None:
            return False
        try:
            doc = app.ActiveDocument
            # SendCommand is async ; the command runs in AutoCAD's
            # foreground queue. Trailing "\n" = Enter.
            doc.SendCommand("MCP-DISPATCH\n")
            return True
        except Exception:  # noqa: BLE001
            # Modal dialog open, no active document, etc.
            return False

    def call(self, command: str, **params: Any) -> dict[str, Any]:
        self.watch_dir.mkdir(parents=True, exist_ok=True)
        request_id = uuid.uuid4().hex[:16]
        payload = {"request_id": request_id, "command": command, **params}
        self._calls.append({"command": command, "params": params, "id": request_id})
        cmd_file = self.watch_dir / f"autocad_mcp_cmd_{request_id}.json"
        result_file = self.watch_dir / f"autocad_mcp_result_{request_id}.json"
        cmd_file.write_text(json.dumps(payload), encoding="utf-8")

        # Try the COM auto-dispatch. Best-effort — log for debug but
        # do not raise : Saad's manual MCP-DISPATCH still works.
        triggered_via_com = self._trigger_dispatch()

        t0 = time.time()
        while time.time() - t0 < self.timeout_s:
            if result_file.exists():
                try:
                    body = result_file.read_text(encoding="utf-8")
                    # LISP writer is atomic per-file-write but we still
                    # guard a split-read race : if json parse fails,
                    # sleep and retry once.
                    resp = json.loads(body)
                except json.JSONDecodeError:
                    time.sleep(self.poll_interval_s)
                    continue
                try:
                    result_file.unlink()
                except OSError:
                    pass
                # Clean up the command file too when we've got the
                # response (LISP tries to delete it but sometimes
                # AutoCAD holds a read handle open a beat).
                try:
                    cmd_file.unlink()
                except OSError:
                    pass
                return resp
            time.sleep(self.poll_interval_s)
        hint = (
            "COM auto-trigger succeeded — AutoCAD should have processed it. "
            "Check AutoCAD for a modal dialog blocking MCP-DISPATCH."
            if triggered_via_com
            else "COM auto-trigger unavailable (pywin32 missing or AutoCAD "
            "not responding). Type `MCP-DISPATCH` in the AutoCAD command "
            "line to process pending files manually."
        )
        raise TimeoutError(
            f"AutoCAD File-IPC timeout after {self.timeout_s:.0f}s for "
            f"command '{command}'. {hint}"
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
    # iter-22 — default watch dir is now `C:/temp` to match the
    # puran-water LISP's `*mcp-ipc-dir*` default. The old
    # `autocad_watch/` path is still honoured via env override so
    # existing deploys don't break.
    if watch_dir_env:
        watch_dir = Path(watch_dir_env)
    elif os.name == "nt":
        watch_dir = Path("C:/temp")
    else:
        watch_dir = repo_root / "autocad_watch"

    if force == "file_ipc":
        return FileIpcBackend(watch_dir=watch_dir)
    if force == "ezdxf":
        return EzdxfHeadlessBackend(out_path=default_out or repo_root / "out" / "design_office.dxf")

    # iter-22 — ezdxf always wins when AutoCAD isn't answering COM,
    # so a file-IPC backend can't hang on a dead queue. The auto-flow :
    #   1. If AutoCAD COM is reachable → FileIpcBackend (live).
    #   2. Else if the folder exists AND the user explicitly forced it
    #      via AUTOCAD_MCP_WATCH_DIR → FileIpcBackend (manual dispatch).
    #   3. Else fall back to ezdxf (headless).
    if watch_dir.exists() and os.access(watch_dir, os.W_OK):
        candidate = FileIpcBackend(watch_dir=watch_dir)
        if candidate._probe_com() is not None:
            return candidate
        if watch_dir_env:
            return candidate
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
