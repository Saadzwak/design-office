import { useEffect, useState } from "react";

import { fetchIntegrationStatus, type IntegrationStatus } from "../../lib/api";

const POLL_INTERVAL_MS = 20_000;

export default function IntegrationBadge() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;

    const poll = () => {
      fetchIntegrationStatus(ac.signal)
        .then((s) => {
          if (!cancelled) setStatus(s);
        })
        .catch(() => {
          if (!cancelled) setStatus(null);
        });
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
  const anyLive = sketchup || autocadLive;

  return (
    <div
      className="relative"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <button
        className={[
          "flex items-center gap-2 rounded-lg border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors",
          anyLive
            ? "border-terracotta/50 bg-neutral-800/40 text-bone-text"
            : "border-neutral-500/30 bg-neutral-800/20 text-neutral-400",
        ].join(" ")}
        aria-label="Integration status"
      >
        <Dot live={sketchup} />
        <span>SU</span>
        <Dot live={autocadLive} />
        <span>AC</span>
        <Dot live={opusReady} />
        <span>Opus</span>
      </button>
      {expanded && status && (
        <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-neutral-500/30 bg-ink/95 p-4 shadow-soft-lg backdrop-blur">
          <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
            Integration status
          </p>
          <ul className="mt-3 space-y-2 text-xs">
            <Row
              label="SketchUp MCP"
              live={sketchup}
              detail={
                sketchup
                  ? `${status.sketchup.host}:${status.sketchup.port} (SU_MCP v1.5.0)`
                  : "server not reachable — Extensions → MCP Server → Start Server"
              }
            />
            <Row
              label="AutoCAD"
              live={autocadLive}
              detail={
                autocadLive
                  ? "File-IPC live (PDF plot available)"
                  : "ezdxf headless (DXF generation works without AutoCAD)"
              }
              warn={!autocadLive}
            />
            <Row
              label="Opus 4.7"
              live={opusReady}
              detail={
                opusReady
                  ? `API key loaded · ${status.anthropic.model}`
                  : "API key missing — check .env at repo root"
              }
            />
          </ul>
        </div>
      )}
    </div>
  );
}

function Dot({ live }: { live: boolean }) {
  return (
    <span
      className={[
        "inline-block h-1.5 w-1.5 rounded-full",
        live ? "bg-terracotta" : "bg-neutral-500/60",
        live ? "animate-pulse" : "",
      ].join(" ")}
    />
  );
}

function Row({ label, live, detail, warn }: { label: string; live: boolean; detail: string; warn?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={[
          "mt-1 inline-block h-2 w-2 shrink-0 rounded-full",
          live ? "bg-terracotta" : warn ? "bg-ochre" : "bg-neutral-500/60",
        ].join(" ")}
      />
      <div className="flex-1">
        <p className="text-bone-text">{label}</p>
        <p className="font-mono text-[10px] text-neutral-400">{detail}</p>
      </div>
    </li>
  );
}
