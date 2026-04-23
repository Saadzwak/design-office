import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import DotStatus from "../components/ui/DotStatus";
import TypewriterText from "../components/ui/TypewriterText";
import VariantViewer from "../components/viewer/VariantViewer";
import { useLiveScreenshots } from "../hooks/useLiveScreenshots";
import { useProjectState } from "../hooks/useProjectState";
import {
  fetchTestFitSample,
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
  villageois: "Neighbourhood",
  atelier: "Atelier",
  hybride_flex: "Hybrid flex",
};

const STYLE_DOT: Record<VariantOutput["style"], string> = {
  villageois: "bg-forest",
  atelier: "bg-sand-deep",
  hybride_flex: "bg-sun",
};

const DEFAULT_BRIEF = `Lumen, a fintech startup, 120 people today, 170 projected within 24 months.
Attendance policy: 3 days on-site, 2 remote. Tech teams pair-program heavily.
Culture is flat, transparent, with a strong team identity (product, tech, data, growth, ops).
Dominant work modes: synchronous collaboration, design sprints, pair programming,
deep focus for engineers, weekly all-hands rituals.
Stated asks: plenty of collaboration spaces, a central café (not tucked away),
quiet zones for deep work, no giant undifferentiated open space,
strong brand expression.
Available area: 2,400 m² usable across two floors connected by a central stair.
Cat B budget: 2.2 M€ excl. tax.
Climate: Paris, south façade onto the street, north façade onto an inner courtyard.`;

const FALLBACK_PROGRAMME = `# Functional programme — Lumen

- 170 FTE at 24 months, 3/2 on-site policy, flex ratio 0.75 (130 desks).
- 6 focus rooms, 14 phone booths, 8 huddles, 6 mid-sized meeting rooms, 2 boardrooms.
- 1 town-hall space 120 m², central café 260 m².
- Sources: design://office-programming, design://flex-ratios, design://collaboration-spaces.`;

type State =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; response: JustifyResponse }
  | { kind: "error"; message: string };

const AGENT_TYPING: Record<string, string> = {
  Acoustic: "Reading NF S 31-080 and open-office absorption studies…",
  Biophilic: "Weaving Browning's 14 biophilic patterns into the argument…",
  Regulatory: "Cross-checking arrêté 25 juin 1980 and code du travail…",
  Programming: "Benchmarking against Leesman & Gensler Workplace Survey…",
  Consolidator: "Folding the four voices into a single argumentaire…",
};

export default function Justify() {
  const project = useProjectState();
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
  const [state, setState] = useState<State>({ kind: "idle" });
  const [brief, setBrief] = useState(() =>
    localStorage.getItem("design-office.brief") ?? DEFAULT_BRIEF,
  );
  const [programme, setProgramme] = useState(() =>
    localStorage.getItem("design-office.programme") ?? FALLBACK_PROGRAMME,
  );

  // Cold-start demo mode : if the user lands here without running Test Fit
  // first, auto-load the saved Lumen fixture (3 variants + reviewers).
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
    setState({ kind: "running" });
    try {
      const response = await generateJustify({
        client_name: project.client.name || "Lumen",
        brief,
        programme_markdown: programme,
        floor_plan: floorPlan,
        variant: chosenVariant,
        language: "en",
        client_logo_data_url: project.client.logo_data_url,
      });
      setState({ kind: "done", response });
      localStorage.setItem("design-office.brief", brief);
      localStorage.setItem("design-office.programme", programme);
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="space-y-14">
      <header className="max-w-3xl">
        <p className="eyebrow-forest">
          IV · Justify
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
          A sourced <em className="italic">argumentaire</em>, in the client's language.
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
          Four research agents — Acoustic, Biophilic &amp; neuroarchitecture, Regulatory,
          Programming — run in parallel over the retained variant. A consolidator weaves
          them into a single document you can hand to the client.
        </p>
      </header>

      {/* ───────── variant selector + viewer (editorial masthead) ───────── */}
      <section className="grid gap-10 lg:grid-cols-[minmax(0,320px),minmax(0,1fr)]">
        <aside className="min-w-0 space-y-8">
          <div>
            <p className="label-xs text-ink-muted">Retained variant</p>
            {variants.length === 0 ? (
              <p className="mt-4 text-[13.5px] leading-relaxed text-ink-soft">
                No Test Fit result in this session. Go to{" "}
                <a className="text-forest underline-offset-2 hover:underline" href="/testfit">
                  Test Fit
                </a>{" "}
                first to generate three variants.
              </p>
            ) : (
              <ol className="mt-5 space-y-1">
                {variants.map((v) => {
                  const verdict = verdicts.find((r) => r.style === v.style);
                  const active = selected === v.style;
                  return (
                    <li key={v.style}>
                      <button
                        onClick={() => setSelected(v.style)}
                        className={[
                          "group flex w-full items-start gap-3 border-t border-hairline py-4 text-left transition-colors duration-200",
                          active ? "text-ink" : "text-ink-soft hover:text-ink",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "mt-[10px] inline-block h-[7px] w-[7px] shrink-0 rounded-full",
                            STYLE_DOT[v.style],
                            active ? "scale-125" : "",
                          ].join(" ")}
                        />
                        <div className="flex-1">
                          <span
                            className={[
                              "block font-display transition-transform duration-200 ease-out-gentle",
                              active
                                ? "text-[1.5rem] translate-x-1"
                                : "text-[1.35rem] group-hover:translate-x-1",
                            ].join(" ")}
                            style={{
                              fontVariationSettings: '"opsz" 96, "wght" 540, "SOFT" 100',
                            }}
                          >
                            {STYLE_LABEL[v.style]}
                          </span>
                          <p className="mt-1 font-mono text-[10px] uppercase tracking-label text-ink-muted">
                            {v.metrics.workstation_count} desks · flex{" "}
                            {v.metrics.flex_ratio_applied.toFixed(2)}
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
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between border-b border-hairline pb-3 text-left transition-colors hover:border-forest">
              <span className="label-xs text-ink-muted">Brief &amp; programme</span>
              <span className="font-mono text-[10px] uppercase tracking-label text-forest">
                Edit
              </span>
            </summary>
            <div className="mt-4 space-y-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
                  Brief
                </p>
                <textarea
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  className="mt-2 h-28 w-full resize-none rounded-md border border-hairline bg-raised px-3 py-2 font-mono text-[11px] text-ink focus:border-forest focus:outline-none"
                />
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
                  Programme (Markdown)
                </p>
                <textarea
                  value={programme}
                  onChange={(e) => setProgramme(e.target.value)}
                  className="mt-2 h-28 w-full resize-none rounded-md border border-hairline bg-raised px-3 py-2 font-mono text-[11px] text-ink focus:border-forest focus:outline-none"
                />
              </div>
            </div>
          </details>

          <div className="space-y-3 border-t border-hairline pt-8">
            <button
              className="btn-primary w-full"
              disabled={!chosenVariant || !floorPlan || state.kind === "running"}
              onClick={onGenerate}
            >
              {state.kind === "running" ? "Researching…" : "Generate argumentaire"}
            </button>

            {state.kind === "done" && state.response.pdf_id && (
              <a
                className="btn-ghost block w-full text-center"
                href={justifyPdfUrl(state.response.pdf_id)}
                target="_blank"
                rel="noreferrer"
              >
                Client PDF ↗
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
                Pitch deck PPTX ↗
              </a>
            )}
            {state.kind === "error" && (
              <p className="font-mono text-[11px] text-clay">{state.message}</p>
            )}
          </div>
        </aside>

        <div className="min-w-0 space-y-8">
          <motion.div
            key={selected ?? "none"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="aspect-[16/10] w-full min-w-0 overflow-hidden rounded-lg border border-hairline bg-raised"
          >
            <VariantViewer
              plan={floorPlan}
              variant={chosenVariant}
              style={selected ?? null}
              zones={zones}
              liveScreenshotUrl={selected ? liveScreenshots[selected] ?? null : null}
            />
          </motion.div>

          {chosenVariant && (
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1.4fr),minmax(0,1fr)]">
              <div className="min-w-0">
                <div className="flex items-baseline gap-4">
                  <span
                    className={`inline-block h-[9px] w-[9px] rounded-full ${STYLE_DOT[chosenVariant.style]}`}
                  />
                  <p className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
                    {STYLE_LABEL[chosenVariant.style]} · retained
                  </p>
                </div>
                <h2
                  className="mt-3 font-display text-[2rem] leading-tight text-ink"
                  style={{ fontVariationSettings: '"opsz" 96, "wght" 560, "SOFT" 100' }}
                >
                  {chosenVariant.title}
                </h2>
              </div>
              <aside className="min-w-0 lg:border-l lg:border-hairline lg:pl-8">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <EditorialMetric
                    label="Desks"
                    value={chosenVariant.metrics.workstation_count}
                  />
                  <EditorialMetric
                    label="Rooms"
                    value={chosenVariant.metrics.meeting_room_count}
                  />
                  <EditorialMetric
                    label="Booths"
                    value={chosenVariant.metrics.phone_booth_count}
                  />
                  <EditorialMetric
                    label="Flex"
                    value={chosenVariant.metrics.flex_ratio_applied.toFixed(2)}
                  />
                </dl>
                {chosenVerdict && (
                  <div className="mt-6 border-t border-hairline pt-4">
                    <div className="flex items-center gap-2">
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
                  </div>
                )}
              </aside>
            </div>
          )}
        </div>
      </section>

      {/* ───────── argumentaire spread (Kinfolk-style) ───────── */}
      <AnimatePresence mode="wait">
        {state.kind === "running" && (
          <motion.section
            key="running"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="border-t border-hairline pt-14"
          >
            <p className="eyebrow-forest">Opus 4.7 · parallel research</p>
            <h2
              className="mt-4 font-display text-[2.25rem] leading-tight text-ink"
              style={{ fontVariationSettings: '"opsz" 96, "wght" 560, "SOFT" 100' }}
            >
              Four researchers, one voice…
            </h2>
            <ul className="mt-10 grid gap-6 md:grid-cols-2">
              {Object.entries(AGENT_TYPING)
                .filter(([name]) => name !== "Consolidator")
                .map(([name, typing], i) => (
                  <li key={name} className="flex items-start gap-3">
                    <span
                      className="mt-[10px] inline-block h-[6px] w-[6px] rounded-full bg-forest"
                      style={{
                        animation: `dot-pulse 1.4s ease-in-out ${i * 0.16}s infinite`,
                      }}
                    />
                    <div>
                      <p
                        className="font-display text-[1.15rem] text-ink"
                        style={{ fontVariationSettings: '"opsz" 72, "wght" 520, "SOFT" 100' }}
                      >
                        {name}
                      </p>
                      <p className="mt-1 font-mono text-[11px] uppercase tracking-label text-forest">
                        <TypewriterText text={typing} startDelay={i * 320} speed={22} caret />
                      </p>
                    </div>
                  </li>
                ))}
            </ul>
          </motion.section>
        )}

        {state.kind === "done" && (
          <motion.section
            key="argumentaire"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="border-t border-hairline pt-14"
          >
            <div className="grid gap-16 lg:grid-cols-[minmax(0,1.6fr),minmax(0,1fr)]">
              <article className="min-w-0">
                <p className="eyebrow-forest">Argumentaire</p>
                <div className="mt-4 prose prose-lg max-w-none prose-headings:font-display prose-headings:text-ink prose-h1:text-[2.75rem] prose-h1:leading-tight prose-h2:text-[1.75rem] prose-p:text-ink-soft prose-p:leading-relaxed prose-strong:text-ink prose-a:text-forest prose-a:no-underline hover:prose-a:underline prose-blockquote:border-l-forest prose-blockquote:bg-mist-50/70 prose-blockquote:px-6 prose-blockquote:py-4 prose-blockquote:italic prose-blockquote:font-display prose-blockquote:text-ink prose-blockquote:text-[1.25rem] prose-blockquote:leading-snug">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {state.response.argumentaire}
                  </ReactMarkdown>
                </div>
                <hr className="my-10 border-hairline" />
                <p className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
                  {state.response.tokens.input.toLocaleString()} in ·{" "}
                  {state.response.tokens.output.toLocaleString()} out ·{" "}
                  {state.response.sub_outputs.length} agents
                </p>
              </article>

              <aside className="min-w-0 lg:border-l lg:border-hairline lg:pl-10">
                <p className="eyebrow-forest">Research trace</p>
                <div className="mt-5 space-y-3">
                  {state.response.sub_outputs
                    .filter((s) => s.name !== "Consolidator")
                    .map((s) => (
                      <TraceCard key={s.name} sub={s} />
                    ))}
                </div>
              </aside>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

function EditorialMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-label text-ink-muted">{label}</dt>
      <dd
        className="mt-1 font-display text-[1.6rem] leading-none text-ink"
        style={{ fontVariationSettings: '"opsz" 96, "wght" 520, "SOFT" 100' }}
      >
        {value}
      </dd>
    </div>
  );
}

function TraceCard({ sub }: { sub: JustifySubOutput }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-hairline bg-raised transition-colors hover:border-mist-300">
      <button
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <p
            className="font-display text-[1.05rem] text-ink"
            style={{ fontVariationSettings: '"opsz" 72, "wght" 520, "SOFT" 100' }}
          >
            {sub.name}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-label text-ink-muted">
            {(sub.tokens.input + sub.tokens.output).toLocaleString()} tok ·{" "}
            {(sub.duration_ms / 1000).toFixed(1)}s
          </p>
        </div>
        <span className="mt-1 font-mono text-[10px] uppercase tracking-label text-forest">
          {open ? "close" : "read"}
        </span>
      </button>
      {open && (
        <div className="border-t border-hairline px-5 pb-5 pt-4">
          <div className="prose prose-sm max-w-none prose-p:text-ink-soft prose-strong:text-ink">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{sub.text}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
