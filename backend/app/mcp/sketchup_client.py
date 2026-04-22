"""SketchUp MCP client — real + recording-mock backends.

The real backend talks to the forked `mhyrr/sketchup-mcp` server which is
expected to listen at `ws://<host>:<port>`. Until Saad installs SketchUp Pro
and loads the extension (BLOCKERS.md B1 / B3), we fall back to the recording
mock so the rest of Phase 3 can still be exercised.
"""

from __future__ import annotations

import json
import socket
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.config import get_settings


class SketchUpBackend(Protocol):
    def call(self, tool: str, **params: Any) -> dict[str, Any]: ...

    def trace(self) -> list[dict[str, Any]]: ...


@dataclass
class RecordingMockBackend:
    """Backend that records every call without actually running SketchUp.

    Perfect for unit tests and the Phase-3-without-SketchUp situation. The
    trace is what the frontend would replay as "here's the SketchUp command
    sequence we would have executed".
    """

    calls: list[dict[str, Any]] = field(default_factory=list)

    def call(self, tool: str, **params: Any) -> dict[str, Any]:
        entry = {"tool": tool, "params": params}
        self.calls.append(entry)
        # Return plausible responses for downstream agents.
        if tool == "compute_surfaces_by_type":
            return {"workstation": 0.0, "meeting": 0.0, "collab": 0.0, "support": 0.0}
        if tool == "screenshot":
            return {"path": f"sketchup-mock/{len(self.calls):03d}.png"}
        return {"ok": True}

    def trace(self) -> list[dict[str, Any]]:
        return list(self.calls)


@dataclass
class TcpJsonBackend:
    """Minimal JSON-over-TCP client compatible with the mhyrr/sketchup-mcp
    protocol. The protocol is line-delimited JSON with `tool` + `params` keys.
    We keep the wire-format intentionally small to avoid pulling a full MCP SDK
    in here (section 14 : 50 lines custom > 500 MB lib).
    """

    host: str
    port: int
    timeout_s: float = 5.0
    _calls: list[dict[str, Any]] = field(default_factory=list)

    def call(self, tool: str, **params: Any) -> dict[str, Any]:
        self._calls.append({"tool": tool, "params": params})
        payload = json.dumps({"tool": tool, "params": params}) + "\n"
        with socket.create_connection((self.host, self.port), timeout=self.timeout_s) as s:
            s.sendall(payload.encode("utf-8"))
            buf = b""
            while not buf.endswith(b"\n"):
                chunk = s.recv(4096)
                if not chunk:
                    break
                buf += chunk
        return json.loads(buf.decode("utf-8"))

    def trace(self) -> list[dict[str, Any]]:
        return list(self._calls)


def try_connect_tcp(host: str, port: int, timeout_s: float = 0.5) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout_s):
            return True
    except OSError:
        return False


def get_backend() -> SketchUpBackend:
    """Pick the best available backend. Real if SketchUp MCP is reachable,
    recording mock otherwise. Callers can pin a backend via injection.
    """

    settings = get_settings()
    if try_connect_tcp(settings.sketchup_mcp_host, settings.sketchup_mcp_port):
        return TcpJsonBackend(
            host=settings.sketchup_mcp_host, port=settings.sketchup_mcp_port
        )
    return RecordingMockBackend()


# ---------------------------------------------------------------------------
# High-level helpers used by the variant generator. These are deliberately
# thin wrappers around the MCP calls exposed by our propriétary extensions
# (section 10 of CLAUDE.md). On the mock backend they record the intent.
# ---------------------------------------------------------------------------


@dataclass
class SketchUpFacade:
    backend: SketchUpBackend

    def new_scene(self, name: str) -> None:
        self.backend.call("new_scene", name=name)

    def draw_envelope(self, points_mm: list[tuple[float, float]]) -> None:
        self.backend.call("draw_envelope", points_mm=points_mm)

    def place_column(self, x_mm: float, y_mm: float, radius_mm: float) -> None:
        self.backend.call("place_column", x_mm=x_mm, y_mm=y_mm, radius_mm=radius_mm)

    def place_core(self, kind: str, points_mm: list[tuple[float, float]]) -> None:
        self.backend.call("place_core", kind=kind, points_mm=points_mm)

    def place_stair(self, points_mm: list[tuple[float, float]]) -> None:
        self.backend.call("place_stair", points_mm=points_mm)

    def create_workstation_cluster(
        self,
        *,
        origin_mm: tuple[float, float],
        orientation_deg: float,
        count: int,
        row_spacing_mm: int,
        product_id: str,
    ) -> None:
        self.backend.call(
            "create_workstation_cluster",
            origin_mm=origin_mm,
            orientation_deg=orientation_deg,
            count=count,
            row_spacing_mm=row_spacing_mm,
            product_id=product_id,
        )

    def create_meeting_room(
        self,
        *,
        corner1_mm: tuple[float, float],
        corner2_mm: tuple[float, float],
        capacity: int,
        name: str,
        table_product: str,
    ) -> None:
        self.backend.call(
            "create_meeting_room",
            corner1_mm=corner1_mm,
            corner2_mm=corner2_mm,
            capacity=capacity,
            name=name,
            table_product=table_product,
        )

    def create_phone_booth(self, *, position_mm: tuple[float, float], product_id: str) -> None:
        self.backend.call("create_phone_booth", position_mm=position_mm, product_id=product_id)

    def create_partition_wall(
        self,
        *,
        start_mm: tuple[float, float],
        end_mm: tuple[float, float],
        kind: str,
    ) -> None:
        self.backend.call("create_partition_wall", start_mm=start_mm, end_mm=end_mm, kind=kind)

    def create_collab_zone(
        self,
        *,
        bbox_mm: tuple[float, float, float, float],
        style: str,
    ) -> None:
        self.backend.call("create_collab_zone", bbox_mm=bbox_mm, style=style)

    def apply_biophilic_zone(self, *, bbox_mm: tuple[float, float, float, float]) -> None:
        self.backend.call("apply_biophilic_zone", bbox_mm=bbox_mm)

    def validate_pmr_circulation(self, paths: list[list[tuple[float, float]]]) -> dict:
        return self.backend.call("validate_pmr_circulation", paths=paths)

    def compute_surfaces_by_type(self) -> dict:
        return self.backend.call("compute_surfaces_by_type")

    def screenshot(self, view_name: str = "iso") -> str:
        response = self.backend.call("screenshot", view_name=view_name)
        return response.get("path", "")

    def trace(self) -> list[dict[str, Any]]:
        return self.backend.trace()
