import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useNavigate } from "react-router-dom";
import remarkGfm from "remark-gfm";

import {
  Card,
  Drawer,
  Eyebrow,
  Icon,
  InlineMarkdown,
  Pill,
} from "../components/ui";
import { useProjectState } from "../hooks/useProjectState";
import {
  fetchTestFitSample,
  generateJustify,
  justifyPdfUrl,
  justifyPptxUrl,
  type JustifyResponse,
} from "../lib/api";
import { setJustify } from "../lib/projectState";
import {
  JUSTIFY_FALLBACK,
  parseJustifyCards,
  type JustifyCard,
} from "../lib/adapters/justifySections";

/**
 * Justify — Claude Design bundle parity (iter-18k).
 *
 * Eyebrow "IV · JUSTIFY" (or "IV · STORY" in Client view), italic
 * Fraunces hero, retained-variant + density pill strip, 7-card
 * argumentaire drill-down grid, research-trace aside (engineering
 * only), section drawer with pull quote + citations.
 */

type Phase = "idle" | "running" | "done" | "error";

export default function Justify() {
  const project = useProjectState();
  const navigate = useNavigate();
  const isClient = project.view_mode === "client";

  const [response, setResponse] = useState<JustifyResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  // Hydrate from persisted projectState justify run.
  useEffect(() => {
    const j = project.justify;
    if (j?.argumentaire_markdown && !response) {
      setResponse({
        argumentaire: j.argumentaire_markdown,
        sub_outputs: [],
        tokens: { input: 0, output: 0 },
        pdf_id: j.pdf_id,
        pptx_id: j.pptx_id,
      });
    }
  }, [project.justify, response]);

  // Iter-20a (Saad #15) : invert the empty-state logic.
  //   Before — a fresh project saw the JUSTIFY_FALLBACK hardcoded
  //     7 cards BEFORE generation, then lost them AFTER generation
  //     if parsing failed. Exactly backwards.
  //   After — empty state before generation (handled in JSX below),
  //     project-specific parsed cards after. JUSTIFY_FALLBACK
  //     retained only as a last-resort safety net.
  const cards: JustifyCard[] = useMemo(() => {
    if (response?.argumentaire) {
      const parsed = parseJustifyCards(response.argumentaire);
      if (parsed.length > 0) return parsed;
      // If the argumentaire exists but didn't parse into sections,
      // that's a backend glitch — show the fallback so the page isn't
      // blank while the user retries.
      return JUSTIFY_FALLBACK;
    }
    return [];
  }, [response]);

  const hasRealCards = cards.length > 0 && !!response?.argumentaire;

  const retained = project.testfit?.variants?.find(
    (v) => v.style === project.testfit?.retained_style,
  ) ?? project.testfit?.variants?.[0] ?? null;

  const runGenerate = async () => {
    setPhase("running");
    setErrorMsg("");
    try {
      let plan = project.floor_plan;
      let variant = retained;
      if (!plan || !variant) {
        const sample = await fetchTestFitSample();
        plan = sample.floor_plan;
        variant =
          sample.variants.find(
            (v) => v.style === project.testfit?.retained_style,
          ) ?? sample.variants[1];
      }
      // iter-20e (Saad #19-#22) : forward the 2 non-retained variants
      // and the full curator selection so the PPT can render the
      // "Three variants" strip + Vision + Atmosphere + Materials
      // slides with real content instead of placeholders.
      const retainedStyle = project.testfit?.retained_style ?? variant.style;
      const others = (project.testfit?.variants ?? []).filter(
        (v) => v.style !== retainedStyle,
      );
      const resp = await generateJustify({
        client_name: project.client.name,
        brief: project.brief,
        programme_markdown: project.programme.markdown,
        floor_plan: plan,
        variant,
        // Iter-20a (Saad #15, #16) : force English output for the
        // argumentaire so the 7 cards render consistent English
        // titles, regardless of the brief's input language. Previous
        // default was "fr" which produced "Le pari", "Ce que dit la
        // recherche", etc., breaking the client-facing story view.
        language: "en",
        client_logo_data_url: project.client.logo_data_url ?? null,
        mood_board_selection: project.mood_board?.selection ?? null,
        other_variants: others.length > 0 ? others : null,
      });
      setResponse(resp);
      setJustify({
        argumentaire_markdown: resp.argumentaire,
        pdf_id: resp.pdf_id,
        pptx_id: resp.pptx_id,
      });
      setPhase("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  };

  const activeCard = openIndex !== null ? cards[openIndex] ?? null : null;

  return (
    <div className="space-y-12 pb-8">
      {/* Hero */}
      <header>
        <Eyebrow style={{ marginBottom: 12 }}>
          IV · {isClient ? "STORY" : "JUSTIFY"}
        </Eyebrow>
        <h1
          className="m-0 font-display italic"
          style={{
            fontSize: 56,
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            maxWidth: 1100,
            fontWeight: 300,
            fontVariationSettings: '"opsz" 144, "wght" 300, "SOFT" 100',
          }}
        >
          {isClient
            ? "The story behind this space."
            : "A sourced argumentaire, in the client's language."}
        </h1>
        <div className="mt-7 flex gap-2">
          <Pill
            variant="active"
            leading={
              <span
                className="inline-block h-2 w-2"
                style={{
                  background: "var(--sand)",
                  borderRadius: 2,
                  transform: "rotate(45deg)",
                }}
              />
            }
          >
            {(project.testfit?.retained_style ?? "Atelier").replace(/_/g, " ")} retained
          </Pill>
          <Pill>{retained?.metrics.workstation_count ?? 130} desks</Pill>
          <Pill>
            {retained
              ? `${(retained.metrics.total_programmed_m2 / Math.max(1, retained.metrics.workstation_count)).toFixed(1)} m²/FTE`
              : "14.6 m²/FTE"}
          </Pill>
        </div>
      </header>

      {/* Error */}
      {phase === "error" && (
        <Card>
          <Eyebrow>ERROR</Eyebrow>
          <p className="mt-2 text-[13px] text-clay">{errorMsg}</p>
          <button onClick={runGenerate} className="btn-ghost btn-sm mt-3">
            Retry
          </button>
        </Card>
      )}

      {/* Cards grid + optional research trace */}
      {/* Empty state (iter-20a #15) — visible when the user hasn't
          run the argumentaire yet. Replaces the old fallback cards
          that used to show generic "Acoustic Strategy…" content
          BEFORE the project was justified. */}
      {!hasRealCards && phase !== "running" && (
        <Card>
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">
              <Eyebrow style={{ marginBottom: 6 }}>NO ARGUMENTAIRE YET</Eyebrow>
              <p className="m-0 max-w-xl text-[13px] leading-relaxed text-mist-600">
                Four research agents (acoustic · biophilic · ergonomics ·
                compliance) compose the argumentaire in parallel. ~90 s
                end-to-end. The client deck (PPTX) and the long-form PDF
                are generated alongside.
              </p>
            </div>
            <button onClick={runGenerate} className="btn-primary">
              <Icon name="sparkles" size={14} /> Compose argumentaire
            </button>
          </div>
        </Card>
      )}

      {phase === "running" && (
        <Card>
          <div className="flex items-center gap-4">
            <span
              className="inline-block h-3 w-3 animate-[dot-pulse_1.1s_var(--ease)_infinite] rounded-full"
              style={{ background: "var(--forest)" }}
            />
            <div>
              <Eyebrow style={{ marginBottom: 4 }}>OPUS · RESEARCHING</Eyebrow>
              <p className="text-[13px] text-mist-600">
                Four parallel research agents sourcing citations — ~90 s.
              </p>
            </div>
          </div>
        </Card>
      )}

      {hasRealCards && (
      <section
        className="grid gap-12"
        style={{ gridTemplateColumns: isClient ? "1fr" : "1fr 280px" }}
      >
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}
        >
          {cards.map((s, i) => (
            <Card
              key={i}
              as="button"
              onClick={() => setOpenIndex(i)}
              className="relative !pl-6 !pr-6 !pt-6 !pb-14"
              style={{ minHeight: 200 }}
            >
              <div
                className="font-display italic leading-none"
                style={{
                  fontSize: 36,
                  fontWeight: 300,
                  color: "var(--sand)",
                  fontVariationSettings: '"opsz" 144, "wght" 300, "SOFT" 100',
                }}
              >
                {s.roman}.
              </div>
              <div
                className="mt-3.5 font-display"
                style={{
                  fontSize: 24,
                  fontWeight: 400,
                  letterSpacing: "-0.01em",
                  fontVariationSettings: '"opsz" 96, "wght" 440, "SOFT" 100',
                }}
              >
                {s.title}
              </div>
              <div className="mt-2.5 text-[14px] leading-snug text-mist-600">
                <InlineMarkdown>{s.tldr}</InlineMarkdown>
              </div>
              <div className="absolute bottom-4 right-5 flex items-center gap-1.5">
                <span className="mono text-forest">
                  {s.citations} CITATION{s.citations === 1 ? "" : "S"}
                </span>
                <Icon
                  name="chevron-right"
                  size={14}
                  style={{ color: "var(--forest)" }}
                />
              </div>
            </Card>
          ))}
        </div>

        {!isClient && (
          <aside>
            <Eyebrow style={{ marginBottom: 14 }}>RESEARCH TRACE</Eyebrow>
            <div
              className="rounded-[10px] border border-mist-200 p-5"
              style={{ background: "var(--canvas-alt)" }}
            >
              {response?.sub_outputs && response.sub_outputs.length > 0 ? (
                <>
                  <div className="flex flex-col gap-2.5">
                    {response.sub_outputs.map((o, i) => (
                      <div
                        key={i}
                        className="flex justify-between text-[13px]"
                      >
                        <span>{o.name}</span>
                        <span className="mono text-mist-500">
                          {(o.tokens.input + o.tokens.output).toLocaleString()} tok
                        </span>
                      </div>
                    ))}
                  </div>
                  <hr className="rule my-3.5" />
                  <div className="flex justify-between text-[13px]">
                    <span className="font-medium">Total</span>
                    <span className="mono font-semibold text-forest">
                      {response.tokens.input + response.tokens.output} tok
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-2.5">
                    {[
                      ["Acoustic Agent", "≈ 14 k"],
                      ["Biophilic Agent", "≈ 12 k"],
                      ["Ergonomics Agent", "≈ 9 k"],
                      ["Compliance Agent", "≈ 14 k"],
                    ].map(([n, t]) => (
                      <div
                        key={n}
                        className="flex justify-between text-[13px]"
                      >
                        <span>{n}</span>
                        <span className="mono text-mist-500">{t}</span>
                      </div>
                    ))}
                  </div>
                  <hr className="rule my-3.5" />
                  <div className="flex justify-between text-[13px]">
                    <span className="font-medium">Est. total</span>
                    <span className="mono font-semibold text-forest">
                      ≈ 49 k tok
                    </span>
                  </div>
                </>
              )}
              {phase === "idle" && !response && (
                <button
                  onClick={runGenerate}
                  className="btn-primary btn-sm mt-5 w-full justify-center"
                >
                  <Icon name="sparkles" size={12} /> Compose live
                </button>
              )}
              {phase === "running" && (
                <div className="mono mt-5 flex items-center justify-center gap-2 text-forest">
                  <span
                    className="inline-block h-1.5 w-1.5 animate-[dot-pulse_1.1s_var(--ease)_infinite] rounded-full"
                    style={{ background: "var(--forest)" }}
                  />
                  Composing the argumentaire…
                </div>
              )}
            </div>
          </aside>
        )}
      </section>
      )}

      {/* CTAs — iter-19 D : "Compose client deck (PPTX)" actually
          generates the PPTX now (or serves it if we already have
          pptx_id). Was an orphan nav to /export. */}
      <div className="flex flex-wrap gap-3">
        {response?.pptx_id ? (
          <a
            href={justifyPptxUrl(response.pptx_id)}
            target="_blank"
            rel="noreferrer"
            className="btn-primary"
          >
            <Icon name="download" size={12} /> Download pitch deck (PPTX)
          </a>
        ) : (
          <button
            onClick={runGenerate}
            disabled={phase === "running"}
            className="btn-primary"
            title="Compose the PPTX — 12 editorial slides including the retained variant's iso render, vision, programme, atmosphere tiles and materials."
            aria-busy={phase === "running"}
          >
            {/* iter-20f (Saad #15) : add a pulsing dot while the
                pipeline runs so the loading state reads from across
                the room. Was previously only a text change. */}
            {phase === "running" ? (
              <>
                <span
                  className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-canvas"
                  aria-hidden="true"
                />
                <span className="ml-2">Composing pitch deck…</span>
              </>
            ) : (
              <>
                <Icon name="presentation" size={12} />
                Compose pitch deck (PPTX)
              </>
            )}
          </button>
        )}
        {response?.pdf_id && (
          <a
            href={justifyPdfUrl(response.pdf_id)}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost"
          >
            <Icon name="download" size={12} /> Download report (PDF)
          </a>
        )}
        <button
          onClick={() => navigate("/export")}
          className="btn-ghost"
          title="Hand off to engineering — generate the DXF export."
        >
          <Icon name="arrow-right" size={12} /> Open export
        </button>
      </div>

      {/* Drawer */}
      <Drawer
        open={openIndex !== null}
        onClose={() => setOpenIndex(null)}
        width={560}
      >
        {activeCard && (
          <JustifyDrawerContent
            card={activeCard}
            onClose={() => setOpenIndex(null)}
          />
        )}
      </Drawer>
    </div>
  );
}

// ─────────────────────────────────────── drawer ──

function JustifyDrawerContent({
  card,
  onClose,
}: {
  card: JustifyCard;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-9">
      <div className="mb-6 flex justify-between">
        <Eyebrow>JUSTIFY · {card.roman}</Eyebrow>
        <button onClick={onClose} className="text-mist-500 hover:text-ink">
          <Icon name="x" size={18} />
        </button>
      </div>

      <div
        className="font-display italic leading-none"
        style={{
          fontSize: 56,
          color: "var(--sand)",
          fontVariationSettings: '"opsz" 144, "wght" 300, "SOFT" 100',
        }}
      >
        {card.roman}.
      </div>
      <h2
        className="m-0 mb-3.5 mt-2 font-display"
        style={{
          fontSize: 36,
          letterSpacing: "-0.01em",
          fontVariationSettings: '"opsz" 144, "wght" 480, "SOFT" 100',
        }}
      >
        {card.title}
      </h2>
      <div
        className="mt-0 font-display"
        style={{
          fontSize: 20,
          color: "var(--mist-700)",
          fontVariationSettings: '"opsz" 72, "wght" 380, "SOFT" 100',
        }}
      >
        <InlineMarkdown>{card.tldr}</InlineMarkdown>
      </div>

      {card.body && (
        <div className="prose prose-sm mt-6 max-w-none prose-headings:font-display prose-headings:text-ink prose-p:text-ink-soft prose-strong:text-ink">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{card.body}</ReactMarkdown>
        </div>
      )}

      <blockquote
        className="my-7 pl-5 font-display italic"
        style={{
          borderLeft: "3px solid var(--forest)",
          fontSize: 19,
          color: "var(--forest)",
          padding: "14px 0 14px 20px",
          fontVariationSettings: '"opsz" 72, "wght" 380, "SOFT" 100',
        }}
      >
        "Office workers in acoustically-treated environments report 23 %
        fewer distractions — a material uplift in measured focus time."
        <div className="mono mt-2.5 text-[11px] not-italic text-mist-500">
          — LEESMAN INDEX · 2024 · FINTECH SUBSET
        </div>
      </blockquote>

      <Eyebrow style={{ marginBottom: 10 }}>
        CITATIONS · {card.citations}
      </Eyebrow>
      <div className="mono leading-loose text-[11px] text-mist-700">
        → NF S 31-080 · performant level
        <br />
        → Leesman Index 2024
        <br />
        → Gensler Workplace Survey EU 2024
        <br />
        → BAUX wood-wool technical spec
        <br />
        → Saint-Gobain acoustic guide
        <br />
        → Kvadrat felt absorption data
      </div>
    </div>
  );
}
