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
        # iter-21d — Phase B additions. Both return mock defaults so
        # the rest of the pipeline doesn't branch on "SketchUp live or
        # not" : upstream code sees the same shape either way.
        if tool == "import_plan_pdf":
            return {
                "ok": True,
                "mock": True,
                "width_m": params.get("width_m"),
                "height_m": params.get("height_m"),
                "layer": "DO · Reference plan",
            }
        if tool == "read_scene_state":
            return {
                "ok": True,
                "mock": True,
                "envelope_bbox_mm": {"x0_mm": 0, "y0_mm": 0, "x1_mm": 0, "y1_mm": 0},
                "zone_count": 0,
                "zones": [],
            }
        return {"ok": True}

    def trace(self) -> list[dict[str, Any]]:
        return list(self.calls)


@dataclass
class TcpJsonBackend:
    """JSON-RPC 2.0 client for the `mhyrr/sketchup-mcp` plugin.

    The plugin's TCP server (see `vendor/sketchup-mcp/su_mcp/su_mcp/main.rb`)
    accepts one line of JSON per connection, replies with one line, closes.
    Every call is translated to a `tools/call` JSON-RPC method with the
    appropriate tool name and arguments.

    Our Design Office high-level operations (`create_workstation_cluster`,
    etc.) are not native to the vendor plugin — they live in the
    `DesignOffice` Ruby module we install alongside the plugin. We call them
    by sending an `eval_ruby` request that invokes
    `DesignOffice.create_phone_booth(...)` on the server side.
    """

    host: str
    port: int
    timeout_s: float = 30.0
    _calls: list[dict[str, Any]] = field(default_factory=list)
    _next_id: int = 1

    # ------------------------------------------------------------------
    # Public facade-level entrypoint used by SketchUpFacade
    # ------------------------------------------------------------------

    def call(self, tool: str, **params: Any) -> dict[str, Any]:
        self._calls.append({"tool": tool, "params": params})
        if tool in _NATIVE_TOOLS:
            return self._jsonrpc_call(tool, params)
        return self._eval_design_office(tool, params)

    def trace(self) -> list[dict[str, Any]]:
        return list(self._calls)

    # ------------------------------------------------------------------
    # JSON-RPC wire protocol
    # ------------------------------------------------------------------

    def _send_raw(self, payload: dict[str, Any], attempts: int = 3) -> dict[str, Any]:
        """Send one line, read one line back. The SU_MCP server polls the
        TCP socket on a `UI.start_timer(0.1)` loop — a brand-new server
        sometimes drops the very first connection before its timer has
        fired, so we retry a couple of times with a short back-off.
        """

        line = json.dumps(payload) + "\n"
        last_exc: BaseException | None = None
        for attempt in range(1, attempts + 1):
            try:
                with socket.create_connection(
                    (self.host, self.port), timeout=self.timeout_s
                ) as s:
                    s.sendall(line.encode("utf-8"))
                    buf = b""
                    while not buf.endswith(b"\n"):
                        chunk = s.recv(65536)
                        if not chunk:
                            break
                        buf += chunk
                if not buf:
                    raise ConnectionError(
                        "SketchUp MCP server returned no data — is SU_MCP running?"
                    )
                response = json.loads(buf.decode("utf-8"))
                if "error" in response:
                    raise RuntimeError(
                        f"SketchUp MCP error (code {response['error'].get('code')}): "
                        f"{response['error'].get('message')}"
                    )
                return response
            except (
                ConnectionError,
                ConnectionRefusedError,
                ConnectionResetError,
                OSError,
                json.JSONDecodeError,
            ) as exc:
                last_exc = exc
                if attempt == attempts:
                    raise
                # 0.3 s, 0.9 s — enough for the SketchUp timer to tick.
                import time as _time

                _time.sleep(0.3 * attempt)
        assert last_exc is not None
        raise last_exc

    def _jsonrpc_call(self, tool: str, arguments: dict[str, Any]) -> dict[str, Any]:
        payload = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {"name": tool, "arguments": arguments},
            "id": self._next_id,
        }
        self._next_id += 1
        response = self._send_raw(payload)
        result = response.get("result", {})
        # Unwrap JSON-RPC content envelope into a flat dict for the facade.
        return {
            "ok": bool(result.get("success", True)),
            "resource_id": result.get("resourceId"),
            "content": result.get("content"),
        }

    def _eval_design_office(self, tool: str, params: dict[str, Any]) -> dict[str, Any]:
        """Build a Ruby one-liner that dispatches to the DesignOffice module
        we install alongside the vendor plugin. This is how our proprietary
        operations reach SketchUp.
        """

        code = _build_ruby_call(tool, params)
        return self._jsonrpc_call("eval_ruby", {"code": code})


# mhyrr/sketchup-mcp built-in tools — these are forwarded as-is.
_NATIVE_TOOLS: set[str] = {
    "create_component",
    "delete_component",
    "transform_component",
    "get_selection",
    "export",
    "export_scene",
    "set_material",
    "boolean_operation",
    "chamfer_edges",
    "fillet_edges",
    "create_mortise_tenon",
    "create_dovetail",
    "create_finger_joint",
    "eval_ruby",
}


def _build_ruby_call(tool: str, params: dict[str, Any]) -> str:
    """Serialise a DesignOffice.<tool>(keyword: value) call as Ruby source.

    We stringify the params with JSON so Ruby's `JSON.parse` reads them back
    safely. Keyword arguments are required by the Ruby module signature.
    """

    serialised = {k: v for k, v in params.items()}
    json_payload = json.dumps(serialised).replace("\\", "\\\\").replace("'", "\\'")
    return (
        "require 'json'\n"
        f"_params = JSON.parse('{json_payload}')\n"
        f"DesignOffice.{tool}(**_params.transform_keys(&:to_sym))\n"
        "'ok'"
    )


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

    # iter-22b (Saad, 2026-04-24) — hero 3D primitives for visual scale.
    # Ruby-native builders in design_office_extensions.rb produce styled
    # humans / plants / chairs / tables without needing any .skp assets.
    # Every call accepts an optional `color_rgb` so the LLM can match
    # the variant's mood (darker for ML focus, lighter for lounge, etc).

    def place_human(
        self,
        *,
        position_mm: tuple[float, float],
        pose: str = "standing",
        orientation_deg: float = 0.0,
        color_rgb: list[int] | None = None,
    ) -> dict[str, Any]:
        return self.backend.call(
            "place_human",
            position_mm=list(position_mm),
            pose=pose,
            orientation_deg=orientation_deg,
            color_rgb=color_rgb,
        )

    def place_plant(
        self,
        *,
        position_mm: tuple[float, float],
        species: str = "ficus_lyrata",
        orientation_deg: float = 0.0,
        color_rgb: list[int] | None = None,
    ) -> dict[str, Any]:
        return self.backend.call(
            "place_plant",
            position_mm=list(position_mm),
            species=species,
            orientation_deg=orientation_deg,
            color_rgb=color_rgb,
        )

    def place_hero(
        self,
        *,
        slug: str,
        position_mm: tuple[float, float],
        orientation_deg: float = 0.0,
        color_rgb: list[int] | None = None,
    ) -> dict[str, Any]:
        return self.backend.call(
            "place_hero",
            slug=slug,
            position_mm=list(position_mm),
            orientation_deg=orientation_deg,
            color_rgb=color_rgb,
        )

    def apply_variant_palette(
        self,
        *,
        walls: list[int] | None = None,
        floor: list[int] | None = None,
        accent: list[int] | None = None,
    ) -> dict[str, Any]:
        return self.backend.call(
            "apply_variant_palette",
            walls=walls,
            floor=floor,
            accent=accent,
        )

    # iter-21d (Phase B) — reference-plan import + scene state readout.

    def import_plan_pdf(
        self, *, pdf_path: str, width_m: float, height_m: float
    ) -> dict[str, Any]:
        """Drop the client's PDF as a reference image underneath the
        generated variant. The Ruby side places it at z=-10 mm on the
        "DO · Reference plan" layer so variants render on top. Real
        SketchUp required : on the mock backend this records the intent
        and returns a mock payload, without crashing the flow.
        """
        return self.backend.call(
            "import_plan_pdf",
            pdf_path=pdf_path,
            width_m=width_m,
            height_m=height_m,
        )

    def read_scene_state(self) -> dict[str, Any]:
        """Read the current SketchUp model and return the envelope bbox
        plus the list of variant-layer groups (with name, layer, and mm
        bbox). The iterate endpoint prepends this to its prompt so
        "enlarge the boardroom" reasons on actual geometry, not the
        Python-side FloorPlan mirror (which can drift after a few
        iterations)."""
        return self.backend.call("read_scene_state")

    def screenshot(self, view_name: str = "iso", out_path: str | None = None) -> str:
        """Capture an iso screenshot. When `out_path` is provided and the real
        SketchUp MCP backend is live, a PNG is written to that absolute path.
        When we are on the mock backend, only the intent is recorded and the
        returned path is the one the caller asked for (so downstream URL
        generation still works).
        """

        if out_path is not None:
            response = self.backend.call(
                "screenshot", view_name=view_name, path=out_path
            )
            return response.get("path") or out_path
        response = self.backend.call("screenshot", view_name=view_name)
        return response.get("path", "")

    def trace(self) -> list[dict[str, Any]]:
        return self.backend.trace()
