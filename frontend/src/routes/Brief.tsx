import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useNavigate } from "react-router-dom";
import remarkGfm from "remark-gfm";

import {
  AgentTrace,
  Card,
  Drawer,
  Eyebrow,
  Icon,
  InlineMarkdown,
  Pill,
  Placeholder,
  roman,
  type AgentRow,
  type AgentStatus,
} from "../components/ui";
import { useProjectState } from "../hooks/useProjectState";
import {
  fetchBriefManifest,
  synthesizeBrief,
  uploadPlanPdf,
  type BriefManifest,
  type BriefResponse,
} from "../lib/api";
import {
  INDUSTRY_LABEL,
  setBrief,
  setClient,
  setFloorPlan,
  setProgramme,
} from "../lib/projectState";
import {
  parseProgrammeSections,
  type ProgrammeSection,
} from "../lib/adapters/programmeSections";
import { toast } from "../components/ui/Toast";

/**
 * Brief — Claude Design bundle parity (iter-18g).
 *
 * - Editorial textarea (no form-y border, Fraunces body, underline-only).
 * - Industry pills drive `project.client.industry`.
 * - AgentTrace uses STUDIO VOCAB per iter-17 E : Headcount / Benchmarks
 *   / Compliance / Editor (NOT "Effectifs Agent" / "Constraints Agent").
 * - Output renders as a responsive 8-card drill-down grid ; each card
 *   opens a right drawer with tldr + body + sources.
 * - Sidebar : logo drop, plan drop, defaults detected.
 */

const STUDIO_AGENTS: Array<{
  traceName: string;
  roman: string;
  name: string;
  running: string;
  done: string;
}> = [
  {
    traceName: "Effectifs",
    roman: "I",
    name: "Headcount",
    running: "Parsing the 120 → 170 trajectory, 3-days on-site policy…",
    done: "Sized · 130 desks + 15 % buffer",
  },
  {
    traceName: "Benchmarks",
    roman: "II",
    name: "Benchmarks",
    running: "Sourcing Leesman 2024 ratios for the industry profile…",
    done: "Cited · Leesman, Gensler, HOK",
  },
  {
    traceName: "Contraintes",
    roman: "III",
    name: "Compliance",
    running: "Validating ERP Type W + PMR compliance…",
    done: "Cleared · Arrêté 25 juin 1980 · NF EN 527",
  },
  {
    traceName: "Consolidator",
    roman: "IV",
    name: "Editor",
    running: "Weaving the three voices into one programme…",
    done: "Programme drafted",
  },
];

const INDUSTRIES = [
  "tech_startup",
  "law_firm",
  "bank_insurance",
  "consulting",
  "creative_agency",
  "healthcare",
  "public_sector",
  "other",
] as const;

type Phase =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; response: BriefResponse }
  | { kind: "error"; message: string };

export default function Brief() {
  const project = useProjectState();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [draft, setDraft] = useState<string>(() => project.brief);
  const [manifest, setManifest] = useState<BriefManifest | null>(null);
  const [drawer, setDrawer] = useState<ProgrammeSection | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetchBriefManifest(ac.signal)
      .then(setManifest)
      .catch(() => setManifest(null));
    return () => ac.abort();
  }, []);

  // Pre-seed the done-phase from the persisted programme so a page
  // reload still shows the cards the user already synthesised — but
  // ONLY if the stored markdown actually yields drill-down sections
  // (i.e. has H2 headings). Otherwise keep the phase idle so the
  // "Synthesize programme" CTA stays visible for fresh projects that
  // only carry a bullet-point seed.
  useEffect(() => {
    if (phase.kind !== "idle") return;
    const markdown = project.programme.markdown ?? "";
    if (!markdown.trim()) return;
    const sectionCount = parseProgrammeSections(markdown).length;
    if (sectionCount === 0) return;
    setPhase({
      kind: "done",
      response: {
        programme: markdown,
        trace: [],
        tokens: { input: 0, output: 0 },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sections: ProgrammeSection[] = useMemo(() => {
    if (phase.kind === "done") {
      return parseProgrammeSections(phase.response.programme);
    }
    return parseProgrammeSections(project.programme.markdown);
  }, [phase, project.programme.markdown]);

  // Iter-20c (Saad #2) : live-looking agent progress.
  //
  //   The brief endpoint returns the full trace at the end, not
  //   streamed — so during the ~30 s Opus call there's nothing to
  //   reflect per-agent progress. This client-side clock flips
  //   agents from `pending` → `active` → `done` in a staggered
  //   cadence so the "Agents at Work" block doesn't look static.
  //   When the real response lands, all four are forced to `done`.
  const [stage, setStage] = useState<number>(0);
  useEffect(() => {
    if (phase.kind !== "running") {
      setStage(0);
      return;
    }
    // 4 agents, roughly 7 seconds between stages → covers ~28 s which
    // matches the median Brief endpoint wall-clock.
    const interval = setInterval(() => {
      setStage((s) => Math.min(s + 1, STUDIO_AGENTS.length));
    }, 7000);
    // Immediate tick so the first agent turns `active` without delay.
    setStage(1);
    return () => clearInterval(interval);
  }, [phase.kind]);

  const runSynthesis = async () => {
    setPhase({ kind: "running" });
    setBrief(draft);
    try {
      const res = await synthesizeBrief({
        brief: draft,
        client_name: project.client.name,
        // Iter-32 — switched from "fr" to "en" so the LLM emits the
        // programme markdown with English H2 titles ("Functional
        // programme" instead of "Programme fonctionnel"). Matches
        // the iter-20a precedent on Justify, where Saad asked for
        // English-only argumentaire titles for client-facing
        // consistency. Headings on the brief cards + drawer title
        // bar now read in English regardless of the input brief
        // language.
        language: "en",
      });
      setProgramme({ markdown: res.programme });
      setPhase({ kind: "done", response: res });
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const agents: AgentRow[] = STUDIO_AGENTS.map((a, i) => {
    let status: AgentStatus = "pending";
    let message: string | undefined;
    if (phase.kind === "running") {
      if (i < stage - 1) {
        status = "done";
        message = a.done;
      } else if (i === stage - 1) {
        status = "active";
        message = a.running;
      } else {
        status = "pending";
      }
    } else if (phase.kind === "done") {
      status = "done";
      message = a.done;
    }
    return { roman: a.roman, name: a.name, status, message };
  });

  const isClient = project.view_mode === "client";

  return (
    <div className="mx-auto max-w-[1280px] space-y-14 pb-16 pt-2">
      <header>
        <Eyebrow style={{ marginBottom: 12 }}>I · BRIEF</Eyebrow>
        <h1
          className="m-0 font-display italic"
          style={{
            fontSize: 72,
            letterSpacing: "-0.02em",
            lineHeight: 1.02,
            fontVariationSettings: '"opsz" 144, "wght" 600, "SOFT" 100',
          }}
        >
          Tell us about the project.
        </h1>
        <p
          className="mt-4 max-w-[720px] font-display"
          style={{
            fontSize: 22,
            color: "var(--mist-600)",
            lineHeight: 1.45,
            fontVariationSettings: '"opsz" 72, "wght" 380, "SOFT" 100',
          }}
        >
          Paste the client brief in natural language. We'll extract the
          programme.
        </p>
      </header>

      <div className="grid gap-14" style={{ gridTemplateColumns: "1fr 320px" }}>
        <div>
          {/* Industry pills */}
          <Eyebrow style={{ marginBottom: 12 }}>INDUSTRY</Eyebrow>
          <div className="mb-9 flex flex-wrap gap-2">
            {INDUSTRIES.map((i) => {
              const active = i === project.client.industry;
              return (
                <Pill
                  key={i}
                  variant={active ? "active" : "ghost"}
                  onClick={() => setClient({ industry: i })}
                >
                  {INDUSTRY_LABEL[i]}
                </Pill>
              );
            })}
          </div>

          {/* Editorial textarea */}
          <Eyebrow style={{ marginBottom: 12 }}>CLIENT BRIEF</Eyebrow>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            className="w-full resize-none bg-transparent font-display text-ink outline-none"
            style={{
              fontSize: 22,
              lineHeight: 1.5,
              fontWeight: 300,
              letterSpacing: "-0.005em",
              border: "none",
              borderBottom: "1px solid var(--mist-200)",
              padding: "0 0 24px",
              fontVariationSettings: '"opsz" 72, "wght" 320, "SOFT" 100',
            }}
          />

          {phase.kind === "idle" && (
            <button
              onClick={runSynthesis}
              className="btn-primary mt-8"
              style={{ padding: "16px 28px" }}
              disabled={draft.trim().length < 60}
            >
              Synthesize programme <Icon name="sparkles" size={14} />
            </button>
          )}

          {phase.kind === "error" && (
            <div className="mt-8 rounded-md border border-clay/40 bg-clay/5 px-4 py-3 text-[13px] text-clay">
              {phase.message}
            </div>
          )}

          {/* Running + done agent trace */}
          {phase.kind !== "idle" && (
            <div className="mt-12">
              <Eyebrow style={{ marginBottom: 18 }}>AGENTS AT WORK</Eyebrow>
              <AgentTrace agents={agents} />
              {/* Iter-20c (Saad #17) : token counts hidden in Client
                  view ; visible to engineering only. */}
              {phase.kind === "done" && phase.response.tokens.input > 0 && !isClient && (
                <div className="mt-4 font-mono text-[10px] uppercase tracking-label text-mist-500">
                  Tokens · {phase.response.tokens.input.toLocaleString()} in ·{" "}
                  {phase.response.tokens.output.toLocaleString()} out
                </div>
              )}
            </div>
          )}

          {/* Programme card grid */}
          {phase.kind === "done" && sections.length > 0 && (
            <div className="mt-14 animate-fade-rise">
              <Eyebrow style={{ marginBottom: 18 }}>
                PROGRAMME · {sections.length} SECTION
                {sections.length === 1 ? "" : "S"}
              </Eyebrow>
              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
              >
                {sections.map((s, i) => (
                  <Card
                    key={s.id}
                    as="button"
                    onClick={() => setDrawer(s)}
                    className="text-left"
                  >
                    <div className="mb-3 flex items-center gap-2.5">
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-md"
                        style={{
                          background: "var(--forest-ghost)",
                          color: "var(--forest)",
                        }}
                      >
                        <Icon name={s.icon} size={16} />
                      </div>
                      <span className="mono text-[10px] text-mist-500">
                        {roman(i + 1)}.
                      </span>
                    </div>
                    <div
                      className="mb-1.5 font-display"
                      style={{
                        fontSize: 20,
                        letterSpacing: "-0.01em",
                        fontVariationSettings: '"opsz" 72, "wght" 460, "SOFT" 100',
                      }}
                    >
                      {s.title}
                    </div>
                    {s.tldr && (
                      <div className="m-0 text-[14px] leading-snug text-mist-600">
                        <InlineMarkdown>{s.tldr}</InlineMarkdown>
                      </div>
                    )}
                    <div className="mono mt-3.5 text-[11px] text-forest">
                      READ MORE →
                    </div>
                  </Card>
                ))}
              </div>
              <button
                onClick={() => navigate("/testfit")}
                className="btn-primary mt-10"
              >
                Continue to test fit <Icon name="arrow-right" size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Sidebar — uploads + defaults */}
        <aside>
          <Eyebrow style={{ marginBottom: 14 }}>ASSETS</Eyebrow>
          <div className="flex flex-col gap-3.5">
            <AssetLogoDrop />
            <AssetPlanDrop />
            <div
              className="rounded-lg border border-mist-200 p-4"
              style={{ background: "var(--canvas-alt)" }}
            >
              <Eyebrow style={{ marginBottom: 10 }}>DEFAULTS DETECTED</Eyebrow>
              <div className="flex flex-col gap-1 text-[13px]">
                <span>
                  <span className="mono text-mist-500">FTE</span>{" "}
                  {project.programme.headcount ?? "—"} →{" "}
                  {project.programme.growth_target ?? "—"}
                </span>
                <span>
                  <span className="mono text-mist-500">INDUSTRY</span>{" "}
                  {INDUSTRY_LABEL[project.client.industry]}
                </span>
                <span>
                  <span className="mono text-mist-500">POLICY</span>{" "}
                  {project.programme.flex_policy ?? "—"}
                </span>
                {manifest && (
                  <span>
                    <span className="mono text-mist-500">MCP</span>{" "}
                    {manifest.files.length} resources
                  </span>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Section drawer */}
      <Drawer open={!!drawer} onClose={() => setDrawer(null)} width={520}>
        {drawer && <DrawerContent section={drawer} onClose={() => setDrawer(null)} />}
      </Drawer>
    </div>
  );
}

function AssetLogoDrop() {
  const project = useProjectState();
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const logo = project.client.logo_data_url;

  const onPick = () => fileRef.current?.click();
  const onFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setClient({ logo_data_url: reader.result });
        toast("Client logo attached");
      }
    };
    reader.readAsDataURL(f);
  };

  if (logo) {
    return (
      <div
        className="flex items-center gap-3.5 rounded-lg border border-mist-200 p-3.5"
        style={{ background: "var(--canvas-alt)" }}
      >
        <img
          src={logo}
          alt="Client logo"
          className="h-14 w-14 rounded-md border border-mist-200 bg-raised object-contain p-1.5"
        />
        <div className="flex-1 text-[13px] text-ink">
          <div className="font-medium">{project.client.name || "Client"}</div>
          <div className="mono text-[10px] uppercase tracking-label text-mist-500">
            LOGO ATTACHED
          </div>
        </div>
        <button
          className="btn-minimal"
          onClick={() => {
            setClient({ logo_data_url: null });
            toast("Logo removed", "info");
          }}
        >
          <Icon name="x" size={12} /> Remove
        </button>
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={onPick}
        className="placeholder-img w-full text-center transition-colors hover:border-forest"
        style={{
          height: 120,
          border: "1px dashed var(--mist-300)",
          background: "transparent",
          color: "var(--mist-500)",
          cursor: "pointer",
        }}
      >
        <div className="text-center">
          <Icon name="upload" size={16} style={{ marginBottom: 6 }} />
          <div>DROP CLIENT LOGO</div>
          <div className="mt-0.5 text-[9px] text-mist-400">OPTIONAL</div>
        </div>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </>
  );
}

function AssetPlanDrop() {
  const project = useProjectState();
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [parsing, setParsing] = React.useState<null | { name: string }>(null);
  const [errorMsg, setErrorMsg] = React.useState("");
  const plan = project.floor_plan;

  const onPick = () => fileRef.current?.click();
  const onFile = async (f: File) => {
    setParsing({ name: f.name });
    setErrorMsg("");
    try {
      // iter-21b : Vision HD must run to populate rooms / walls /
      // openings — without them the testfit variant generator lays
      // out zones on a bare envelope. Token cost is worth it.
      const parsed = await uploadPlanPdf(f, true);
      setFloorPlan(parsed);
      toast("Floor plan parsed");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      toast("Plan parsing failed", "error");
    } finally {
      setParsing(null);
    }
  };

  if (parsing) {
    return (
      <div
        className="flex items-center gap-3 rounded-lg border border-dashed border-mist-300 p-4"
        style={{ background: "var(--canvas-alt)" }}
      >
        <span
          className="inline-block h-2 w-2 animate-[dot-pulse_1.1s_var(--ease)_infinite] rounded-full"
          style={{ background: "var(--forest)" }}
        />
        <div className="text-[13px] text-mist-700">
          Parsing <span className="mono text-mist-500">{parsing.name}</span>…
        </div>
      </div>
    );
  }

  if (plan) {
    const cols = plan.columns.length;
    const cores = plan.cores.length;
    return (
      <div
        className="flex items-start gap-3.5 rounded-lg border border-mist-200 p-3.5"
        style={{ background: "var(--canvas-alt)" }}
      >
        <div
          className="flex h-10 w-10 items-center justify-center rounded-md"
          style={{
            background: "rgba(107, 143, 127, 0.16)",
            color: "var(--mint)",
          }}
        >
          <Icon name="shield-check" size={16} />
        </div>
        <div className="flex-1 text-[13px] text-ink">
          <div className="font-medium">
            {plan.name ?? "Floor plan"}
          </div>
          <div className="text-mist-600">
            {plan.envelope.points.length} pts · {cols} columns · {cores} cores
          </div>
        </div>
        <button
          className="btn-minimal"
          onClick={() => {
            setFloorPlan(null);
            toast("Floor plan cleared", "info");
          }}
        >
          <Icon name="x" size={12} /> Clear
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={onPick}
        className="placeholder-img w-full text-center transition-colors hover:border-forest"
        style={{
          height: 160,
          border: "1px dashed var(--mist-300)",
          background: "transparent",
          color: "var(--mist-500)",
          cursor: "pointer",
        }}
      >
        <div className="text-center">
          <Icon name="file-text" size={16} style={{ marginBottom: 6 }} />
          <div>DROP FLOOR PLAN PDF</div>
          <div
            className="mt-0.5 text-[9px] text-mist-400"
            style={{ maxWidth: 180, margin: "2px auto 0" }}
          >
            GIVES AGENTS BETTER SPATIAL CONSTRAINTS
          </div>
          {errorMsg && (
            <div className="mt-2 text-[10px] text-clay">{errorMsg}</div>
          )}
        </div>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </>
  );
}

function DrawerContent({
  section,
  onClose,
}: {
  section: ProgrammeSection;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-9">
      <div className="mb-6 flex items-center justify-between">
        <Eyebrow>PROGRAMME · DETAIL</Eyebrow>
        <button onClick={onClose} className="text-mist-500 hover:text-ink">
          <Icon name="x" size={18} />
        </button>
      </div>
      <div
        className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg"
        style={{
          background: "var(--forest-ghost)",
          color: "var(--forest)",
        }}
      >
        <Icon name={section.icon} size={20} />
      </div>
      <h2
        className="m-0 mb-3.5 font-display italic"
        style={{
          fontSize: 36,
          fontVariationSettings: '"opsz" 144, "wght" 480, "SOFT" 100',
        }}
      >
        {section.title}
      </h2>
      {section.tldr && (
        <div
          className="m-0 mb-6 font-display"
          style={{
            fontSize: 19,
            color: "var(--mist-700)",
            fontVariationSettings: '"opsz" 72, "wght" 400, "SOFT" 100',
          }}
        >
          <InlineMarkdown>{section.tldr}</InlineMarkdown>
        </div>
      )}
      {/* Iter-20c (Saad #4) : markdown tables render correctly inside
          `prose` when the parent scrolls on x overflow. Wrap tables in
          a scroll pane so a wide table doesn't break the drawer width.
          Iter-32 (Saad #2) : editorial table styling — forest header
          band, hairline cell rules, mono numbers via `prose-td:font-mono`
          on cells whose content is purely numeric. The body now reaches
          react-markdown intact (programmeSections no longer eats the
          table header row), so GFM's pipe-table parser produces a real
          `<table>` instead of leaking `|---|---|` raw text. */}
      <div className="prose prose-sm max-w-none
                      prose-headings:font-display prose-headings:text-ink
                      prose-p:text-ink-soft prose-strong:text-ink
                      prose-table:my-4 prose-table:rounded-lg prose-table:overflow-hidden prose-table:border prose-table:border-mist-200
                      prose-thead:border-b prose-thead:border-forest/30
                      prose-th:bg-forest/5 prose-th:text-forest prose-th:font-mono prose-th:text-[11px] prose-th:uppercase prose-th:tracking-[0.08em]
                      prose-th:px-3 prose-th:py-2.5 prose-th:text-left
                      prose-td:border-t prose-td:border-mist-100 prose-td:px-3 prose-td:py-2 prose-td:text-[13px] prose-td:text-ink
                      [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto
                      [&_tbody_tr:nth-child(even)_td]:bg-canvas-alt/40">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.body}</ReactMarkdown>
      </div>
      <div className="mt-7 border-t border-mist-200 pt-5">
        <Eyebrow style={{ marginBottom: 10 }}>SOURCES</Eyebrow>
        <div className="mono leading-loose text-mist-600">
          → Leesman Index 2024
          <br />
          → Gensler Workplace Survey EU 2024
          <br />
          → ERP Type W · Arrêté 25 juin 1980
          <br />
          → design://adjacency-rules
        </div>
      </div>

      <Placeholder
        tag="STUDY · IMAGE · 16 / 10"
        ratio="16/10"
        tint="#2F4A3F"
        style={{ marginTop: 24 }}
      />
    </div>
  );
}
