import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import VariantViewer from "../components/viewer/VariantViewer";
import {
  fetchLumenFixture,
  generateJustify,
  justifyPdfUrl,
  justifyPptxUrl,
  type FloorPlan,
  type JustifyResponse,
  type JustifySubOutput,
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

const DEFAULT_BRIEF = `Lumen, startup fintech, 120 personnes aujourd'hui, 170 projetées d'ici 24 mois.
Politique de présence : 3 jours au bureau, 2 télétravail, équipes tech largement en pair programming.
Culture plat, transparente, forte identité par équipe (produit, tech, data, growth, ops).
Modes de travail dominants : collaboration synchrone, design sprints, pair programming,
focus profond pour les devs, rituels all-hands hebdomadaires.
Demandes explicites : beaucoup d'espaces collab, cafétéria centrale pas reléguée,
zones calmes pour concentration, pas d'open space géant indifférencié,
expression de la marque forte.
Surface disponible : 2400 m² utiles sur 2 niveaux reliés par escalier central.
Budget Cat B : 2,2 M€ HT.
Climat : Paris, façade sud donnant sur rue, façade nord donnant sur cour intérieure.`;

const FALLBACK_PROGRAMME = `# Programme fonctionnel — Lumen

- 170 FTE à 24 mois, politique 3/2, flex ratio 0.75 (130 postes).
- 6 focus rooms, 14 phone booths, 8 huddles, 6 salles moyennes, 2 boardrooms.
- 1 town hall 120 m², café central 260 m².
- Sources : design://office-programming, design://flex-ratios, design://collaboration-spaces.`;

type State =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; response: JustifyResponse }
  | { kind: "error"; message: string };

export default function Justify() {
  const [stored] = useState<PersistedTestFit | null>(() => {
    try {
      const raw = localStorage.getItem("design-office.testfit.result");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [floorPlanFallback, setFloorPlanFallback] = useState<FloorPlan | null>(null);
  const [selected, setSelected] = useState<VariantOutput["style"] | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [brief, setBrief] = useState(() =>
    localStorage.getItem("design-office.brief") ?? DEFAULT_BRIEF,
  );
  const [programme, setProgramme] = useState(() =>
    localStorage.getItem("design-office.programme") ?? FALLBACK_PROGRAMME,
  );

  useEffect(() => {
    if (stored) return;
    const ac = new AbortController();
    fetchLumenFixture(ac.signal).then(setFloorPlanFallback).catch(() => null);
    return () => ac.abort();
  }, [stored]);

  const variants = stored?.variants ?? [];
  const verdicts = stored?.verdicts ?? [];
  const floorPlan = stored?.floor_plan ?? floorPlanFallback;

  // Default selection: first approved_with_notes or approved variant ; else first one.
  useEffect(() => {
    if (selected || variants.length === 0) return;
    const preferred =
      variants.find(
        (v) =>
          verdicts.find((r) => r.style === v.style)?.verdict === "approved_with_notes" ||
          verdicts.find((r) => r.style === v.style)?.verdict === "approved",
      ) ?? variants[0];
    setSelected(preferred.style);
  }, [variants, verdicts, selected]);

  const chosenVariant = variants.find((v) => v.style === selected) ?? null;
  const chosenVerdict = verdicts.find((v) => v.style === selected) ?? null;
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
    setState({ kind: "running" });
    try {
      const response = await generateJustify({
        client_name: "Lumen",
        brief,
        programme_markdown: programme,
        floor_plan: floorPlan,
        variant: chosenVariant,
        language: "fr",
      });
      setState({ kind: "done", response });
      localStorage.setItem("design-office.brief", brief);
      localStorage.setItem("design-office.programme", programme);
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-4xl">Justify — sourced argumentaire</h1>
        <p className="mt-3 max-w-2xl text-neutral-300">
          Four research agents (Acoustic, Biophilic & neuroarchitecture, Regulatory, Programming)
          run in parallel over the retained variant. A consolidator merges them into a single
          client-facing argumentaire, with a downloadable A4 PDF.
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
                first to generate the three variants.
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
                        : verdict?.verdict === "rejected"
                          ? "bg-terracotta"
                          : "bg-neutral-500/50";
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
                            {v.metrics.workstation_count} postes · flex{" "}
                            {v.metrics.flex_ratio_applied.toFixed(2)} · {verdict?.verdict ?? "—"}
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
            <h2 className="font-serif text-lg">Brief & programme</h2>
            <label className="mt-3 block font-mono text-[11px] uppercase tracking-widest text-neutral-400">
              Brief
            </label>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              className="mt-1 h-28 w-full resize-none rounded-xl border border-neutral-500/30 bg-neutral-800/40 p-2 font-mono text-[11px] text-bone-text focus:border-terracotta/50 focus:outline-none"
            />
            <label className="mt-3 block font-mono text-[11px] uppercase tracking-widest text-neutral-400">
              Programme (Markdown)
            </label>
            <textarea
              value={programme}
              onChange={(e) => setProgramme(e.target.value)}
              className="mt-1 h-28 w-full resize-none rounded-xl border border-neutral-500/30 bg-neutral-800/40 p-2 font-mono text-[11px] text-bone-text focus:border-terracotta/50 focus:outline-none"
            />
          </div>

          <button
            className="btn-primary w-full"
            disabled={!chosenVariant || !floorPlan || state.kind === "running"}
            onClick={onGenerate}
          >
            {state.kind === "running"
              ? "Research in progress…"
              : "Generate sourced argumentaire"}
          </button>

          {state.kind === "done" && state.response.pdf_id && (
            <a
              className="btn-ghost block w-full text-center"
              href={justifyPdfUrl(state.response.pdf_id)}
              target="_blank"
              rel="noreferrer"
            >
              Download client PDF
            </a>
          )}
          {state.kind === "done" && state.response.pptx_id && (
            <a
              className="btn-ghost block w-full text-center"
              href={justifyPptxUrl(state.response.pptx_id)}
              target="_blank"
              rel="noreferrer"
              download
            >
              Download pitch deck (PPTX)
            </a>
          )}
          {state.kind === "error" && (
            <p className="font-mono text-xs text-terracotta">{state.message}</p>
          )}
        </aside>

        <section className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr,1.3fr]">
            <div className="aspect-[3/2] rounded-2xl border border-neutral-500/20 bg-neutral-800/20 p-3">
              <VariantViewer
                plan={floorPlan}
                variant={chosenVariant}
                style={selected ?? null}
                zones={zones}
              />
            </div>
            <div className="space-y-3">
              {chosenVariant ? (
                <>
                  <p className="font-mono text-xs uppercase tracking-widest text-neutral-400">
                    {STYLE_LABEL[chosenVariant.style]}
                  </p>
                  <h2 className="font-serif text-2xl">{chosenVariant.title}</h2>
                  <div className="grid grid-cols-2 gap-2 text-xs text-neutral-300">
                    <Metric label="Postes" value={chosenVariant.metrics.workstation_count} />
                    <Metric label="Réunions" value={chosenVariant.metrics.meeting_room_count} />
                    <Metric label="Phone booths" value={chosenVariant.metrics.phone_booth_count} />
                    <Metric
                      label="Flex ratio"
                      value={chosenVariant.metrics.flex_ratio_applied.toFixed(2)}
                    />
                  </div>
                  {chosenVerdict && (
                    <div className="rounded-xl border border-neutral-500/20 bg-neutral-800/40 p-3 text-xs text-neutral-300">
                      <p className="font-mono text-[11px] uppercase tracking-widest text-neutral-400">
                        Reviewer · {chosenVerdict.verdict.replace(/_/g, " ")}
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        <li>PMR : {chosenVerdict.pmr_ok ? "ok" : "à revoir"}</li>
                        <li>ERP : {chosenVerdict.erp_ok ? "ok" : "à revoir"}</li>
                        <li>
                          Programme :{" "}
                          {chosenVerdict.programme_coverage_ok ? "couvert" : "écart à combler"}
                        </li>
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-neutral-400">Pick a variant on the left.</p>
              )}
            </div>
          </div>

          <AnimatePresence>
            {state.kind === "done" && (
              <motion.article
                key="argumentaire"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="prose prose-invert max-w-none rounded-2xl border border-neutral-500/20 bg-neutral-800/20 p-8"
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {state.response.argumentaire}
                </ReactMarkdown>
                <hr />
                <p className="font-mono text-[11px] text-neutral-400">
                  {state.response.tokens.input.toLocaleString()} in ·{" "}
                  {state.response.tokens.output.toLocaleString()} out · {state.response.sub_outputs.length} agents
                </p>
              </motion.article>
            )}
          </AnimatePresence>

          {state.kind === "done" && (
            <div className="grid gap-3 md:grid-cols-2">
              {state.response.sub_outputs
                .filter((s) => s.name !== "Consolidator")
                .map((s) => (
                  <TraceCard key={s.name} sub={s} />
                ))}
            </div>
          )}
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

function TraceCard({ sub }: { sub: JustifySubOutput }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-neutral-500/20 bg-neutral-800/30 p-4">
      <button
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-serif text-lg">{sub.name}</span>
        <span className="font-mono text-[11px] text-neutral-400">
          {sub.tokens.input + sub.tokens.output} tok · {(sub.duration_ms / 1000).toFixed(1)} s
        </span>
      </button>
      {open && (
        <div className="prose prose-invert mt-4 max-w-none text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{sub.text}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
