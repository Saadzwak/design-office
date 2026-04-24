import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  AgentTrace,
  Card,
  Drawer,
  Eyebrow,
  FloorPlan2D,
  Icon,
  MetricBadge,
  Pill,
  PillToggle,
  Placeholder,
  ZONE_COLORS,
  type AgentRow,
  type IconName,
  type ZoneKind,
  type Zone,
} from "../components/ui";
import { useProjectState } from "../hooks/useProjectState";
import {
  fetchLumenFixture,
  fetchTestFitSample,
  generateTestFit,
  iterateVariant,
  runMicroZoningStructured,
  type FloorPlan,
  type ReviewerVerdict,
  type StructuredMicroZoningResponse,
  type StructuredZone,
  type TestFitResponse,
  type VariantOutput,
  type VariantStyle,
} from "../lib/api";
import {
  appendMicroZoningRun,
  selectLatestMicroZoningFor,
  setFloorPlan,
  setLiveScreenshot,
  setProgramme as persistProgramme,
  setTestFit,
  setTestFitRetained,
  upsertVariant,
} from "../lib/projectState";
import {
  variantToDesign,
  type DesignVariant,
} from "../lib/adapters/variantAdapter";
import { planSizeFromEnvelope } from "../lib/adapters/coordinates";

type Tab = "macro" | "micro";

const STYLES: VariantStyle[] = ["villageois", "atelier", "hybride_flex"];

const FALLBACK_PROGRAMME = `# Functional programme — Lumen

- 170 FTE at 24 months, 3/2 on-site policy, flex ratio 0.75 (130 desks).
- 6 focus rooms, 14 phone booths, 8 huddles, 6 mid-sized meeting rooms, 2 boardrooms.
- 1 town-hall space 120 m², central café 260 m².
- Sources: design://office-programming, design://flex-ratios, design://collaboration-spaces.`;

type State =
  | { kind: "idle" }
  | { kind: "plan_ready"; plan: FloorPlan }
  | { kind: "generating"; plan: FloorPlan }
  | { kind: "done"; plan: FloorPlan; result: TestFitResponse }
  | { kind: "error"; message: string };

export default function TestFit() {
  const project = useProjectState();
  const location = useLocation();
  const navigate = useNavigate();
  const isClient = project.view_mode === "client";

  const initialTab = useMemo<Tab>(() => {
    const params = new URLSearchParams(location.search);
    return params.get("tab") === "micro" ? "micro" : "macro";
  }, [location.search]);
  const [tab, setTab] = useState<Tab>(initialTab);

  const [state, setState] = useState<State>({ kind: "idle" });
  const [active, setActive] = useState<VariantStyle>(
    () => project.testfit?.retained_style ?? "atelier",
  );
  const [instruction, setInstruction] = useState("");
  const [iterating, setIterating] = useState(false);

  // Hydrate on mount. Iter-20 critical fix (Saad #6, #8, #12) :
  //
  //   The previous implementation fell back to the saved Lumen sample
  //   AND the Lumen plan fixture for ANY project that didn't have its
  //   own testfit run — leaking Villageois / Atelier / Hybride-flex
  //   variants into every new project. Now :
  //
  //     - Always prefer the project's own `testfit` run (v2 state).
  //     - Only fall back to the Lumen sample when the active project
  //       IS Lumen (or explicitly seeds the demo).
  //     - Only fall back to the Lumen plan fixture when the active
  //       project IS Lumen.
  //     - Otherwise : if the project has its own `floor_plan`
  //       uploaded (NewProjectModal parse), show it in `plan_ready`
  //       state ready for generation ; if it has nothing, render the
  //       empty-state CTA (see `MacroView` below).
  useEffect(() => {
    const ac = new AbortController();
    const isLumen =
      (project.project_id || "").toLowerCase().startsWith("lumen") ||
      (project.client.name || "").toLowerCase() === "lumen";
    const hydrate = async () => {
      if (project.testfit) {
        setState({
          kind: "done",
          plan: project.testfit.floor_plan,
          result: {
            floor_plan: project.testfit.floor_plan,
            variants: project.testfit.variants,
            verdicts: project.testfit.verdicts,
            tokens: { input: 0, output: 0 },
          },
        });
        return;
      }
      // Non-Lumen with an uploaded plan → plan_ready (user clicks
      // Generate to fan the 3 agents for THIS project).
      if (project.floor_plan && !isLumen) {
        setState({ kind: "plan_ready", plan: project.floor_plan });
        return;
      }
      // Non-Lumen without a plan → idle empty state (MacroView
      // surfaces a CTA to upload or go back to Brief).
      if (!isLumen) {
        setState({ kind: "idle" });
        return;
      }
      // Lumen only : cold-start demo fallback to the saved sample.
      try {
        const sample = await fetchTestFitSample(ac.signal);
        setState({
          kind: "done",
          plan: sample.floor_plan,
          result: sample,
        });
      } catch {
        try {
          const plan = await fetchLumenFixture(ac.signal);
          setState({ kind: "plan_ready", plan });
        } catch (err) {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    };
    hydrate();
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adapt our variants + floorplan into the bundle's shape for the cards.
  const designVariants: DesignVariant[] = useMemo(() => {
    if (state.kind !== "done") return [];
    const { result } = state;
    return result.variants.map((v) =>
      variantToDesign(
        v,
        state.plan,
        result.verdicts.find((r) => r.style === v.style) ?? null,
      ),
    );
  }, [state]);

  const onGenerate = async () => {
    if (state.kind !== "plan_ready" && state.kind !== "done") return;
    const plan = state.plan;
    setState({ kind: "generating", plan });
    try {
      // iter-21a (Saad #21-04-24) : pass the raw brief + industry so
      // the backend's new Parti Pris Proposer can tailor the 3
      // variants to THIS project. Falls back cleanly to the legacy
      // archetypes when brief is empty.
      const result = await generateTestFit({
        floor_plan: plan,
        programme_markdown: project.programme.markdown || FALLBACK_PROGRAMME,
        client_name: project.client.name || "Lumen",
        styles: STYLES,
        brief: project.brief ?? "",
        client_industry: project.client.industry ?? "",
      });
      persistProgramme({ markdown: project.programme.markdown || FALLBACK_PROGRAMME });
      setFloorPlan(result.floor_plan);
      setTestFit({
        floor_plan: result.floor_plan,
        variants: result.variants,
        verdicts: result.verdicts,
        live_screenshots: project.testfit?.live_screenshots ?? {},
        retained_style: null,
      });
      setState({ kind: "done", plan: result.floor_plan, result });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
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
        programme_markdown: project.programme.markdown || FALLBACK_PROGRAMME,
        client_name: project.client.name,
      });
      const updatedVariants = state.result.variants.map((v) =>
        v.style === active ? resp.variant : v,
      );
      setState({
        kind: "done",
        plan: state.plan,
        result: { ...state.result, variants: updatedVariants },
      });
      upsertVariant(resp.variant);
      if (resp.screenshot_url) {
        setLiveScreenshot(active, resp.screenshot_url);
      }
      setInstruction("");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("iterate failed", err);
    } finally {
      setIterating(false);
    }
  };

  const onPickTab = (next: Tab) => {
    setTab(next);
    const qs = next === "micro" ? "?tab=micro" : "";
    navigate({ pathname: "/testfit", search: qs }, { replace: true });
  };

  const onRetain = useCallback((style: VariantStyle) => {
    setActive(style);
    setTestFitRetained(style);
  }, []);

  return (
    <div className="space-y-10 pb-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <Eyebrow style={{ marginBottom: 10 }}>
            II · TEST FIT · {tab === "macro" ? "MACRO-ZONING" : "MICRO-ZONING"}
          </Eyebrow>
          <h1
            className="m-0 font-display italic"
            style={{
              fontSize: 64,
              lineHeight: 1.02,
              letterSpacing: "-0.02em",
              fontVariationSettings: '"opsz" 144, "wght" 600, "SOFT" 100',
            }}
          >
            {tab === "macro"
              ? isClient
                ? "Three concepts, one space."
                : "Three variants, one plan."
              : "Drill into the chosen concept."}
          </h1>
        </div>
        {!isClient && (
          <PillToggle<Tab>
            options={[
              { value: "macro", label: "Macro-zoning" },
              {
                value: "micro",
                label: "Micro-zoning",
                disabled: state.kind !== "done",
              },
            ]}
            value={tab}
            onChange={onPickTab}
          />
        )}
      </header>

      {tab === "macro" ? (
        <MacroView
          state={state}
          variants={designVariants}
          active={active}
          onPickVariant={onRetain}
          onGenerate={onGenerate}
          onDrill={() => onPickTab("micro")}
          instruction={instruction}
          setInstruction={setInstruction}
          iterating={iterating}
          onIterate={onIterate}
        />
      ) : (
        <MicroView
          state={state}
          active={active}
          onPickVariant={onRetain}
          designVariants={designVariants}
          project={project}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────── MacroView ──────

function MacroView({
  state,
  variants,
  active,
  onPickVariant,
  onGenerate,
  onDrill,
  instruction,
  setInstruction,
  iterating,
  onIterate,
}: {
  state: State;
  variants: DesignVariant[];
  active: VariantStyle;
  onPickVariant: (s: VariantStyle) => void;
  onGenerate: () => void;
  onDrill: () => void;
  instruction: string;
  setInstruction: (s: string) => void;
  iterating: boolean;
  onIterate: () => void;
}) {
  const agents: AgentRow[] =
    state.kind === "generating"
      ? [
          { roman: "I", name: "Programme Reader", status: "active", message: "Reading the 8 programme sections…" },
          { roman: "II", name: "Adjacency Solver", status: "active", message: "Composing three variants in parallel…" },
          { roman: "III", name: "Density Validator", status: "pending" },
          { roman: "IV", name: "Reviewer", status: "pending" },
        ]
      : state.kind === "done"
        ? [
            { roman: "I", name: "Programme Reader", status: "done", message: "8 sections parsed" },
            {
              roman: "II",
              name: "Adjacency Solver",
              status: "done",
              message: `${variants.length} variants · avg. ${Math.round(averageAdjacency(variants))}%`,
            },
            {
              roman: "III",
              name: "Density Validator",
              status: "done",
              message: "Within the 14–17 m²/FTE window",
            },
            {
              roman: "IV",
              name: "Reviewer",
              status: "done",
              message: `${state.result.verdicts.filter((v) => v.verdict !== "rejected").length}/${state.result.verdicts.length} approved`,
            },
          ]
        : [
            { roman: "I", name: "Programme Reader", status: "pending" },
            { roman: "II", name: "Adjacency Solver", status: "pending" },
            { roman: "III", name: "Density Validator", status: "pending" },
            { roman: "IV", name: "Reviewer", status: "pending" },
          ];

  return (
    <>
      {/* Variants grid */}
      {state.kind === "done" && variants.length === 3 ? (
        <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {variants.map((v) => (
            <VariantCard
              key={v.id}
              v={v}
              isActive={v.id === active}
              onPick={() => onPickVariant(v.id)}
              onDrill={onDrill}
            />
          ))}
        </div>
      ) : state.kind === "generating" ? (
        <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="card flex h-[360px] items-center justify-center text-mist-500"
              style={{ animation: `soft-breathe 3s var(--ease) ${i * 0.2}s infinite` }}
            >
              <span className="mono text-[11px] tracking-[0.14em]">
                Composing variant {i + 1}…
              </span>
            </div>
          ))}
        </div>
      ) : state.kind === "plan_ready" ? (
        <div
          className="card p-12 text-center"
          style={{ background: "var(--canvas-alt)" }}
        >
          <Eyebrow style={{ marginBottom: 10 }}>PLAN READY</Eyebrow>
          <p className="mx-auto max-w-xl text-[14px] leading-relaxed text-mist-600">
            Hit <em>Generate macro-zoning</em> to fan three parallel design
            agents across your plate. Each produces a distinct parti ; the
            Reviewer and the Adjacency Validator grade them in parallel.
          </p>
          <button onClick={onGenerate} className="btn-primary mt-6">
            Generate macro-zoning <Icon name="sparkles" size={14} />
          </button>
        </div>
      ) : (
        <div
          className="card p-12 text-center"
          style={{ background: "var(--canvas-alt)" }}
        >
          <Eyebrow style={{ marginBottom: 10 }}>NO PLAN YET</Eyebrow>
          <p className="mx-auto max-w-xl text-[14px] leading-relaxed text-mist-600">
            Upload a floor plan from the Brief surface (or the New Project
            modal) before running the macro-zoning agents. The three parallel
            variants need a plate to zone.
          </p>
        </div>
      )}

      {/* Legend */}
      {state.kind === "done" && (
        <div
          className="flex flex-wrap gap-5 rounded-lg border border-mist-200 px-5 py-3.5"
          style={{ background: "var(--canvas-alt)" }}
        >
          <Eyebrow>ZONE LEGEND</Eyebrow>
          {(
            [
              ["work", "Focus"],
              ["collab", "Collab"],
              ["hospitality", "Hospitality"],
              ["support", "Support"],
              ["biophilic", "Biophilic"],
            ] as Array<[ZoneKind, string]>
          ).map(([k, label]) => (
            <span key={k} className="flex items-center gap-2 text-[12px]">
              <span
                className="inline-block h-2.5 w-2.5 rounded-[2px]"
                style={{
                  background: ZONE_COLORS[k].fill,
                  border: `1px solid ${ZONE_COLORS[k].stroke}`,
                }}
              />
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Agents at work */}
      {state.kind !== "plan_ready" && (
        <section className="pt-6">
          <Eyebrow style={{ marginBottom: 18 }}>
            AGENTS AT WORK · MACRO RUN #{state.kind === "done" ? 1 : 1}
          </Eyebrow>
          <AgentTrace agents={agents} />
        </section>
      )}

      {/* Iterate bar */}
      {state.kind === "done" && (
        <div
          className="rounded-xl border border-mist-200 bg-raised p-5"
          style={{ background: "#FFFDF9" }}
        >
          <Eyebrow style={{ marginBottom: 10 }}>ITERATE · NATURAL LANGUAGE</Eyebrow>
          <div className="flex items-center gap-2.5">
            <Icon
              name="corner-down-right"
              size={14}
              style={{ color: "var(--mist-400)" }}
            />
            <input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onIterate();
                }
              }}
              placeholder="e.g. enlarge the boardroom, push the desks to the south façade…"
              className="flex-1 border-0 border-b border-mist-300 bg-transparent py-2 text-[14px] text-ink placeholder:text-mist-400 focus:border-forest focus:outline-none"
              disabled={iterating}
            />
            <button
              onClick={onIterate}
              className="btn-primary btn-sm"
              disabled={iterating || instruction.trim().length < 3}
            >
              <Icon name="sparkles" size={12} />
              {iterating ? "Generating…" : "Generate"}
            </button>
          </div>
        </div>
      )}

      {/* Next-step CTA chain — iter-20a (#14). Once a variant is
          retained, guide the user to Mood Board → Justify → Export. */}
      {state.kind === "done" && variants.length === 3 && (
        <ContinueChain onDrill={onDrill} />
      )}

      {/* Error */}
      {state.kind === "error" && (
        <div
          className="rounded-md px-4 py-3 font-mono text-[12px] text-clay"
          style={{ background: "rgba(160, 82, 45, 0.08)" }}
        >
          {state.message}
        </div>
      )}
    </>
  );
}

function ContinueChain({ onDrill }: { onDrill: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-mist-200 bg-canvas-alt p-5">
      <div>
        <Eyebrow style={{ marginBottom: 4 }}>NEXT STEPS</Eyebrow>
        <p className="m-0 text-[13px] text-mist-600">
          Drill into the retained variant then continue toward the mood
          board, the argumentaire, and the engineering export.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={onDrill} className="btn-ghost btn-sm">
          <Icon name="layers" size={12} /> Drill into micro-zoning
        </button>
        <button
          onClick={() => navigate("/moodboard")}
          className="btn-ghost btn-sm"
        >
          <Icon name="feather" size={12} /> Continue to Mood Board
        </button>
        <button
          onClick={() => navigate("/justify")}
          className="btn-ghost btn-sm"
        >
          <Icon name="messages-square" size={12} /> Continue to Justify
        </button>
      </div>
    </div>
  );
}

function VariantCard({
  v,
  isActive,
  onPick,
  onDrill,
}: {
  v: DesignVariant;
  isActive: boolean;
  onPick: () => void;
  onDrill: () => void;
}) {
  const pigmentBackground =
    v.pigment === "forest"
      ? "var(--forest)"
      : v.pigment === "sand"
        ? "var(--sand)"
        : v.pigment === "mint"
          ? "var(--mint)"
          : v.pigment === "sun"
            ? "var(--sun)"
            : "var(--clay)";

  // iter-22b (Saad, 2026-04-24) : 2D React SVG dropped from variant
  // cards — the normalized-zone preview was noisy on real plans.
  // Locked to 3D SketchUp iso renders only ; 2D will come back via
  // AutoCAD XREF rendering once the full AutoCAD is wired.
  const sketchupUrl = `/sketchup/sketchup_variant_${v.id}.png`;

  return (
    <div
      onClick={onPick}
      className="card"
      style={{
        cursor: "pointer",
        padding: 20,
        border: isActive ? "2px solid var(--forest)" : "1px solid var(--mist-200)",
        transform: isActive ? "scale(1.015)" : "scale(1)",
        boxShadow: isActive
          ? "0 20px 40px rgba(47, 74, 63, 0.12)"
          : "none",
        background: "#FFFDF9",
        transition: "all 250ms var(--ease)",
      }}
    >
      {/* Header row — iter-22b (Saad, 2026-04-24) : the 2D React SVG
          was "nul" on the real Lovable plan, so we drop the 2D/3D
          toggle here and lock to 3D SketchUp iso renders. Re-enable
          the 2D once AutoCAD XREF delivers a proper DWG-quality
          rendering. */}
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className="inline-block h-3 w-3"
          style={{
            background: pigmentBackground,
            borderRadius: 2,
            transform: "rotate(45deg)",
          }}
        />
        <span
          className="font-display italic"
          style={{
            fontSize: 28,
            fontWeight: 400,
            fontVariationSettings: '"opsz" 96, "wght" 440, "SOFT" 100',
          }}
        >
          {v.name}
        </span>
      </div>

      {/* Pitch */}
      <p
        className="m-0 mb-4 text-[14px] leading-snug text-mist-600"
        style={{ minHeight: 44 }}
      >
        {v.pitch}
      </p>

      {/* Preview — 3D SketchUp iso only. */}
      <div
        className="overflow-hidden rounded-lg border border-mist-100"
        style={{ background: "var(--canvas-alt)", padding: 0 }}
      >
        <div
          className="relative flex aspect-[400/260] w-full items-center justify-center"
          style={{ background: "var(--canvas-alt)" }}
        >
          <img
            src={sketchupUrl}
            alt={`${v.name} SketchUp iso render`}
            className="h-full w-full object-contain"
            onError={(e) => {
              // If the fixture PNG is missing, fall back to a
              // placeholder so the card doesn't break.
              (e.currentTarget as HTMLImageElement).style.display = "none";
              (e.currentTarget.nextElementSibling as HTMLElement | null)?.removeAttribute(
                "hidden",
              );
            }}
          />
          <div
            hidden
            className="placeholder-img absolute inset-0 flex items-center justify-center"
          >
            <span>SKETCHUP ISO · {v.name.toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="mt-4 flex gap-5 border-t border-mist-100 pt-3.5">
        <MetricBadge label="Desks" value={v.metrics.desks} />
        <MetricBadge label="m²/FTE" value={v.metrics.density} />
        <MetricBadge label="Flex" value={v.metrics.flex} />
        <MetricBadge label="Adj." value={v.metrics.adjacency} />
      </div>

      {/* Warnings */}
      {v.warnings.length > 0 && (
        <div
          className="mt-3.5 flex items-start gap-2.5 rounded p-3"
          style={{
            background: "rgba(160, 82, 45, 0.08)",
            borderLeft: "3px dashed var(--clay)",
            borderRadius: 4,
          }}
        >
          <Icon
            name="alert-triangle"
            size={14}
            style={{ color: "var(--clay)", marginTop: 2 }}
          />
          <span className="text-[12px] text-clay">{v.warnings[0].text}</span>
        </div>
      )}

      {isActive && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDrill();
          }}
          className="btn-ghost mt-3.5 w-full justify-center"
        >
          Drill into micro-zoning <Icon name="arrow-right" size={12} />
        </button>
      )}
    </div>
  );
}

function averageAdjacency(variants: DesignVariant[]): number {
  const scores = variants
    .map((v) => parseInt(v.metrics.adjacency, 10))
    .filter((n) => !Number.isNaN(n));
  if (scores.length === 0) return 0;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

// ─────────────────────────────────────── MicroView ──────

type MicroState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; payload: StructuredMicroZoningResponse }
  | { kind: "error"; message: string };

function MicroView({
  state,
  active,
  onPickVariant,
  designVariants,
  project,
}: {
  state: State;
  active: VariantStyle;
  onPickVariant: (s: VariantStyle) => void;
  designVariants: DesignVariant[];
  project: ReturnType<typeof useProjectState>;
}) {
  const activeVariant = designVariants.find((v) => v.id === active);
  const [micro, setMicro] = useState<MicroState>({ kind: "idle" });
  const [openZone, setOpenZone] = useState<StructuredZone | null>(null);

  // Preload the live fixture when the variant matches Lumen atelier so
  // the page has content for the demo without spending tokens.
  useEffect(() => {
    if (
      state.kind === "done" &&
      active === "atelier" &&
      project.client.name.toLowerCase().includes("lumen") &&
      micro.kind === "idle"
    ) {
      fetch("/microzoning-fixtures/atelier.json")
        .then((r) => (r.ok ? r.json() : null))
        .then((data: StructuredMicroZoningResponse | null) => {
          if (data && data.zones?.length) {
            setMicro({ kind: "done", payload: data });
          }
        })
        .catch(() => null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, state.kind]);

  if (state.kind !== "done" || !activeVariant) {
    return (
      <div className="card p-10 text-center text-mist-500">
        <Eyebrow style={{ marginBottom: 6 }}>WAITING</Eyebrow>
        Generate the three macro variants first, then drill into one.
      </div>
    );
  }

  const run = async () => {
    setMicro({ kind: "running" });
    try {
      const rawVariant = state.result.variants.find((v) => v.style === active);
      if (!rawVariant) throw new Error("Active variant not found");
      const resp = await runMicroZoningStructured({
        client_name: project.client.name || "Client",
        client_industry: project.client.industry,
        floor_plan: state.plan,
        variant: rawVariant,
        programme_markdown: project.programme.markdown || "",
      });
      setMicro({ kind: "done", payload: resp });
    } catch (err) {
      setMicro({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const zones = micro.kind === "done" ? micro.payload.zones : [];

  return (
    <div className="space-y-8">
      {/* Drilling-into pill */}
      <div
        className="inline-flex items-center gap-2.5 rounded-full px-4 py-2"
        style={{ background: "var(--forest-ghost)" }}
      >
        <span className="mono text-forest">DRILLING INTO</span>
        <span
          className="font-display italic text-forest"
          style={{
            fontSize: 16,
            fontVariationSettings: '"opsz" 72, "wght" 440, "SOFT" 100',
          }}
        >
          · {activeVariant.name}
        </span>
        <span
          className="inline-block h-[3px] w-[3px] rounded-[2px]"
          style={{ background: "var(--forest)" }}
        />
        <span className="mono text-forest">
          {activeVariant.metrics.desks} desks
        </span>
      </div>

      {/* Variant picker */}
      <div className="flex gap-2">
        {designVariants.map((v) => (
          <Pill
            key={v.id}
            variant={v.id === active ? "active" : "ghost"}
            onClick={() => onPickVariant(v.id)}
          >
            {v.name}
          </Pill>
        ))}
      </div>

      {micro.kind === "idle" && (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <Eyebrow style={{ marginBottom: 6 }}>DRILL DOWN</Eyebrow>
              <p className="max-w-xl text-[13px] leading-relaxed text-mist-600">
                Run the structured micro-zoning on the retained variant —
                10-14 zones, each with real furniture SKUs, material
                picks from <code className="mono text-[11px]">design://material-finishes</code>,
                acoustic targets and per-zone adjacency verdicts.
              </p>
            </div>
            <button onClick={run} className="btn-primary">
              <Icon name="sparkles" size={14} /> Run micro-zoning
            </button>
          </div>
        </Card>
      )}

      {micro.kind === "running" && (
        <Card>
          <div className="flex items-center gap-4">
            <span
              className="inline-block h-3 w-3 animate-[dot-pulse_1.1s_var(--ease)_infinite] rounded-full"
              style={{ background: "var(--forest)" }}
            />
            <div>
              <Eyebrow style={{ marginBottom: 4 }}>OPUS · MICRO-ZONING</Eyebrow>
              <p className="text-[13px] text-mist-600">
                Detailing the {activeVariant.name} variant, zone by zone…
                usually 2-3 minutes.
              </p>
            </div>
          </div>
        </Card>
      )}

      {micro.kind === "error" && (
        <Card>
          <Eyebrow style={{ marginBottom: 4 }}>ERROR</Eyebrow>
          <p className="mt-2 text-[13px] text-clay">{micro.message}</p>
          <button onClick={run} className="btn-ghost btn-sm mt-4">
            Retry
          </button>
        </Card>
      )}

      {micro.kind === "done" && (
        <div
          className="grid gap-8"
          style={{ gridTemplateColumns: "1.6fr 1fr" }}
        >
          {/* Numbered floor plan */}
          <div
            className="rounded-xl border border-mist-200 p-4"
            style={{ background: "#FFFDF9" }}
          >
            <FloorPlan2D
              zones={activeVariant.zones as Zone[]}
              rooms={activeVariant.rooms}
              walls={activeVariant.walls}
              numbered
              size={{ w: 720, h: 460 }}
              ariaLabel={`${activeVariant.name} micro-zoning`}
              onZoneClick={(_, i) => {
                const z = zones[i] ?? null;
                if (z) setOpenZone(z);
              }}
            />
          </div>

          {/* Zone list */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <Eyebrow>ZONES · {zones.length}</Eyebrow>
              <button onClick={run} className="btn-minimal">
                <Icon name="sparkles" size={12} /> Re-run
              </button>
            </div>
            <div className="flex max-h-[520px] flex-col gap-1.5 overflow-auto pr-1.5">
              {zones.map((z) => (
                <Card
                  key={z.n}
                  as="button"
                  onClick={() => setOpenZone(z)}
                  className="!p-3.5 !flex items-center gap-3.5"
                >
                  <span className="mono w-6 text-[11px] text-mist-400">
                    {String(z.n).padStart(2, "0")}
                  </span>
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded text-forest"
                    style={{ background: "var(--canvas-alt)" }}
                  >
                    <Icon name={z.icon as IconName} size={14} />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-[14px] font-medium">{z.name}</div>
                    <div className="mono text-[10px] text-mist-500">
                      {z.surface_m2} m²
                    </div>
                  </div>
                  <span
                    title={z.status === "ok" ? "OK" : z.status}
                    className="inline-block h-2 w-2 rounded-full"
                    style={{
                      background:
                        z.status === "ok"
                          ? "var(--mint)"
                          : z.status === "warn"
                            ? "var(--sun)"
                            : "var(--clay)",
                    }}
                  />
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}

      <Drawer
        open={!!openZone}
        onClose={() => setOpenZone(null)}
        width={560}
        ariaLabel="Zone detail"
      >
        {openZone && (
          <ZoneDrawerContent
            zone={openZone}
            onClose={() => setOpenZone(null)}
            variantName={activeVariant.name}
          />
        )}
      </Drawer>
    </div>
  );
}

function ZoneDrawerContent({
  zone,
  onClose,
  variantName,
}: {
  zone: StructuredZone;
  onClose: () => void;
  variantName: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-9">
      <div className="mb-6 flex items-center justify-between">
        <Eyebrow>ZONE · {String(zone.n).padStart(2, "0")}</Eyebrow>
        <button onClick={onClose} className="text-mist-500 hover:text-ink">
          <Icon name="x" size={18} />
        </button>
      </div>

      <div className="mb-3.5 flex items-center gap-3.5">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-lg"
          style={{
            background: "var(--forest-ghost)",
            color: "var(--forest)",
          }}
        >
          <Icon name={zone.icon as IconName} size={20} />
        </div>
        <div>
          <h2
            className="m-0 font-display italic"
            style={{
              fontSize: 30,
              fontVariationSettings: '"opsz" 144, "wght" 500, "SOFT" 100',
            }}
          >
            {zone.name}
          </h2>
          <span className="mono text-mist-500">
            {zone.surface_m2} m² · {variantName.toUpperCase()}
          </span>
        </div>
      </div>

      {zone.narrative && (
        <p
          className="m-0 mb-5 font-display"
          style={{
            fontSize: 17,
            color: "var(--mist-700)",
            lineHeight: 1.5,
            fontVariationSettings: '"opsz" 72, "wght" 380, "SOFT" 100',
          }}
        >
          {zone.narrative}
        </p>
      )}

      <Placeholder
        tag={`ZOOMED PLAN · ZONE ${zone.n}`}
        ratio="16/9"
        tint="#3C5D50"
        style={{ margin: "20px 0", border: "1px solid var(--mist-200)" }}
      />

      {zone.furniture.length > 0 && (
        <>
          <Eyebrow style={{ marginTop: 20, marginBottom: 10 }}>
            FURNITURE
          </Eyebrow>
          <div className="flex flex-col gap-1.5">
            {zone.furniture.map((f, i) => (
              <div
                key={i}
                className="flex justify-between border-b border-mist-100 py-1.5 text-[14px]"
              >
                <span>
                  {f.brand && (
                    <span className="mono mr-2 text-mist-500">
                      {f.brand.toUpperCase()}
                    </span>
                  )}
                  {f.name}
                </span>
                <span className="mono text-mist-500">
                  {f.quantity > 1 ? `× ${f.quantity}` : "× 1"}
                  {f.dimensions_mm && ` · ${f.dimensions_mm}`}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {zone.acoustic && (
        <>
          <Eyebrow style={{ marginTop: 28, marginBottom: 10 }}>ACOUSTIC</Eyebrow>
          <div
            className="rounded-lg p-3.5 text-[13px]"
            style={{ background: "var(--canvas-alt)" }}
          >
            {zone.acoustic.rw_target_db != null && (
              <div className="mb-1.5 flex justify-between">
                <span>Rw target</span>
                <span className="mono">≥ {zone.acoustic.rw_target_db} dB</span>
              </div>
            )}
            {zone.acoustic.dnt_a_target_db != null && (
              <div className="mb-1.5 flex justify-between">
                <span>DnT,A target</span>
                <span className="mono">≥ {zone.acoustic.dnt_a_target_db} dB</span>
              </div>
            )}
            {zone.acoustic.tr60_target_s != null && (
              <div className="mb-1.5 flex justify-between">
                <span>TR60 target</span>
                <span className="mono">≤ {zone.acoustic.tr60_target_s} s</span>
              </div>
            )}
            {zone.acoustic.source && (
              <div className="mono mt-2.5 text-[10px] text-mist-500">
                → {zone.acoustic.source}
              </div>
            )}
          </div>
        </>
      )}

      {zone.materials.length > 0 && (
        <>
          <Eyebrow style={{ marginTop: 28, marginBottom: 10 }}>MATERIALS</Eyebrow>
          <div className="text-[13px] leading-loose text-mist-700">
            {zone.materials.map((m, i) => (
              <div key={i}>
                <span className="mono mr-2.5 text-mist-500">
                  {m.surface.toUpperCase()}
                </span>
                {m.brand && (
                  <span className="mono mr-1.5 text-mist-500">{m.brand}</span>
                )}
                {m.name}
                {m.note && (
                  <span className="ml-2 text-mist-500"> · {m.note}</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div
        className="mt-7 rounded-lg p-3.5"
        style={{
          background:
            zone.adjacency.ok
              ? "rgba(107, 143, 127, 0.12)"
              : "rgba(232, 197, 71, 0.18)",
          borderLeft: `3px solid ${
            zone.adjacency.ok ? "var(--mint)" : "var(--sun)"
          }`,
        }}
      >
        <Eyebrow style={{ marginBottom: 4 }}>ADJACENCY CHECK</Eyebrow>
        <div className="text-[13px]">
          {zone.adjacency.ok ? "✓ " : "⚠ "}
          {zone.adjacency.note ||
            (zone.adjacency.ok
              ? "Adjacencies respected."
              : "Adjacent to a tension — review or buffer.")}
        </div>
        {zone.adjacency.rule_ids.length > 0 && (
          <div className="mono mt-2 text-[10px] text-mist-500">
            → {zone.adjacency.rule_ids.join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}

// Kept for reference — helpers the iter-18i port will reuse.
export function persistMicroMarkdown(
  variantStyle: VariantStyle,
  markdown: string,
): void {
  try {
    appendMicroZoningRun({
      parent_variant_style: variantStyle,
      markdown,
    });
  } catch {
    /* non-fatal */
  }
}

export function latestMicroFor(
  state: ReturnType<typeof useProjectState>,
  variantStyle: VariantStyle,
) {
  return selectLatestMicroZoningFor(state, variantStyle);
}

// Sanity aggregator — verify plan size resolves before rendering (debug).
export function _planSize(plan: FloorPlan | null) {
  if (!plan) return null;
  return planSizeFromEnvelope(plan.envelope.points);
}

// ─────────────────────────── Variant-verdict fallback (unused here,
// kept exported so other consumers can reuse). Stops tree-shaker from
// pruning the helpers when the full micro view lands in iter-18i.
export function reviewerVerdictFor(
  verdicts: ReviewerVerdict[],
  style: VariantStyle,
): ReviewerVerdict | null {
  return verdicts.find((v) => v.style === style) ?? null;
}

// Variant iteration echo — wrapping `VariantOutput` untouched, keeps
// the symbol referenced even when no MicroView is rendering.
export type _VariantEcho = VariantOutput;
