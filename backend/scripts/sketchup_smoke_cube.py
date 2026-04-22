"""SketchUp MCP smoke test — create a cube via TCP JSON-RPC.

Run this script with SketchUp Pro open and the MCP Server started
(Extensions → MCP Server → Start Server). Expect a 1 m × 1 m × 1 m cube to
appear at the origin.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass

from app.mcp.sketchup_client import TcpJsonBackend, try_connect_tcp  # noqa: E402


def main() -> int:
    host, port = "127.0.0.1", 9876
    print(f"[1/3] Probing {host}:{port}…")
    if not try_connect_tcp(host, port, timeout_s=1.5):
        print("       NOT REACHABLE. In SketchUp :")
        print("       • Extensions menu → MCP Server → Start Server")
        print("       • The Ruby Console should print 'Server started and listening'.")
        return 2
    print("       reachable.\n")

    backend = TcpJsonBackend(host=host, port=port)

    print("[2/3] Creating a 1 m × 1 m × 1 m cube at origin…")
    # SketchUp's native unit is inches internally — the mhyrr plugin expects
    # values in SketchUp-model units. In a Metric template, 1 unit = 1 mm.
    # A 1 m cube therefore has dimensions [1000, 1000, 1000] mm.
    resp = backend.call(
        "create_component",
        type="cube",
        position=[0, 0, 0],
        dimensions=[1000, 1000, 1000],
    )
    print(f"       response : {resp}")
    print("       Look at the SketchUp viewport : the cube should be there.\n")

    print("[3/3] Probing DesignOffice Ruby module availability…")
    try:
        resp = backend.call("eval_ruby", code="defined?(DesignOffice).to_s")
    except RuntimeError as exc:
        print(f"       eval_ruby ERROR : {exc}")
        return 3
    content = resp.get("content", [])
    text = ""
    if isinstance(content, list) and content:
        text = content[0].get("text", "")
    print(f"       DesignOffice defined as : {text or '(empty)'}")
    if "constant" not in text:
        print("       DesignOffice module NOT loaded — check design_office_extensions.rb is in the Plugins folder.")
        return 4
    print("       DesignOffice module is loaded and callable.\n")
    print("Smoke test passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
