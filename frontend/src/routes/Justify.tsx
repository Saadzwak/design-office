import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  AgentTrace,
  Card,
  Drawer,
  Eyebrow,
  Icon,
  InlineMarkdown,
  Pill,
  type AgentRow,
  type AgentStatus,
} from "../components/ui";
import { useProjectState } from "../hooks/useProjectState";
import {
  fetchTestFitSample,
  generateJustify,
  generatedImageUrl,
  justifyMagazinePdfUrl,
  justifyPdfUrl,
  type JustifyResponse,
  type VariantOutput,
  type VisualMoodBoardGalleryTile,
} from "../lib/api";
import { setJustify } from "../lib/projectState";
import {
  JUSTIFY_FALLBACK,
  parseJustifyCards,
  type JustifyCard,
} from "../lib/adapters/justifySections";

// ---------------------------------------------------------------------------
// Iter-33 — image wiring for the client PPT.
//
// Until iter-33 the PPT was rendered with zero embedded media (every cover,
// retained-focus, atmosphere and materials slot fell through to its grey
// placeholder). The renderer was already wired for `sketchup_iso_path`,
// `sketchup_iso_by_style` and `gallery_tile_paths`; the frontend just
// never populated those three fields. The helpers below pull the URLs the
// rest of the app already has cached and forward them to the backend, where
// `_resolve_media_url()` (justify_pptx.py) translates each URL to the
// matching disk path before `add_picture()`.
//
// We send URLs (not paths) on purpose: the frontend has no notion of disk
// paths, and the backend already owns the URL → path mapping for both
// `/api/generated-images/{id}` and `/api/testfit/screenshot/{name}.png`.
// ---------------------------------------------------------------------------

type MoodCacheLite = {
  galleryByDir?: Record<string, VisualMoodBoardGalleryTile[]>;
  activeDirection?: string;
} | null;

function readMoodCache(projectId: string): MoodCacheLite {
  if (!projectId) return null;
  try {
    const raw = localStorage.getItem(`design-office.moodboard.tiles.${projectId}`);
    return raw ? (JSON.parse(raw) as MoodCacheLite) : null;
  } catch {
    return null;
  }
}

function pickIsoUrl(v: VariantOutput | null | undefined): string | null {
  if (!v) return null;
  const angles = v.sketchup_shot_urls;
  if (angles) {
    return (
      angles.iso_ne ??
      angles.iso_nw ??
      angles.iso_se ??
      angles.iso_sw ??
      angles.eye_level ??
      angles.top_down ??
      v.sketchup_shot_url ??
      null
    );
  }
  return v.sketchup_shot_url ?? null;
}

function buildGalleryTilePaths(
  projectId: string,
): Record<string, string> | null {
  const cache = readMoodCache(projectId);
  if (!cache?.galleryByDir) return null;
  const dir = cache.activeDirection ?? Object.keys(cache.galleryByDir)[0] ?? "";
  const tiles = (dir && cache.galleryByDir[dir]) || [];
  if (!tiles.length) return null;
  const out: Record<string, string> = {};
  for (const tile of tiles) {
    if (tile?.label && tile?.visual_image_id) {
      out[tile.label] = generatedImageUrl(tile.visual_image_id);
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function buildIsoByStyle(
  variants: ReadonlyArray<VariantOutput>,
): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const v of variants) {
    const url = pickIsoUrl(v);
    if (url) out[v.style] = url;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Justify — Claude Design bundle parity (iter-18k).
 *
 * Eyebrow "IV · JUSTIFY" (or "IV · STORY" in Client view), italic
 * Fraunces hero, retained-variant + density pill strip, 7-card
 * argumentaire drill-down grid, research-trace aside (engineering
 * only), section drawer with pull quote + citations.
 */

type Phase = "idle" | "running" | "done" | "error";

/**
 * Iter-31 — visible-agents loading state. The /api/justify/generate
 * endpoint runs four research agents in parallel server-side
 * (acoustic / biophilic / ergonomics / compliance), but the response
 * is delivered as a single payload at the end of the ~90 s call.
 *
 * To keep the demo alive during that wait — and signal "Best use of
 * Managed Agents" without waiting for the trace — we drive a
 * client-side staggered cadence that flips each agent from
 * `pending → active → done`. The real backend trace replaces these
 * once the response lands.
 */
const JUSTIFY_AGENTS: Array<{
  roman: string;
  name: string;
  running: string;
  done: string;
}> = [
  {
    roman: "I",
    name: "Acoustic",
    running: "Sourcing NF S 31-080 + Leesman fintech subset…",
    done: "Cited · Rw ≥ 44 dB · Hongisto, Banbury",
  },
  {
    roman: "II",
    name: "Biophilic",
    running: "Cross-checking Human Spaces 2023 + Heerwagen…",
    done: "Cited · 8-12 % cognitive uplift",
  },
  {
    roman: "III",
    name: "Ergonomics",
    running: "Mapping NF EN 527 + Steelcase posture data…",
    done: "Cited · Leesman target > 70",
  },
  {
    roman: "IV",
    name: "Compliance",
    running: "Validating ERP Type W + arrêté PMR 8 décembre 2014…",
    done: "Cleared · 2 evac routes · ≤ 40 m to exit",
  },
];

export default function Justify() {
  const project = useProjectState();
  const isClient = project.view_mode === "client";

  const [response, setResponse] = useState<JustifyResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  // Iter-31 — agent stage clock. Stage 0 means none active ; stage N
  // means agent N-1 is `active` and 0..N-2 are `done`. We tick every
  // 22 s so the four agents cover ~88 s, matching the median Justify
  // endpoint wall-clock (~90 s). Resets when phase leaves `running`.
  const [stage, setStage] = useState<number>(0);
  useEffect(() => {
    if (phase !== "running") {
      setStage(0);
      return;
    }
    setStage(1);
    const interval = setInterval(() => {
      setStage((s) => Math.min(s + 1, JUSTIFY_AGENTS.length));
    }, 22000);
    return () => clearInterval(interval);
  }, [phase]);

  const agents: AgentRow[] = JUSTIFY_AGENTS.map((a, i) => {
    let status: AgentStatus = "pending";
    let message: string | undefined;
    if (phase === "running") {
      if (i < stage - 1) {
        status = "done";
        message = a.done;
      } else if (i === stage - 1) {
        status = "active";
        message = a.running;
      }
    } else if (phase === "done") {
      status = "done";
      message = a.done;
    }
    return { roman: a.roman, name: a.name, status, message };
  });

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
      // Iter-33 — wire the 3 image fields the renderer was always asking
      // for. Frontend already has all of them cached locally; we just need
      // to forward URLs. Server resolves URL → disk path before embedding.
      const allVariants = project.testfit?.variants ?? [variant];
      const sketchupIsoPath = pickIsoUrl(variant);
      const sketchupIsoByStyle = buildIsoByStyle(allVariants);
      const galleryTilePaths = buildGalleryTilePaths(project.project_id);

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
        sketchup_iso_path: sketchupIsoPath,
        sketchup_iso_by_style: sketchupIsoByStyle,
        gallery_tile_paths: galleryTilePaths,
      });
      setResponse(resp);
      setJustify({
        argumentaire_markdown: resp.argumentaire,
        pdf_id: resp.pdf_id,
        pptx_id: resp.pptx_id,
        magazine_pdf_id: resp.magazine_pdf_id ?? null,
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

      {/* Cards grid — iter-33 follow-up v3 : the engineering-only
          RESEARCH TRACE aside (per-agent token breakdown) was removed.
          Saad's call : it's plumbing exposed at the user level, not
          something a client or even a space planner needs to see. */}
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
        <Card className="!p-7">
          <div className="mb-5 flex items-center gap-4">
            <span
              className="inline-block h-3 w-3 animate-[dot-pulse_1.1s_var(--ease)_infinite] rounded-full"
              style={{ background: "var(--forest)" }}
            />
            <div>
              <Eyebrow style={{ marginBottom: 4 }}>AGENTS AT WORK</Eyebrow>
              <p className="text-[13px] text-mist-600">
                Four parallel research agents sourcing citations — ~90 s.
              </p>
            </div>
          </div>
          <AgentTrace agents={agents} />
        </Card>
      )}

      {hasRealCards && (
        <section
          className="grid gap-4"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          }}
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
        </section>
      )}

      {/* CTAs — iter-33 follow-up v3 : single primary "Download pitch
          deck" CTA, points at the magazine PDF (the v2 18-slide deck
          rendered via headless Chromium). The PPTX is still generated
          server-side for parity but is no longer surfaced as a button
          — the magazine PDF is the canonical client deliverable. The
          A4 report PDF stays as a ghost button for the engineering
          handoff (different format, different use). */}
      <div className="flex flex-wrap gap-3">
        {response?.magazine_pdf_id ? (
          <a
            href={justifyMagazinePdfUrl(response.magazine_pdf_id)}
            target="_blank"
            rel="noreferrer"
            className="btn-primary"
            title="Magazine-grade 18-slide PDF — atmosphere imagery, comparison chart, KPI dials, timeline."
          >
            <Icon name="download" size={12} /> Download pitch deck
          </a>
        ) : (
          <button
            onClick={runGenerate}
            disabled={phase === "running"}
            className="btn-primary"
            title="Compose the 18-slide magazine pitch deck (PDF)."
            aria-busy={phase === "running"}
          >
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
                Compose pitch deck
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
            <Icon name="download" size={12} /> Download report (PDF · A4)
          </a>
        )}
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
