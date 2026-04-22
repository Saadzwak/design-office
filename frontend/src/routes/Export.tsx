import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

import DotStatus from "../components/ui/DotStatus";
import TypewriterText from "../components/ui/TypewriterText";
import VariantViewer from "../components/viewer/VariantViewer";
import { useLiveScreenshots } from "../hooks/useLiveScreenshots";
import {
  exportDxfUrl,
  fetchTestFitSample,
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

const STYLE_DOT: Record<VariantOutput["style"], string> = {
  villageois: "bg-forest",
  atelier: "bg-sand-deep",
  hybride_flex: "bg-sun",
};

type State =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "done"; response: ExportResponse }
  | { kind: "error"; message: string };

export default function ExportRoute() {
  const [stored, setStored] = useState<PersistedTestFit | null>(() => {
    try {
      const raw = localStorage.getItem("design-office.testfit.result");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [isSample, setIsSample] = useState(false);
  const [selected, setSelected] = useState<VariantOutput["style"] | null>(null);
  const [scale, setScale] = useState<number>(100);
  const [projectRef, setProjectRef] = useState<string>("LUMEN-CAT-B");
  const [state, setState] = useState<State>({ kind: "idle" });

  // Cold-start demo mode : load the saved Lumen fixture if the user
  // landed here without running Test Fit first.
  useEffect(() => {
    if (stored) return;
    const ac = new AbortController();
    fetchTestFitSample(ac.signal)
      .then((sample) => {
        setStored({
          floor_plan: sample.floor_plan,
          variants: sample.variants,
          verdicts: sample.verdicts,
        });
        setIsSample(true);
      })
      .catch(() => null);
    return () => ac.abort();
  }, [stored]);

  const variants = stored?.variants ?? [];
  const verdicts = stored?.verdicts ?? [];
  const floorPlan = stored?.floor_plan ?? null;

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
    <div className="space-y-20">
      <header className="max-w-3xl">
        <p className="eyebrow-forest">
          IV · Export
          {isSample && (
            <span className="ml-3 text-ink-muted normal-case tracking-normal">
              · demo data
            </span>
          )}
        </p>
        <h1
          className="mt-5 font-display text-display-sm leading-[1.02] text-ink"
          style={{ fontVariationSettings: '"opsz" 144, "wght" 620, "SOFT" 100' }}
        >
          An A1 DXF, <em className="italic">ready for the studio</em>.
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
          Five Design Office layers — AGENCEMENT, MOBILIER, COTATIONS, CLOISONS, CIRCULATIONS —
          assembled with a proper title-block cartouche. Opens in AutoCAD, BricsCAD or Illustrator.
          If AutoCAD is live, a printable A1 PDF is plotted alongside.
        </p>
      </header>

      {variants.length === 0 ? (
        <section className="border-t border-hairline pt-14">
          <p className="max-w-xl text-[14px] leading-relaxed text-ink-soft">
            No Test Fit result in this session. Go to{" "}
            <a className="text-forest underline-offset-2 hover:underline" href="/testfit">
              Test Fit
            </a>{" "}
            first to pick a variant to export.
          </p>
        </section>
      ) : (
        <>
          {/* ───────── hero : viewer at rest + single CTA ───────── */}
          <section className="grid gap-12 lg:grid-cols-[minmax(0,1fr),minmax(0,1fr)] lg:items-center">
            <motion.div
              key={selected ?? "none"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="aspect-[4/3] w-full min-w-0 overflow-hidden rounded-lg border border-hairline bg-raised"
            >
              <VariantViewer
                plan={floorPlan}
                variant={chosenVariant}
                style={selected ?? null}
                zones={zones}
                liveScreenshotUrl={selected ? liveScreenshots[selected] ?? null : null}
              />
            </motion.div>

            <div className="min-w-0 lg:pl-4">
              {chosenVariant && (
                <>
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-block h-[9px] w-[9px] rounded-full ${STYLE_DOT[chosenVariant.style]}`}
                    />
                    <p className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
                      {STYLE_LABEL[chosenVariant.style]} · 1:{scale}
                    </p>
                  </div>
                  <h2
                    className="mt-3 font-display text-[2.5rem] leading-tight text-ink"
                    style={{ fontVariationSettings: '"opsz" 144, "wght" 560, "SOFT" 100' }}
                  >
                    {chosenVariant.title}
                  </h2>
                  {chosenVerdict && (
                    <div className="mt-4 flex items-center gap-2">
                      <DotStatus
                        tone={
                          chosenVerdict.verdict === "approved"
                            ? "ok"
                            : chosenVerdict.verdict === "approved_with_notes"
                              ? "warn"
                              : "error"
                        }
                      />
                      <p className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
                        Reviewer · {chosenVerdict.verdict.replace(/_/g, " ")}
                      </p>
                    </div>
                  )}

                  {/* ───────── the hero CTA ───────── */}
                  <div className="mt-10">
                    <button
                      className="btn-primary px-7 py-3.5 text-[14px]"
                      onClick={onGenerate}
                      disabled={state.kind === "generating"}
                    >
                      {state.kind === "generating"
                        ? "Generating DXF…"
                        : "Generate technical DXF"}
                    </button>
                    {state.kind === "done" && (
                      <a
                        className="btn-ghost ml-3 inline-flex"
                        href={exportDxfUrl(state.response.export_id)}
                        target="_blank"
                        rel="noreferrer"
                        download
                      >
                        Download ↗
                      </a>
                    )}
                    {state.kind === "error" && (
                      <p className="mt-3 font-mono text-[11px] text-clay">{state.message}</p>
                    )}
                  </div>

                  {state.kind === "generating" && (
                    <GeneratingPanel variant={STYLE_LABEL[chosenVariant.style]} scale={scale} />
                  )}

                  {/* ───────── knobs (kept discreet) ───────── */}
                  <div className="mt-10 flex flex-wrap items-end gap-8 border-t border-hairline pt-6">
                    <div>
                      <p className="label-xs text-ink-muted">Scale</p>
                      <div className="mt-2 flex gap-1">
                        {[50, 100, 200].map((s) => (
                          <button
                            key={s}
                            onClick={() => setScale(s)}
                            className={[
                              "rounded-md border px-3 py-1.5 font-mono text-[11px] transition-colors",
                              scale === s
                                ? "border-forest bg-forest/5 text-forest"
                                : "border-hairline text-ink-soft hover:border-mist-300",
                            ].join(" ")}
                          >
                            1:{s}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex-1 min-w-[180px]">
                      <p className="label-xs text-ink-muted">Project reference</p>
                      <input
                        value={projectRef}
                        onChange={(e) => setProjectRef(e.target.value)}
                        className="input-line mt-2 w-full font-mono text-[13px] text-ink"
                      />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <p className="label-xs text-ink-muted">Variant</p>
                      <div className="mt-2 flex gap-2">
                        {variants.map((v) => (
                          <button
                            key={v.style}
                            onClick={() => setSelected(v.style)}
                            className={[
                              "flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-[11px] transition-colors",
                              selected === v.style
                                ? "border-forest bg-forest/5 text-forest"
                                : "border-hairline text-ink-soft hover:border-mist-300",
                            ].join(" ")}
                          >
                            <span
                              className={`inline-block h-[6px] w-[6px] rounded-full ${STYLE_DOT[v.style]}`}
                            />
                            <span>{STYLE_LABEL[v.style]}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* ───────── done state : delivery card ───────── */}
          {state.kind === "done" && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="border-t border-hairline pt-14"
            >
              <p className="eyebrow-forest">Delivered</p>
              <div className="mt-5 grid gap-10 lg:grid-cols-[minmax(0,1.4fr),minmax(0,1fr)]">
                <div>
                  <h3
                    className="font-display text-[1.75rem] leading-tight text-ink"
                    style={{ fontVariationSettings: '"opsz" 96, "wght" 540, "SOFT" 100' }}
                  >
                    {state.response.dxf_filename}
                  </h3>
                  <p className="mt-2 font-mono text-[11px] uppercase tracking-label text-ink-muted">
                    {(state.response.dxf_bytes / 1024).toFixed(1)} KB · {state.response.sheet} ·{" "}
                    {state.response.scale} · {state.response.trace_length} ops
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {state.response.layers.map((layer) => (
                      <span
                        key={layer}
                        className="rounded-md border border-hairline bg-raised px-2.5 py-1 font-mono text-[10px] uppercase tracking-label text-ink-soft"
                      >
                        {layer}
                      </span>
                    ))}
                  </div>
                  <p className="mt-6 max-w-xl text-[13.5px] leading-relaxed text-ink-soft">
                    {state.response.plot_pdf_available ? (
                      <>
                        <span className="text-forest">AutoCAD is live</span> — a printable A1 PDF
                        was plotted alongside the DXF, following the cartouche spec.
                      </>
                    ) : (
                      <>
                        Generated via <span className="text-ink">ezdxf</span> headless. Opens
                        natively in AutoCAD, BricsCAD, or Adobe Illustrator. Launch AutoCAD with{" "}
                        <span className="font-mono text-[12px]">mcp_dispatch.lsp</span> loaded to
                        enable the live A1 PDF plot.
                      </>
                    )}
                  </p>
                </div>
                <aside className="lg:border-l lg:border-hairline lg:pl-8">
                  <p className="label-xs text-ink-muted">Backend pipeline</p>
                  <ul className="mt-5 space-y-5 text-[13px] leading-relaxed text-ink-soft">
                    <li className="flex items-start gap-3">
                      <DotStatus tone="ok" className="mt-1.5" />
                      <span>
                        <span className="text-ink">ezdxf headless</span> — default path, produces a
                        real DXF on disk, layers with colours by AIA index.
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <DotStatus
                        tone={state.response.plot_pdf_available ? "ok" : "idle"}
                        className="mt-1.5"
                      />
                      <span>
                        <span className="text-ink">File IPC live</span> — triggered when AutoCAD
                        is running with <span className="font-mono text-[11.5px]">mcp_dispatch.lsp</span>{" "}
                        loaded and <span className="font-mono text-[11.5px]">AUTOCAD_MCP_WATCH_DIR</span>{" "}
                        is set.
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <DotStatus tone="ok" className="mt-1.5" />
                      <span>
                        Every export lands as{" "}
                        <span className="font-mono text-[11.5px]">
                          backend/app/out/export/{"<id>"}.dxf
                        </span>{" "}
                        with a manifest JSON alongside for audit.
                      </span>
                    </li>
                  </ul>
                </aside>
              </div>
            </motion.section>
          )}
        </>
      )}
    </div>
  );
}

function GeneratingPanel({ variant, scale }: { variant: string; scale: number }) {
  const lines = [
    `Opening the A1 sheet at 1:${scale}…`,
    "Drawing the envelope, columns, cores, stairs…",
    "Replaying the variant trace — workstations, rooms, booths…",
    "Placing dimensions on the COTATIONS layer…",
    "Composing the title-block cartouche…",
    "Saving DXF + manifest to disk…",
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mt-8 rounded-md border border-hairline bg-raised/70 px-6 py-5"
    >
      <p className="eyebrow-forest">ezdxf · writing</p>
      <p
        className="mt-3 font-display text-[1.2rem] leading-tight text-ink"
        style={{ fontVariationSettings: '"opsz" 72, "wght" 540, "SOFT" 100' }}
      >
        <TypewriterText
          text={`Composing the ${variant.toLowerCase()} DXF…`}
          speed={22}
          caret
        />
      </p>
      <ul className="mt-6 space-y-2.5 font-mono text-[11px] uppercase tracking-label text-ink-muted">
        {lines.map((line, i) => (
          <li key={i} className="flex items-center gap-3">
            <span
              className="inline-block h-[6px] w-[6px] rounded-full bg-forest"
              style={{ animation: `dot-pulse 1.4s ease-in-out ${i * 0.15}s infinite` }}
            />
            <TypewriterText text={line} startDelay={i * 400} speed={18} />
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
