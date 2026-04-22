import { useEffect, useState } from "react";

import { fetchIntegrationStatus, type IntegrationStatus } from "../../lib/api";
import DotStatus from "./DotStatus";

const POLL_INTERVAL_MS = 20_000;

export default function IntegrationBadge() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;
    const poll = () => {
      fetchIntegrationStatus(ac.signal)
        .then((s) => !cancelled && setStatus(s))
        .catch(() => !cancelled && setStatus(null));
    };
    poll();
    const id = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      ac.abort();
      window.clearInterval(id);
    };
  }, []);

  const sketchup = status?.sketchup.reachable ?? false;
  const autocadLive = status?.autocad.mode === "file_ipc_live";
  const opusReady = status?.anthropic.api_key_loaded ?? false;

  return (
    <div
      className="relative"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <button
        aria-label="Integration status"
        className="flex items-center gap-2 rounded-full border border-hairline bg-raised px-3 py-1.5 font-mono text-[10px] uppercase tracking-label text-ink-soft transition-colors duration-200 ease-out-gentle hover:border-mist-300"
      >
        <DotStatus tone={sketchup ? "ok" : "idle"} />
        <span>SU</span>
        <span className="text-ink-muted/60">·</span>
        <DotStatus tone={autocadLive ? "ok" : "idle"} />
        <span>AC</span>
        <span className="text-ink-muted/60">·</span>
        <DotStatus tone={opusReady ? "ok" : "idle"} />
        <span>Opus</span>
      </button>
      {expanded && status && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-lg border border-hairline bg-raised shadow-lift">
          <p className="border-b border-hairline px-4 pb-2 pt-3 font-mono text-[10px] uppercase tracking-eyebrow text-ink-muted">
            Integration status
          </p>
          <ul className="space-y-3 px-4 py-3 text-[13px]">
            <Row
              label="SketchUp MCP"
              live={sketchup}
              detail={
                sketchup
                  ? `${status.sketchup.host}:${status.sketchup.port} · SU_MCP v1.5.0`
                  : "not running — Extensions → MCP Server → Start Server"
              }
            />
            <Row
              label="AutoCAD"
              live={autocadLive}
              warn={!autocadLive}
              detail={
                autocadLive
                  ? "File-IPC live (PDF plot available)"
                  : "ezdxf headless — DXF works, PDF plot needs AutoCAD"
              }
            />
            <Row
              label="Opus 4.7"
              live={opusReady}
              detail={opusReady ? `API key loaded · ${status.anthropic.model}` : ".env missing at repo root"}
            />
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({ label, live, detail, warn }: { label: string; live: boolean; detail: string; warn?: boolean }) {
  return (
    <li className="flex items-start gap-2.5">
      <DotStatus tone={live ? "ok" : warn ? "warn" : "idle"} className="mt-1.5" />
      <div className="flex-1">
        <p className="font-sans text-ink">{label}</p>
        <p className="mt-0.5 font-mono text-[10px] text-ink-muted">{detail}</p>
      </div>
    </li>
  );
}
