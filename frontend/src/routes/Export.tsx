import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

import VariantViewer from "../components/viewer/VariantViewer";
import { useLiveScreenshots } from "../hooks/useLiveScreenshots";
import {
  exportDxfUrl,
  fetchLumenFixture,
  generateExport,
  type ExportResponse,
  type FloorPlan,
  type ReviewerVerdict,
  type VariantOutput,
} from "../lib/api";

type PersistedTestFit = {
  floor_plan: FloorPlan;
  variants: VariantOutput[];
  verdicts: ReviewerVerdict[];
};

const STYLE_LABEL: Record<VariantOutput["style"], string> = {
  villageois: "Villageois",
  atelier: "Atelier",
  hybride_flex: "Hybride flex",
};

type State =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "done"; response: ExportResponse }
  | { kind: "error"; message: string };

export default function ExportRoute() {
  const [stored] = useState<PersistedTestFit | null>(() => {
    try {
      const raw = localStorage.getItem("design-office.testfit.result");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [fallbackPlan, setFallbackPlan] = useState<FloorPlan | null>(null);
  const [selected, setSelected] = useState<VariantOutput["style"] | null>(null);
  const [scale, setScale] = useState<number>(100);
  const [projectRef, setProjectRef] = useState<string>("LUMEN-CAT-B");
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    if (stored) return;
    const ac = new AbortController();
    fetchLumenFixture(ac.signal).then(setFallbackPlan).catch(() => null);
    return () => ac.abort();
  }, [stored]);

  const variants = stored?.variants ?? [];
  const verdicts = stored?.verdicts ?? [];
  const floorPlan = stored?.floor_plan ?? fallbackPlan;

  useEffect(() => {
    if (selected || variants.length === 0) return;
    const approved =
      variants.find(
        (v) =>
          verdicts.find((r) => r.style === v.style)?.verdict === "approved_with_notes" ||
          verdicts.find((r) => r.style === v.style)?.verdict === "approved",
      ) ?? variants[0];
    setSelected(approved.style);
  }, [variants, verdicts, selected]);

  const chosenVariant = variants.find((v) => v.style === selected) ?? null;
  const chosenVerdict = verdicts.find((v) => v.style === selected) ?? null;
  const liveScreenshots = useLiveScreenshots();
  const zones = useMemo(() => {
    if (!chosenVariant) return [];
    return chosenVariant.sketchup_trace
      .filter((entry) =>
        [
          "create_workstation_cluster",
          "create_meeting_room",
          "create_phone_booth",
          "create_collab_zone",
          "apply_biophilic_zone",
        ].includes(entry.tool),
      )
      .map((entry) => ({
        kind: entry.tool,
        bbox_mm: (entry.params.bbox_mm as [number, number, number, number] | undefined) ?? undefined,
        origin_mm: (entry.params.origin_mm as [number, number] | undefined) ?? undefined,
        position_mm: (entry.params.position_mm as [number, number] | undefined) ?? undefined,
        corner1_mm: (entry.params.corner1_mm as [number, number] | undefined) ?? undefined,
        corner2_mm: (entry.params.corner2_mm as [number, number] | undefined) ?? undefined,
      }));
  }, [chosenVariant]);

  const onGenerate = async () => {
    if (!chosenVariant || !floorPlan) return;
    setState({ kind: "generating" });
    try {
      const response = await generateExport({
        client_name: "Lumen",
        floor_plan: floorPlan,
        variant: chosenVariant,
        scale,
        project_reference: projectRef || undefined,
      });
      setState({ kind: "done", response });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-4xl">Technical export</h1>
        <p className="mt-3 max-w-2xl text-neutral-300">
          Produce a dimensioned A1 DXF with Design Office layers (AGENCEMENT, MOBILIER, COTATIONS,
          CLOISONS, CIRCULATIONS) and a title-block cartouche — ready for the next studio or the
          bureau de contrôle.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[380px,1fr]">
        <aside className="space-y-4">
          <div className="rounded-2xl border border-neutral-500/20 bg-neutral-800/20 p-6">
            <h2 className="font-serif text-lg">Retained variant</h2>
            {variants.length === 0 ? (
              <p className="mt-3 text-sm text-neutral-300">
                No Test Fit result in this session. Go to{" "}
                <a className="text-terracotta hover:underline" href="/testfit">
                  Test Fit
                </a>{" "}
                first.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {variants.map((v) => {
                  const verdict = verdicts.find((r) => r.style === v.style);
                  const dot =
                    verdict?.verdict === "approved"
                      ? "bg-green-400/80"
                      : verdict?.verdict === "approved_with_notes"
                        ? "bg-ochre"
                        : "bg-terracotta";
                  const active = selected === v.style;
                  return (
                    <li key={v.style}>
                      <button
                        onClick={() => setSelected(v.style)}
                        className={[
                          "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                          active
                            ? "border-terracotta/60 bg-neutral-700/40"
                            : "border-neutral-500/30 hover:border-neutral-300/50",
                        ].join(" ")}
                      >
                        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
                        <div className="flex-1">
                          <p className="text-sm text-bone-text">{STYLE_LABEL[v.style]}</p>
                          <p className="font-mono text-[11px] text-neutral-400">
                            {v.metrics.workstation_count} postes · {verdict?.verdict ?? "—"}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-neutral-500/20 bg-neutral-800/20 p-6">
            <h2 className="font-serif text-lg">Drawing parameters</h2>
            <label className="mt-3 block font-mono text-[11px] uppercase tracking-widest text-neutral-400">
              Scale (1:N)
            </label>
            <div className="mt-1 flex gap-2">
              {[50, 100, 200].map((s) => (
                <button
                  key={s}
                  onClick={() => setScale(s)}
                  className={[
                    "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                    scale === s
                      ? "border-terracotta/70 bg-neutral-700/50 text-bone-text"
                      : "border-neutral-500/30 text-neutral-300 hover:border-neutral-300/50",
                  ].join(" ")}
                >
                  1:{s}
                </button>
              ))}
            </div>
            <label className="mt-4 block font-mono text-[11px] uppercase tracking-widest text-neutral-400">
              Project reference
            </label>
            <input
              value={projectRef}
              onChange={(e) => setProjectRef(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-500/30 bg-neutral-800/40 px-3 py-2 font-mono text-xs text-bone-text focus:border-terracotta/50 focus:outline-none"
            />
          </div>

          <button
            className="btn-primary w-full"
            disabled={!chosenVariant || !floorPlan || state.kind === "generating"}
            onClick={onGenerate}
          >
            {state.kind === "generating" ? "Generating DXF…" : "Generate technical DXF"}
          </button>

          {state.kind === "done" && (
            <a
              className="btn-ghost block w-full text-center"
              href={exportDxfUrl(state.response.export_id)}
              target="_blank"
              rel="noreferrer"
              download
            >
              Download {state.response.dxf_filename}
            </a>
          )}
          {state.kind === "error" && (
            <p className="font-mono text-xs text-terracotta">{state.message}</p>
          )}
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr,1fr]">
            <div className="aspect-[3/2] min-w-0 rounded-2xl border border-neutral-500/20 bg-neutral-800/20 p-3">
              <VariantViewer
                plan={floorPlan}
                variant={chosenVariant}
                style={selected ?? null}
                zones={zones}
                liveScreenshotUrl={selected ? liveScreenshots[selected] ?? null : null}
              />
            </div>
            <div className="min-w-0 space-y-3">
              {chosenVariant ? (
                <>
                  <p className="font-mono text-xs uppercase tracking-widest text-neutral-400">
                    {STYLE_LABEL[chosenVariant.style]} · 1:{scale}
                  </p>
                  <h2 className="font-serif text-2xl">{chosenVariant.title}</h2>
                  <div className="grid grid-cols-2 gap-2 text-xs text-neutral-300">
                    <Metric label="Postes" value={chosenVariant.metrics.workstation_count} />
                    <Metric label="Réunions" value={chosenVariant.metrics.meeting_room_count} />
                    <Metric label="Phone booths" value={chosenVariant.metrics.phone_booth_count} />
                    <Metric label="Flex" value={chosenVariant.metrics.flex_ratio_applied.toFixed(2)} />
                  </div>
                  {chosenVerdict && (
                    <p className="font-mono text-[11px] text-neutral-400">
                      Reviewer · {chosenVerdict.verdict.replace(/_/g, " ")}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-neutral-400">Pick a variant on the left.</p>
              )}
            </div>
          </div>

          {state.kind === "done" && (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl border border-neutral-500/20 bg-neutral-800/20 p-6"
            >
              <div className="flex flex-wrap items-center gap-4">
                <span className="font-serif text-lg">{state.response.dxf_filename}</span>
                <span className="font-mono text-xs text-neutral-300">
                  {(state.response.dxf_bytes / 1024).toFixed(1)} KB · {state.response.sheet}
                  {" · "}{state.response.scale} · {state.response.trace_length} ops
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {state.response.layers.map((layer) => (
                  <span
                    key={layer}
                    className="rounded-md border border-neutral-500/30 bg-neutral-900/40 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-neutral-300"
                  >
                    {layer}
                  </span>
                ))}
              </div>
              {state.response.plot_pdf_available ? (
                <p className="mt-3 text-xs text-neutral-300">
                  AutoCAD is live — a printable A1 PDF was generated alongside the DXF.
                </p>
              ) : (
                <p className="mt-3 text-xs text-neutral-400">
                  Generated via ezdxf headless backend — opens in AutoCAD / BricsCAD / Adobe
                  Illustrator. Switch to the File-IPC backend (AutoCAD running + watch folder set)
                  for a live A1 PDF plot.
                </p>
              )}
            </motion.div>
          )}

          <div className="rounded-2xl border border-dashed border-neutral-500/30 bg-neutral-800/10 p-6 text-xs text-neutral-400">
            <p className="font-mono uppercase tracking-widest">How it works</p>
            <ul className="mt-2 space-y-1 leading-relaxed">
              <li>
                • <span className="text-bone-text">ezdxf headless</span> — default, produces a
                real DXF on disk, opens natively in AutoCAD.
              </li>
              <li>
                • <span className="text-bone-text">File IPC live</span> — auto-selected when
                AutoCAD is running with <code>mcp_dispatch.lsp</code> loaded and{" "}
                <code>AUTOCAD_MCP_WATCH_DIR</code> is set. Generates an A1 PDF plot in addition
                to the DXF.
              </li>
              <li>
                • Every export lands as{" "}
                <code>backend/app/out/export/&lt;export_id&gt;.dxf</code> with a manifest JSON
                alongside for audit.
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-neutral-500/20 bg-neutral-800/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-neutral-400">{label}</p>
      <p className="text-sm text-bone-text">{value}</p>
    </div>
  );
}
