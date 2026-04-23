import { motion } from "framer-motion";
import { useEffect, useState } from "react";

import DotStatus from "../components/ui/DotStatus";
import TypewriterText from "../components/ui/TypewriterText";
import { useProjectState } from "../hooks/useProjectState";
import {
  generateMoodBoard,
  moodBoardPdfUrl,
  type MoodBoardResponse,
} from "../lib/api";
import {
  INDUSTRY_LABEL,
  setMoodBoard,
  type VariantStyle,
} from "../lib/projectState";

type State =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; resp: MoodBoardResponse }
  | { kind: "error"; message: string };

const STYLE_LABEL: Record<VariantStyle, string> = {
  villageois: "Neighbourhood",
  atelier: "Atelier",
  hybride_flex: "Hybrid flex",
};

const STYLE_DOT: Record<VariantStyle, string> = {
  villageois: "bg-forest",
  atelier: "bg-sand-deep",
  hybride_flex: "bg-sun",
};

export default function MoodBoard() {
  const project = useProjectState();
  const [state, setState] = useState<State>({ kind: "idle" });
  // Restore the last render for this project, if any.
  useEffect(() => {
    if (project.mood_board?.pdf_id && state.kind === "idle") {
      // Synthesise a pseudo-response so we can show the download link
      // without re-calling Opus.
      setState({
        kind: "done",
        resp: {
          pdf_id: project.mood_board.pdf_id,
          selection: { palette: project.mood_board.palette },
          tokens: { input: 0, output: 0 },
          duration_ms: 0,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retained = project.testfit?.retained_style
    ? project.testfit.variants.find((v) => v.style === project.testfit?.retained_style) ?? null
    : project.testfit?.variants?.[0] ?? null;

  const onGenerate = async () => {
    if (!retained) return;
    setState({ kind: "running" });
    try {
      const resp = await generateMoodBoard({
        client: {
          name: project.client.name,
          industry: project.client.industry,
          logo_data_url: project.client.logo_data_url ?? null,
        },
        brief: project.brief,
        programme_markdown: project.programme.markdown,
        variant: retained,
      });
      setMoodBoard({
        pdf_id: resp.pdf_id,
        palette:
          ((resp.selection.atmosphere as { palette?: Array<{ hex?: string }> } | undefined)
            ?.palette ?? [])
            .map((p) => p.hex)
            .filter((s): s is string => typeof s === "string"),
      });
      setState({ kind: "done", resp });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="space-y-14">
      <header className="max-w-3xl">
        <p className="eyebrow-forest">III · Mood Board</p>
        <h1
          className="mt-5 font-display text-display-sm leading-[1.02] text-ink"
          style={{ fontVariationSettings: '"opsz" 144, "wght" 620, "SOFT" 100' }}
        >
          The <em className="italic">atmosphere</em>, before the plan.
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
          A curated A3 landscape — palette, materials, furniture, planting and
          light — tuned to the client's industry and retained variant.
          Everything on the page is a real product from a real manufacturer.
        </p>
      </header>

      <section className="grid gap-10 lg:grid-cols-[minmax(0,320px),minmax(0,1fr)]">
        <aside className="min-w-0 space-y-8">
          <div>
            <p className="label-xs text-ink-muted">Client</p>
            <p
              className="mt-3 font-display text-[1.75rem] leading-tight text-ink"
              style={{ fontVariationSettings: '"opsz" 72, "wght" 520, "SOFT" 100' }}
            >
              {project.client.name || "—"}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-label text-ink-muted">
              {INDUSTRY_LABEL[project.client.industry]}
            </p>
          </div>

          <div>
            <p className="label-xs text-ink-muted">Retained variant</p>
            {retained ? (
              <div className="mt-3 flex items-start gap-3">
                <span
                  className={`mt-[10px] inline-block h-[7px] w-[7px] rounded-full ${STYLE_DOT[retained.style as VariantStyle]}`}
                />
                <div>
                  <p
                    className="font-display text-[1.25rem] text-ink"
                    style={{ fontVariationSettings: '"opsz" 72, "wght" 540, "SOFT" 100' }}
                  >
                    {STYLE_LABEL[retained.style as VariantStyle]}
                  </p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-label text-ink-muted">
                    {retained.metrics.workstation_count} desks · flex{" "}
                    {retained.metrics.flex_ratio_applied.toFixed(2)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-[13.5px] leading-relaxed text-ink-muted">
                No retained variant yet. Run{" "}
                <a className="text-forest hover:underline" href="/testfit">
                  Test Fit
                </a>{" "}
                first.
              </p>
            )}
          </div>

          <div className="space-y-3 border-t border-hairline pt-6">
            <button
              className="btn-primary w-full"
              disabled={!retained || state.kind === "running"}
              onClick={onGenerate}
            >
              {state.kind === "running"
                ? "Curating…"
                : state.kind === "done"
                  ? "Re-curate mood board"
                  : "Compose mood board"}
            </button>
            {state.kind === "done" && (
              <a
                className="btn-ghost block w-full text-center"
                href={moodBoardPdfUrl(state.resp.pdf_id)}
                target="_blank"
                rel="noreferrer"
              >
                Mood board A3 PDF ↗
              </a>
            )}
            {state.kind === "error" && (
              <p className="font-mono text-[11px] text-clay">{state.message}</p>
            )}
          </div>
        </aside>

        <div className="min-w-0 space-y-8">
          {state.kind === "running" && <CuratingPanel client={project.client.name} />}
          {state.kind === "done" && <SelectionPreview selection={state.resp.selection} />}
          {state.kind === "idle" && !project.mood_board && (
            <EmptyHint />
          )}
        </div>
      </section>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="rounded-lg border border-hairline bg-raised px-8 py-10">
      <p className="eyebrow-forest">What a mood board does</p>
      <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
        A mood board communicates the atmosphere before the plan. Clients read
        it in thirty seconds; if the feeling lands, the test-fit lands with it.
        Design Office's curator picks a palette, six to eight materials from a
        real catalogue, four to six signature furniture pieces, a planting
        strategy and a lighting strategy — all tuned to the client's industry
        profile — and lays them out on a single A3 landscape page.
      </p>
      <ul className="mt-6 space-y-2 font-mono text-[11px] uppercase tracking-label text-ink-muted">
        <li>Palette — 5 swatches, hero + secondary + accent</li>
        <li>Materials — floors, walls, ceilings, textiles (6–8)</li>
        <li>Furniture — signature pieces with dimensions (4–6)</li>
        <li>Planting — strategy + species (3–4)</li>
        <li>Light — strategy + fixtures (2–3)</li>
      </ul>
    </div>
  );
}

function CuratingPanel({ client }: { client: string }) {
  const lines = [
    `Reading ${client || "the client"}'s brief + retained variant…`,
    "Scanning design://client-profiles for programming bias…",
    "Sourcing materials from design://material-finishes…",
    "Picking signature furniture from the 41-SKU catalogue…",
    "Selecting plant species + lighting Kelvin strategy…",
    "Laying out the six sections on the A3 page…",
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-md border border-hairline bg-raised/70 px-6 py-5"
    >
      <p className="eyebrow-forest">Opus 4.7 · curating</p>
      <p
        className="mt-3 font-display text-[1.35rem] leading-tight text-ink"
        style={{ fontVariationSettings: '"opsz" 72, "wght" 540, "SOFT" 100' }}
      >
        <TypewriterText text="Composing the mood board…" speed={22} caret />
      </p>
      <ul className="mt-6 space-y-2.5 font-mono text-[11px] uppercase tracking-label text-ink-muted">
        {lines.map((line, i) => (
          <li key={i} className="flex items-center gap-3">
            <span
              className="inline-block h-[6px] w-[6px] rounded-full bg-forest"
              style={{ animation: `dot-pulse 1.4s ease-in-out ${i * 0.16}s infinite` }}
            />
            <TypewriterText text={line} startDelay={i * 420} speed={20} />
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

function SelectionPreview({ selection }: { selection: Record<string, unknown> }) {
  const atmosphere = (selection.atmosphere as
    | { palette?: Array<{ name?: string; hex?: string; role?: string }> }
    | undefined) ?? {};
  const palette = atmosphere.palette ?? [];
  const materials = (selection.materials as Array<{
    name?: string;
    brand?: string;
    category?: string;
    application?: string;
    swatch_hex?: string;
    sustainability?: string;
  }>) ?? [];
  const furniture = (selection.furniture as Array<{
    brand?: string;
    model?: string;
    category?: string;
    application?: string;
    dimensions_mm?: { w?: number; d?: number; h?: number };
  }>) ?? [];
  const planting = (selection.planting as {
    strategy?: string;
    species?: Array<{ name?: string; light?: string; care?: string }>;
  }) ?? {};
  const light = (selection.light as {
    strategy?: string;
    fixtures?: Array<{ brand?: string; model?: string; category?: string; application?: string }>;
  }) ?? {};
  const tagline =
    (selection.header as { tagline?: string } | undefined)?.tagline ?? "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-12"
    >
      {tagline && (
        <section>
          <p className="eyebrow-forest">Tagline</p>
          <p
            className="mt-4 font-display text-[1.75rem] leading-[1.15] text-ink"
            style={{ fontVariationSettings: '"opsz" 96, "wght" 460, "SOFT" 100' }}
          >
            <em className="italic">"</em>
            {tagline}
            <em className="italic">"</em>
          </p>
        </section>
      )}

      {palette.length > 0 && (
        <section>
          <p className="eyebrow-forest">Atmosphere palette</p>
          <div className="mt-5 flex flex-wrap gap-4">
            {palette.map((sw, i) => (
              <div key={i} className="flex min-w-[120px] items-center gap-3">
                <span
                  className="inline-block h-10 w-10 rounded-md border border-hairline"
                  style={{ backgroundColor: sw.hex ?? "#E8E3D8" }}
                />
                <div>
                  <p className="font-display text-[14px] text-ink">{sw.name}</p>
                  <p className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
                    {sw.hex} · {sw.role}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {materials.length > 0 && (
        <section>
          <p className="eyebrow-forest">Materials</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {materials.map((m, i) => (
              <div key={i} className="rounded-md border border-hairline bg-raised p-4">
                <div className="flex items-center gap-3">
                  <span
                    className="inline-block h-8 w-8 rounded border border-hairline"
                    style={{ backgroundColor: m.swatch_hex ?? "#C9B79C" }}
                  />
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-label text-ink-muted">
                      {m.category}
                    </p>
                    <p
                      className="font-display text-[13.5px] leading-tight text-ink"
                      style={{ fontVariationSettings: '"opsz" 36, "wght" 540, "SOFT" 100' }}
                    >
                      {m.name}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-ink-soft">
                  {m.application}
                </p>
                {m.sustainability && (
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-label text-forest">
                    {m.sustainability}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {furniture.length > 0 && (
        <section>
          <p className="eyebrow-forest">Furniture</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {furniture.map((f, i) => (
              <div
                key={i}
                className="flex items-start gap-4 rounded-md border border-hairline bg-raised p-4"
              >
                <span className="mt-1 inline-block h-6 w-1 rounded-sm bg-sand-deep" />
                <div className="flex-1">
                  <p className="font-mono text-[9px] uppercase tracking-label text-ink-muted">
                    {f.category}
                  </p>
                  <p
                    className="mt-1 font-display text-[15px] leading-tight text-ink"
                    style={{ fontVariationSettings: '"opsz" 48, "wght" 540, "SOFT" 100' }}
                  >
                    {f.brand} — {f.model}
                  </p>
                  <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">
                    {f.application}
                  </p>
                  {f.dimensions_mm && (
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-label text-ink-muted">
                      {f.dimensions_mm.w ?? "—"} × {f.dimensions_mm.d ?? "—"} ×{" "}
                      {f.dimensions_mm.h ?? "—"} mm
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {(planting.strategy || (planting.species && planting.species.length > 0)) && (
        <section>
          <p className="eyebrow-forest">Planting</p>
          {planting.strategy && (
            <p className="mt-4 max-w-3xl text-[14px] italic leading-relaxed text-ink-soft">
              {planting.strategy}
            </p>
          )}
          <ul className="mt-4 space-y-2 text-[13px] text-ink">
            {(planting.species ?? []).map((sp, i) => (
              <li key={i} className="flex items-center gap-3">
                <DotStatus tone="ok" />
                <span className="font-display text-[14px]" style={{ fontVariationSettings: '"opsz" 36, "wght" 520, "SOFT" 100' }}>
                  {sp.name}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
                  {sp.light} · care {sp.care}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(light.strategy || (light.fixtures && light.fixtures.length > 0)) && (
        <section>
          <p className="eyebrow-forest">Light</p>
          {light.strategy && (
            <p className="mt-4 max-w-3xl text-[14px] italic leading-relaxed text-ink-soft">
              {light.strategy}
            </p>
          )}
          <ul className="mt-4 space-y-3">
            {(light.fixtures ?? []).map((fx, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-2 inline-block h-4 w-[3px] rounded-sm bg-sand-deep" />
                <div>
                  <p
                    className="font-display text-[14px] leading-tight text-ink"
                    style={{ fontVariationSettings: '"opsz" 36, "wght" 540, "SOFT" 100' }}
                  >
                    {fx.brand} — {fx.model}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
                    {fx.category} · {fx.application}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </motion.div>
  );
}
