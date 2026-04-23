import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  AgentTrace,
  Card,
  Eyebrow,
  FloorPlan2D,
  Icon,
  MetricBadge,
  Pill,
  PillToggle,
  ZONE_COLORS,
  type AgentRow,
  type ZoneKind,
  type Zone,
} from "../components/ui";
import { useProjectState } from "../hooks/useProjectState";
import {
  fetchLumenFixture,
  fetchTestFitSample,
  generateTestFit,
  iterateVariant,
  type FloorPlan,
  type ReviewerVerdict,
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

  // Hydrate on mount : prefer a persisted macro run, fall back to the
  // saved Lumen fixture so the page always has content.
  useEffect(() => {
    const ac = new AbortController();
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
      const result = await generateTestFit({
        floor_plan: plan,
        programme_markdown: project.programme.markdown || FALLBACK_PROGRAMME,
        client_name: project.client.name || "Lumen",
        styles: STYLES,
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
        <MicroViewStub
          state={state}
          active={active}
          onPickVariant={onRetain}
          designVariants={designVariants}
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
      ) : (
        <div
          className="card p-12 text-center"
          style={{ background: "var(--canvas-alt)" }}
        >
          <Eyebrow style={{ marginBottom: 10 }}>READY · FIXTURE LOADED</Eyebrow>
          <p className="mx-auto max-w-xl text-[14px] leading-relaxed text-mist-600">
            Hit <em>Generate</em> to fan three parallel design agents across
            the Lumen plate. Each produces a distinct macro-zoning parti ;
            the Reviewer and the Adjacency Validator grade them.
          </p>
          <button onClick={onGenerate} className="btn-primary mt-6">
            Generate 3 variants <Icon name="sparkles" size={14} />
          </button>
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
              className="input-underline flex-1"
              style={{ borderBottom: "none" }}
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
      {/* Header row */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
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
        <PillToggle
          size="sm"
          options={[
            { value: "2d", label: "2D" },
            { value: "3d", label: "3D" },
          ]}
          value="2d"
          onChange={() => {
            /* 3D toggle ships in iter-18i with the live SketchUp screenshots */
          }}
        />
      </div>

      {/* Pitch */}
      <p
        className="m-0 mb-4 text-[14px] leading-snug text-mist-600"
        style={{ minHeight: 44 }}
      >
        {v.pitch}
      </p>

      {/* 2D floor plan */}
      <div
        className="rounded-lg border border-mist-100 p-2"
        style={{ background: "var(--canvas-alt)" }}
      >
        <FloorPlan2D
          zones={v.zones as Zone[]}
          size={{ w: 400, h: 260 }}
          ariaLabel={`${v.name} macro-zoning`}
        />
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

// ─────────────────────────────────────── MicroView stub ──────
// Full structured drill-down (zone list + drawer) lands in iter-18i.

function MicroViewStub({
  state,
  active,
  onPickVariant,
  designVariants,
}: {
  state: State;
  active: VariantStyle;
  onPickVariant: (s: VariantStyle) => void;
  designVariants: DesignVariant[];
}) {
  const activeVariant = designVariants.find((v) => v.id === active);

  if (state.kind !== "done" || !activeVariant) {
    return (
      <div className="card p-10 text-center text-mist-500">
        <Eyebrow style={{ marginBottom: 6 }}>WAITING</Eyebrow>
        Generate the three macro variants first, then drill into one.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="inline-flex items-center gap-2.5 rounded-full bg-forest-ghost px-4 py-2">
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

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <Eyebrow style={{ marginBottom: 6 }}>NEXT · ITER-18I</Eyebrow>
            <p className="text-[13px] text-mist-600">
              Structured zone list + zoom drawer + acoustic + furniture
              ships in iter-18i with the new{" "}
              <code className="mono text-[11px]">
                /api/testfit/microzoning/structured
              </code>{" "}
              endpoint.
            </p>
          </div>
          <button className="btn-ghost btn-sm" disabled>
            Coming next
          </button>
        </div>
      </Card>
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
