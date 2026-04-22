import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import PlanSvg from "../components/viewer/PlanSvg";
import {
  fetchCatalogPreview,
  fetchLumenFixture,
  generateTestFit,
  uploadPlanPdf,
  type CatalogPreview,
  type FloorPlan,
  type TestFitResponse,
  type VariantOutput,
} from "../lib/api";

type VariantStyle = "villageois" | "atelier" | "hybride_flex";

const STYLES: VariantStyle[] = ["villageois", "atelier", "hybride_flex"];

const STYLE_LABEL: Record<VariantStyle, string> = {
  villageois: "Villageois",
  atelier: "Atelier",
  hybride_flex: "Hybride flex",
};

const STYLE_SUBTITLE: Record<VariantStyle, string> = {
  villageois: "Quartiers par équipe, cœur collab central",
  atelier: "Concentration en façade, collab au centre",
  hybride_flex: "Flex 0.65, mobilier reconfigurable",
};

type State =
  | { kind: "idle" }
  | { kind: "parsing" }
  | { kind: "plan_ready"; plan: FloorPlan }
  | { kind: "generating"; plan: FloorPlan }
  | { kind: "done"; plan: FloorPlan; result: TestFitResponse }
  | { kind: "error"; message: string };

export default function TestFit() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [catalog, setCatalog] = useState<CatalogPreview | null>(null);
  const [active, setActive] = useState<VariantStyle>("villageois");
  const [programme, setProgramme] = useState(() =>
    localStorage.getItem("design-office.programme") ?? "",
  );

  useEffect(() => {
    const ac = new AbortController();
    fetchCatalogPreview(ac.signal).then(setCatalog).catch(() => null);
    fetchLumenFixture(ac.signal)
      .then((plan) => setState({ kind: "plan_ready", plan }))
      .catch((err) => setState({ kind: "error", message: String(err) }));
    return () => ac.abort();
  }, []);

  const onUpload = async (file: File) => {
    setState({ kind: "parsing" });
    try {
      const plan = await uploadPlanPdf(file, false);
      setState({ kind: "plan_ready", plan });
    } catch (err) {
      setState({ kind: "error", message: String(err) });
    }
  };

  const onGenerate = async () => {
    if (state.kind !== "plan_ready") return;
    const plan = state.plan;
    setState({ kind: "generating", plan });
    try {
      const result = await generateTestFit({
        floor_plan: plan,
        programme_markdown: programme || FALLBACK_PROGRAMME,
        client_name: "Lumen",
        styles: STYLES,
      });
      localStorage.setItem("design-office.programme", programme || FALLBACK_PROGRAMME);
      try {
        localStorage.setItem(
          "design-office.testfit.result",
          JSON.stringify({
            floor_plan: result.floor_plan,
            variants: result.variants,
            verdicts: result.verdicts,
          }),
        );
      } catch {
        // LocalStorage may be full ; ignore, Justify falls back to the fixture.
      }
      setState({ kind: "done", plan, result });
    } catch (err) {
      setState({ kind: "error", message: String(err) });
    }
  };

  const plan = state.kind === "idle" || state.kind === "parsing" || state.kind === "error"
    ? null
    : state.kind === "plan_ready"
      ? state.plan
      : state.kind === "generating"
        ? state.plan
        : state.plan;

  const result = state.kind === "done" ? state.result : null;
  const activeVariant = result?.variants.find((v) => v.style === active) ?? null;
  const activeVerdict = result?.verdicts.find((v) => v.style === active) ?? null;
  const activeZones = activeVariant ? zonesFromVariant(activeVariant) : [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-4xl">Test fit — 3D variants</h1>
        <p className="mt-3 max-w-2xl text-neutral-300">
          Opus Vision HD reads your plan, three sub-agents each build a contrasted
          variant in parallel, and a Reviewer validates against PMR / ERP / programme.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[380px,1fr]">
        <aside className="space-y-4">
          <div className="rounded-2xl border border-neutral-500/20 bg-neutral-800/20 p-6">
            <h2 className="font-serif text-lg">Plan source</h2>
            <label className="mt-4 block cursor-pointer rounded-xl border border-dashed border-neutral-500/40 p-6 text-center text-sm text-neutral-300 transition-colors hover:border-terracotta/60 hover:bg-neutral-700/30">
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                }}
              />
              {state.kind === "parsing"
                ? "Parsing…"
                : "Drop a PDF plan · or use the Lumen fixture (loaded by default)"}
            </label>
            {plan && (
              <dl className="mt-4 space-y-1 font-mono text-xs text-neutral-300">
                <Row k="name" v={plan.name ?? "—"} />
                <Row k="area" v={`${areaFromEnvelope(plan)} m²`} />
                <Row k="columns" v={String(plan.columns.length)} />
                <Row k="cores" v={String(plan.cores.length)} />
                <Row k="stairs" v={String(plan.stairs.length)} />
                <Row k="windows" v={String(plan.windows.length)} />
                <Row k="confidence" v={plan.source_confidence.toFixed(2)} />
              </dl>
            )}
          </div>

          <div className="rounded-2xl border border-neutral-500/20 bg-neutral-800/20 p-6">
            <h2 className="font-serif text-lg">Programme</h2>
            <p className="mt-2 text-xs text-neutral-400">
              Paste the Markdown programme produced by the Brief surface. This lets the variant
              generators respect the headcount and collab targets.
            </p>
            <textarea
              value={programme}
              onChange={(e) => setProgramme(e.target.value)}
              placeholder={FALLBACK_PROGRAMME}
              className="mt-3 h-32 w-full resize-none rounded-xl border border-neutral-500/30 bg-neutral-800/40 p-3 font-mono text-[11px] leading-relaxed text-bone-text focus:border-terracotta/50 focus:outline-none"
            />
          </div>

          <button
            className="btn-primary w-full"
            disabled={state.kind !== "plan_ready" && state.kind !== "done"}
            onClick={onGenerate}
          >
            {state.kind === "generating"
              ? "Generating 3 variants…"
              : state.kind === "done"
                ? "Regenerate"
                : "Generate 3 variants"}
          </button>

          {catalog && (
            <p className="font-mono text-[11px] text-neutral-500">
              Furniture catalog : {catalog.count} SKUs · {catalog.types.length} typologies
            </p>
          )}
          {state.kind === "error" && (
            <p className="font-mono text-xs text-terracotta">{state.message}</p>
          )}
        </aside>

        <section className="rounded-2xl border border-neutral-500/20 bg-neutral-800/20 p-6">
          <div className="flex items-center gap-2 border-b border-neutral-500/20 pb-4">
            {STYLES.map((s) => {
              const variant = result?.variants.find((v) => v.style === s);
              const verdict = result?.verdicts.find((v) => v.style === s);
              const dotColor =
                verdict?.verdict === "approved"
                  ? "bg-green-400/80"
                  : verdict?.verdict === "approved_with_notes"
                    ? "bg-ochre"
                    : verdict?.verdict === "rejected"
                      ? "bg-terracotta"
                      : "bg-neutral-500/40";
              return (
                <button
                  key={s}
                  onClick={() => setActive(s)}
                  className={[
                    "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors",
                    s === active
                      ? "bg-neutral-700/60 text-bone-text"
                      : "border border-neutral-500/30 text-neutral-300 hover:border-neutral-300/50",
                  ].join(" ")}
                >
                  <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
                  <span>{STYLE_LABEL[s]}</span>
                  {variant && (
                    <span className="font-mono text-[10px] text-neutral-400">
                      · {variant.metrics.workstation_count} postes
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr,1fr]">
            <motion.div
              key={active + (state.kind === "done" ? "done" : "plan")}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35 }}
              className="aspect-[3/2] overflow-hidden rounded-2xl border border-neutral-500/20 bg-neutral-900/60 p-2"
            >
              {plan ? (
                <PlanSvg plan={plan} highlightedVariant={active} zones={activeZones} />
              ) : (
                <div className="grid h-full place-items-center text-sm text-neutral-400">
                  Loading plan…
                </div>
              )}
            </motion.div>

            <div className="space-y-4">
              <p className="font-mono text-xs uppercase tracking-widest text-neutral-400">
                {STYLE_SUBTITLE[active]}
              </p>
              {activeVariant ? (
                <>
                  <h3 className="font-serif text-2xl">{activeVariant.title}</h3>
                  <div className="grid grid-cols-2 gap-3 font-mono text-xs text-neutral-200">
                    <Metric label="Postes" value={activeVariant.metrics.workstation_count} />
                    <Metric label="Réunions" value={activeVariant.metrics.meeting_room_count} />
                    <Metric label="Phone booths" value={activeVariant.metrics.phone_booth_count} />
                    <Metric
                      label="Flex ratio"
                      value={activeVariant.metrics.flex_ratio_applied.toFixed(2)}
                    />
                    <Metric label="Collab m²" value={Math.round(activeVariant.metrics.collab_surface_m2)} />
                    <Metric label="Total m²" value={Math.round(activeVariant.metrics.total_programmed_m2)} />
                  </div>
                  {activeVerdict && (
                    <div className="rounded-xl border border-neutral-500/20 bg-neutral-800/40 p-4">
                      <p className="font-mono text-[11px] uppercase tracking-widest text-neutral-400">
                        Reviewer · {activeVerdict.verdict.replace(/_/g, " ")}
                      </p>
                      <ul className="mt-2 space-y-1 text-xs text-neutral-300">
                        <li>PMR : {activeVerdict.pmr_ok ? "ok" : "à revoir"}</li>
                        <li>ERP : {activeVerdict.erp_ok ? "ok" : "à revoir"}</li>
                        <li>
                          Programme :{" "}
                          {activeVerdict.programme_coverage_ok ? "couvert" : "écart à combler"}
                        </li>
                        {activeVerdict.issues.map((it, i) => (
                          <li key={i} className="text-terracotta/90">
                            · {it}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <article className="prose prose-invert max-w-none text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {activeVariant.narrative}
                    </ReactMarkdown>
                  </article>
                </>
              ) : (
                <p className="text-sm text-neutral-400">
                  {state.kind === "generating"
                    ? "Three sub-agents are drafting variants in parallel. Each variant is replayed on the SketchUp MCP mock (no SketchUp required for now) and graded by the Reviewer."
                    : "Hit Generate to run the 3-variant orchestration. Each variant will emit a structured plan, get replayed on the SketchUp MCP backend (mock until SketchUp Pro is installed), and be reviewed against PMR / ERP / programme."}
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

const FALLBACK_PROGRAMME = `# Programme fonctionnel — Lumen

- 170 FTE à 24 mois, politique 3/2, flex ratio 0.75 (130 postes).
- 6 focus rooms, 14 phone booths, 8 huddles, 6 salles moyennes, 2 boardrooms.
- 1 town hall 120 m², café central 260 m².
- Sources : design://office-programming, design://flex-ratios, design://collaboration-spaces.`;

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="uppercase tracking-widest text-neutral-400">{k}</dt>
      <dd>{v}</dd>
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

function areaFromEnvelope(plan: FloorPlan): number {
  const pts = plan.envelope.points;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2 / 1_000_000;
}

function zonesFromVariant(v: VariantOutput) {
  return v.sketchup_trace
    .filter((e) =>
      [
        "create_workstation_cluster",
        "create_meeting_room",
        "create_phone_booth",
        "create_collab_zone",
        "apply_biophilic_zone",
      ].includes(e.tool),
    )
    .map((e) => ({
      kind: e.tool,
      bbox_mm: (e.params.bbox_mm as [number, number, number, number] | undefined) ?? undefined,
      origin_mm: (e.params.origin_mm as [number, number] | undefined) ?? undefined,
      position_mm: (e.params.position_mm as [number, number] | undefined) ?? undefined,
      corner1_mm: (e.params.corner1_mm as [number, number] | undefined) ?? undefined,
      corner2_mm: (e.params.corner2_mm as [number, number] | undefined) ?? undefined,
    }));
}
