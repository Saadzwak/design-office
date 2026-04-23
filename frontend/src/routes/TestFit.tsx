import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import DotStatus from "../components/ui/DotStatus";
import TypewriterText from "../components/ui/TypewriterText";
import VariantViewer from "../components/viewer/VariantViewer";
import { useLiveScreenshots } from "../hooks/useLiveScreenshots";
import { useProjectState } from "../hooks/useProjectState";
import {
  fetchCatalogPreview,
  fetchLumenFixture,
  generateTestFit,
  iterateVariant,
  uploadPlanPdf,
  type CatalogPreview,
  type FloorPlan,
  type TestFitResponse,
  type VariantOutput,
} from "../lib/api";
import {
  setFloorPlan,
  setLiveScreenshot,
  setProgramme as persistProgramme,
  setTestFit,
  upsertVariant,
} from "../lib/projectState";

type VariantStyle = "villageois" | "atelier" | "hybride_flex";

const STYLES: VariantStyle[] = ["villageois", "atelier", "hybride_flex"];

const STYLE_LABEL: Record<VariantStyle, string> = {
  villageois: "Neighbourhood",
  atelier: "Atelier",
  hybride_flex: "Hybrid flex",
};

const STYLE_TAGLINE: Record<VariantStyle, string> = {
  villageois: "Team neighbourhoods with a central collaboration core.",
  atelier: "Focus at the façade, collab in the centre.",
  hybride_flex: "Flex 0.65, reconfigurable furniture, brand-forward.",
};

const STYLE_NUMERAL: Record<VariantStyle, string> = {
  villageois: "i.",
  atelier: "ii.",
  hybride_flex: "iii.",
};

// Each variant carries a distinct pigment (a small dot, a hairline — never a whole band).
const STYLE_DOT: Record<VariantStyle, string> = {
  villageois: "bg-forest",
  atelier: "bg-sand-deep",
  hybride_flex: "bg-sun",
};

type State =
  | { kind: "idle" }
  | { kind: "parsing" }
  | { kind: "plan_ready"; plan: FloorPlan }
  | { kind: "generating"; plan: FloorPlan }
  | { kind: "done"; plan: FloorPlan; result: TestFitResponse }
  | { kind: "error"; message: string };

type IterationEntry = {
  instruction: string;
  tokens: { input: number; output: number };
  duration_ms: number;
  ts: string;
  success: boolean;
  error?: string;
};

const FALLBACK_PROGRAMME = `# Functional programme — Lumen

- 170 FTE at 24 months, 3/2 on-site policy, flex ratio 0.75 (130 desks).
- 6 focus rooms, 14 phone booths, 8 huddles, 6 mid-sized meeting rooms, 2 boardrooms.
- 1 town-hall space 120 m², central café 260 m².
- Sources: design://office-programming, design://flex-ratios, design://collaboration-spaces.`;

export default function TestFit() {
  const project = useProjectState();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [catalog, setCatalog] = useState<CatalogPreview | null>(null);
  const [active, setActive] = useState<VariantStyle>("villageois");
  const [programme, setProgramme] = useState(() => project.programme.markdown ?? "");
  const [showProgramme, setShowProgramme] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [iterating, setIterating] = useState(false);
  const [history, setHistory] = useState<IterationEntry[]>([]);
  const liveScreenshots = useLiveScreenshots();

  useEffect(() => {
    const ac = new AbortController();
    fetchCatalogPreview(ac.signal).then(setCatalog).catch(() => null);

    const restored = (() => {
      try {
        const raw = localStorage.getItem("design-office.testfit.result");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.floor_plan || !parsed?.variants?.length) return null;
        return parsed as TestFitResponse;
      } catch {
        return null;
      }
    })();

    if (restored) {
      setState({ kind: "done", plan: restored.floor_plan, result: restored });
    } else {
      fetchLumenFixture(ac.signal)
        .then((plan) => setState({ kind: "plan_ready", plan }))
        .catch((err) => setState({ kind: "error", message: String(err) }));
    }

    return () => ac.abort();
  }, []);

  const onUpload = async (file: File) => {
    setState({ kind: "parsing" });
    try {
      const plan = await uploadPlanPdf(file, false);
      setState({ kind: "plan_ready", plan });
      setFloorPlan(plan);
    } catch (err) {
      setState({ kind: "error", message: String(err) });
    }
  };

  const onGenerate = async () => {
    if (state.kind !== "plan_ready" && state.kind !== "done") return;
    const plan = state.kind === "done" ? state.plan : state.plan;
    setState({ kind: "generating", plan });
    try {
      const result = await generateTestFit({
        floor_plan: plan,
        programme_markdown: programme || FALLBACK_PROGRAMME,
        client_name: project.client.name || "Lumen",
        styles: STYLES,
      });
      persistProgramme({ markdown: programme || FALLBACK_PROGRAMME });
      // Unified project state — single source of truth for Justify + Export +
      // Mood Board + chat. Keep the legacy key dual-written for one more
      // release to ease rollback and the cold-start demo mode.
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
        /* ignore */
      }
      setTestFit({
        floor_plan: result.floor_plan,
        variants: result.variants,
        verdicts: result.verdicts,
        live_screenshots: project.testfit?.live_screenshots ?? {},
        retained_style: null,
      });
      setState({ kind: "done", plan, result });
    } catch (err) {
      setState({ kind: "error", message: String(err) });
    }
  };

  const persistResult = (
    floor_plan: FloorPlan,
    variants: VariantOutput[],
    verdicts: TestFitResponse["verdicts"],
  ) => {
    try {
      localStorage.setItem(
        "design-office.testfit.result",
        JSON.stringify({ floor_plan, variants, verdicts }),
      );
    } catch {
      /* ignore */
    }
  };

  const onIterate = async () => {
    if (state.kind !== "done") return;
    const trimmed = instruction.trim();
    if (trimmed.length < 3) return;
    const current = state.result.variants.find((v) => v.style === active);
    if (!current) return;

    setIterating(true);
    try {
      const resp = await iterateVariant({
        instruction: trimmed,
        floor_plan: state.plan,
        variant: current,
        programme_markdown: programme || FALLBACK_PROGRAMME,
        client_name: "Lumen",
      });
      const updatedVariants = state.result.variants.map((v) =>
        v.style === active ? resp.variant : v,
      );
      const nextResult: TestFitResponse = {
        ...state.result,
        variants: updatedVariants,
      };
      persistResult(state.plan, updatedVariants, state.result.verdicts);
      upsertVariant(resp.variant);
      if (resp.screenshot_url) {
        try {
          const raw = localStorage.getItem("design-office.testfit.live_screenshots");
          const map: Record<string, string> = raw ? JSON.parse(raw) : {};
          map[active] = resp.screenshot_url;
          localStorage.setItem(
            "design-office.testfit.live_screenshots",
            JSON.stringify(map),
          );
        } catch {
          /* ignore */
        }
        setLiveScreenshot(active, resp.screenshot_url);
      }
      setState({ kind: "done", plan: state.plan, result: nextResult });
      setHistory((h) => [
        {
          instruction: trimmed,
          tokens: resp.tokens,
          duration_ms: resp.duration_ms,
          ts: new Date().toISOString(),
          success: true,
        },
        ...h,
      ]);
      setInstruction("");
    } catch (err) {
      setHistory((h) => [
        {
          instruction: trimmed,
          tokens: { input: 0, output: 0 },
          duration_ms: 0,
          ts: new Date().toISOString(),
          success: false,
          error: err instanceof Error ? err.message : String(err),
        },
        ...h,
      ]);
    } finally {
      setIterating(false);
    }
  };

  const plan =
    state.kind === "idle" || state.kind === "parsing" || state.kind === "error"
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
    <div className="space-y-12">
      <header>
        <p className="eyebrow-forest">II · Test fit</p>
        <h1
          className="mt-5 font-display text-display-sm leading-[1.02] text-ink"
          style={{ fontVariationSettings: '"opsz" 144, "wght" 620, "SOFT" 100' }}
        >
          Three variants, <em className="italic">one plan</em>.
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
          Opus Vision HD reads the plan. Three sub-agents compose contrasted variants in
          parallel. A Reviewer tests each against PMR, ERP and the programme.
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,340px),minmax(0,1fr)]">
        {/* ───────── left rail : plan + variants ───────── */}
        <aside className="min-w-0 space-y-10">
          <section>
            <p className="label-xs text-ink-muted">Plan source</p>
            <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 border-b border-hairline pb-3 text-[13.5px] text-ink transition-colors hover:border-forest">
              <span className="truncate">
                {state.kind === "parsing"
                  ? "Parsing…"
                  : plan?.name
                    ? plan.name
                    : "Lumen · fixture"}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-label text-forest">
                Drop PDF
              </span>
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                }}
              />
            </label>
            {plan && (
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-label text-ink-muted">
                <Row k="area" v={`${areaFromEnvelope(plan)} m²`} />
                <Row k="columns" v={String(plan.columns.length)} />
                <Row k="cores" v={String(plan.cores.length)} />
                <Row k="windows" v={String(plan.windows.length)} />
                <Row k="stairs" v={String(plan.stairs.length)} />
                <Row k="confidence" v={plan.source_confidence.toFixed(2)} />
              </dl>
            )}
          </section>

          <section>
            <button
              type="button"
              className="flex w-full items-center justify-between border-b border-hairline pb-3 text-left transition-colors hover:border-forest"
              onClick={() => setShowProgramme((v) => !v)}
            >
              <span className="label-xs text-ink-muted">Programme</span>
              <span className="font-mono text-[10px] uppercase tracking-label text-forest">
                {showProgramme ? "Hide" : programme ? "Edit" : "Use fixture"}
              </span>
            </button>
            {showProgramme && (
              <textarea
                value={programme}
                onChange={(e) => setProgramme(e.target.value)}
                placeholder={FALLBACK_PROGRAMME}
                rows={10}
                className="mt-3 w-full resize-none rounded-md border border-hairline bg-raised px-3 py-3 font-mono text-[11px] leading-relaxed text-ink focus:border-forest focus:outline-none"
              />
            )}
            {!showProgramme && (
              <p className="mt-3 text-[12.5px] leading-relaxed text-ink-muted">
                {programme
                  ? `${programme.split("\n")[0].replace(/^#+\s*/, "")}`
                  : "Lumen fixture · 130 desks · flex 0.75 · 6 boardrooms, 14 booths."}
              </p>
            )}
          </section>

          <section>
            <p className="label-xs text-ink-muted">Variants</p>
            <ol className="mt-5 space-y-1">
              {STYLES.map((s) => {
                const variant = result?.variants.find((v) => v.style === s);
                const verdict = result?.verdicts.find((v) => v.style === s);
                const isActive = s === active;
                const isGenerating = state.kind === "generating";
                return (
                  <li key={s}>
                    <button
                      onClick={() => setActive(s)}
                      className={[
                        "group flex w-full items-start gap-4 border-t border-hairline py-5 text-left transition-all duration-200 ease-out-gentle",
                        isActive ? "text-ink" : "text-ink-soft hover:text-ink",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "mt-[10px] inline-block h-[7px] w-[7px] shrink-0 rounded-full transition-all",
                          STYLE_DOT[s],
                          isActive ? "scale-125" : "",
                          isGenerating ? "animate-dot-pulse" : "",
                        ].join(" ")}
                      />
                      <div className="flex-1">
                        <div className="flex items-baseline gap-3">
                          <span className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
                            {STYLE_NUMERAL[s]}
                          </span>
                          <span
                            className={[
                              "font-display transition-transform duration-200 ease-out-gentle",
                              isActive
                                ? "text-[1.55rem] translate-x-1"
                                : "text-[1.4rem] group-hover:translate-x-1",
                            ].join(" ")}
                            style={{
                              fontVariationSettings: '"opsz" 96, "wght" 560, "SOFT" 100',
                            }}
                          >
                            {STYLE_LABEL[s]}
                          </span>
                        </div>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
                          {STYLE_TAGLINE[s]}
                        </p>
                        {variant && (
                          <p className="mt-2 font-mono text-[10px] uppercase tracking-label text-ink-muted">
                            {variant.metrics.workstation_count} desks ·{" "}
                            {variant.metrics.meeting_room_count} rooms ·{" "}
                            {variant.metrics.phone_booth_count} booths
                            {verdict && (
                              <>
                                {" · "}
                                <span
                                  className={
                                    verdict.verdict === "approved"
                                      ? "text-forest"
                                      : verdict.verdict === "approved_with_notes"
                                        ? "text-sand-deep"
                                        : verdict.verdict === "rejected"
                                          ? "text-clay"
                                          : "text-ink-muted"
                                  }
                                >
                                  {verdict.verdict.replace(/_/g, " ")}
                                </span>
                              </>
                            )}
                          </p>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
              <li className="border-t border-hairline pt-5">
                <button
                  className="btn-primary w-full"
                  disabled={
                    state.kind === "generating" ||
                    (state.kind !== "plan_ready" && state.kind !== "done")
                  }
                  onClick={onGenerate}
                >
                  {state.kind === "generating"
                    ? "Composing 3 variants…"
                    : state.kind === "done"
                      ? "Regenerate"
                      : "Generate 3 variants"}
                </button>
                {catalog && (
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-label text-ink-muted">
                    {catalog.count} SKUs · {catalog.types.length} typologies
                  </p>
                )}
                {state.kind === "error" && (
                  <p className="mt-3 font-mono text-[11px] text-clay">{state.message}</p>
                )}
              </li>
            </ol>
          </section>
        </aside>

        {/* ───────── right : viewer + verdict + iterate ───────── */}
        <section className="min-w-0 space-y-8">
          <motion.div
            key={active + (state.kind === "done" ? "done" : state.kind)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="aspect-[16/10] w-full min-w-0 overflow-hidden rounded-lg border border-hairline bg-raised"
          >
            <VariantViewer
              plan={plan}
              variant={activeVariant}
              style={active}
              zones={activeZones}
              defaultView={state.kind === "done" ? "3d" : "2d"}
              liveScreenshotUrl={liveScreenshots[active] ?? null}
            />
          </motion.div>

          {state.kind === "generating" && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="rounded-md border border-hairline bg-raised/70 px-6 py-5"
            >
              <p className="eyebrow-forest">Opus 4.7 · parallel</p>
              <p
                className="mt-3 font-display text-[1.35rem] text-ink"
                style={{ fontVariationSettings: '"opsz" 72, "wght" 540, "SOFT" 100' }}
              >
                <TypewriterText
                  text="Three sub-agents are drafting variants in parallel…"
                  speed={24}
                  caret
                />
              </p>
            </motion.div>
          )}

          {activeVariant && (
            <motion.div
              key={activeVariant.style + (activeVariant.metrics.workstation_count)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="grid gap-10 lg:grid-cols-[minmax(0,1.55fr),minmax(0,1fr)]"
            >
              <article className="min-w-0">
                <div className="flex items-baseline gap-4">
                  <span
                    className={`inline-block h-[9px] w-[9px] rounded-full ${STYLE_DOT[active]}`}
                  />
                  <p className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
                    {STYLE_NUMERAL[active]} {STYLE_LABEL[active]}
                  </p>
                </div>
                <h2
                  className="mt-3 font-display text-[2rem] leading-tight text-ink"
                  style={{ fontVariationSettings: '"opsz" 96, "wght" 560, "SOFT" 100' }}
                >
                  {activeVariant.title}
                </h2>
                <p className="mt-2 text-[13px] text-ink-muted">{STYLE_TAGLINE[active]}</p>

                <div className="mt-6 prose prose-sm max-w-none prose-p:text-ink-soft prose-strong:text-ink prose-headings:font-display prose-headings:text-ink">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {activeVariant.narrative}
                  </ReactMarkdown>
                </div>
              </article>

              <aside className="min-w-0 lg:border-l lg:border-hairline lg:pl-8">
                <p className="label-xs text-ink-muted">Metrics</p>
                <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5">
                  <EditorialMetric
                    label="Desks"
                    value={activeVariant.metrics.workstation_count}
                  />
                  <EditorialMetric
                    label="Rooms"
                    value={activeVariant.metrics.meeting_room_count}
                  />
                  <EditorialMetric
                    label="Booths"
                    value={activeVariant.metrics.phone_booth_count}
                  />
                  <EditorialMetric
                    label="Flex"
                    value={activeVariant.metrics.flex_ratio_applied.toFixed(2)}
                  />
                  <EditorialMetric
                    label="Collab m²"
                    value={Math.round(activeVariant.metrics.collab_surface_m2)}
                  />
                  <EditorialMetric
                    label="Total m²"
                    value={Math.round(activeVariant.metrics.total_programmed_m2)}
                  />
                </dl>

                {activeVerdict && (
                  <div className="mt-8 border-t border-hairline pt-5">
                    <div className="flex items-center gap-3">
                      <DotStatus
                        tone={
                          activeVerdict.verdict === "approved"
                            ? "ok"
                            : activeVerdict.verdict === "approved_with_notes"
                              ? "warn"
                              : activeVerdict.verdict === "rejected"
                                ? "error"
                                : "idle"
                        }
                      />
                      <p className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
                        Reviewer · {activeVerdict.verdict.replace(/_/g, " ")}
                      </p>
                    </div>
                    <ul className="mt-4 space-y-1.5 text-[12.5px] text-ink-soft">
                      <li>PMR · {activeVerdict.pmr_ok ? "ok" : "review needed"}</li>
                      <li>ERP · {activeVerdict.erp_ok ? "ok" : "review needed"}</li>
                      <li>
                        Programme ·{" "}
                        {activeVerdict.programme_coverage_ok ? "covered" : "gap to close"}
                      </li>
                      {activeVerdict.issues.map((it, i) => (
                        <li key={i} className="text-clay">
                          · {it}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </aside>
            </motion.div>
          )}

          {!activeVariant && state.kind !== "generating" && (
            <p className="max-w-xl text-[14px] leading-relaxed text-ink-muted">
              Hit <em>Generate 3 variants</em> to run the orchestration. Each variant emits a
              structured plan, is replayed against the SketchUp MCP backend (mock if Pro is not
              running), and is graded by the Reviewer.
            </p>
          )}

          {state.kind === "done" && activeVariant && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="border-t border-hairline pt-8"
            >
              <p className="label-xs text-ink-muted">Iterate in natural language</p>
              <p className="mt-2 text-[13px] text-ink-soft">
                Try <em>"agrandis la boardroom"</em>,{" "}
                <em>"push the desks to the south façade"</em>, or{" "}
                <em>"add two phone booths near the café"</em>.
              </p>
              <div className="mt-5 flex gap-3">
                <input
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      onIterate();
                    }
                  }}
                  placeholder="Describe the modification…"
                  className="flex-1 rounded-md border border-hairline bg-raised px-4 py-2.5 text-[14px] text-ink placeholder:text-ink-muted focus:border-forest focus:outline-none"
                  disabled={iterating}
                />
                <button
                  className="btn-primary"
                  onClick={onIterate}
                  disabled={iterating || instruction.trim().length < 3}
                >
                  {iterating ? "Iterating…" : "Apply"}
                </button>
              </div>

              {iterating && (
                <IteratingPanel variant={STYLE_LABEL[active]} instruction={instruction} />
              )}

              {history.length > 0 && (
                <ul className="mt-6 space-y-1">
                  {history.slice(0, 5).map((entry, i) => (
                    <li
                      key={i}
                      className="flex items-start justify-between gap-6 border-t border-hairline py-3"
                    >
                      <div className="flex items-start gap-3 text-[13px]">
                        <DotStatus
                          tone={entry.success ? "ok" : "error"}
                          className="mt-1.5"
                        />
                        <div>
                          <p className="text-ink">{entry.instruction}</p>
                          {entry.error && (
                            <p className="mt-1 text-[11px] text-clay">{entry.error}</p>
                          )}
                        </div>
                      </div>
                      <span className="mt-1 shrink-0 font-mono text-[10px] uppercase tracking-label text-ink-muted">
                        {entry.success
                          ? `${entry.tokens.input + entry.tokens.output} tok · ${(
                              entry.duration_ms / 1000
                            ).toFixed(1)}s`
                          : "failed"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}
        </section>
      </div>
    </div>
  );
}

function IteratingPanel({ variant, instruction }: { variant: string; instruction: string }) {
  const lines = [
    `Reading the current ${variant.toLowerCase()} variant…`,
    `Interpreting "${instruction.slice(0, 80)}${instruction.length > 80 ? "…" : ""}"`,
    "Generating the modified structured plan…",
    "Replaying against the SketchUp MCP backend…",
    "Re-validating PMR circulations and programme coverage…",
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mt-6 rounded-md border border-hairline bg-raised/70 px-6 py-5"
    >
      <p className="eyebrow-forest">Opus 4.7 · iterating</p>
      <p
        className="mt-3 font-display text-[1.2rem] leading-tight text-ink"
        style={{ fontVariationSettings: '"opsz" 72, "wght" 540, "SOFT" 100' }}
      >
        <TypewriterText
          text={`Rewriting the ${variant} variant…`}
          speed={22}
          caret
        />
      </p>
      <ul className="mt-6 space-y-2.5 font-mono text-[11px] uppercase tracking-label text-ink-muted">
        {lines.map((line, i) => (
          <li key={i} className="flex items-center gap-3">
            <span
              className="inline-block h-[6px] w-[6px] rounded-full bg-forest"
              style={{ animation: `dot-pulse 1.4s ease-in-out ${i * 0.18}s infinite` }}
            />
            <TypewriterText text={line} startDelay={i * 450} speed={20} />
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{k}</dt>
      <dd className="text-ink">{v}</dd>
    </div>
  );
}

function EditorialMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
        {label}
      </dt>
      <dd
        className="mt-1 font-display text-[1.75rem] leading-none text-ink"
        style={{ fontVariationSettings: '"opsz" 96, "wght" 520, "SOFT" 100' }}
      >
        {value}
      </dd>
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
