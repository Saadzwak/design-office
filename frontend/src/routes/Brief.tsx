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
  type BriefManifest,
  type BriefResponse,
} from "../lib/api";
import { INDUSTRY_LABEL, setBrief, setClient, setProgramme } from "../lib/projectState";
import {
  parseProgrammeSections,
  type ProgrammeSection,
} from "../lib/adapters/programmeSections";

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
  // reload still shows the cards the user already synthesised.
  useEffect(() => {
    if (phase.kind === "idle" && project.programme.markdown) {
      setPhase({
        kind: "done",
        response: {
          programme: project.programme.markdown,
          trace: [],
          tokens: { input: 0, output: 0 },
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sections: ProgrammeSection[] = useMemo(() => {
    if (phase.kind === "done") {
      return parseProgrammeSections(phase.response.programme);
    }
    return parseProgrammeSections(project.programme.markdown);
  }, [phase, project.programme.markdown]);

  const runSynthesis = async () => {
    setPhase({ kind: "running" });
    setBrief(draft);
    try {
      const res = await synthesizeBrief({
        brief: draft,
        client_name: project.client.name,
        language: "fr",
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

  const agents: AgentRow[] = STUDIO_AGENTS.map((a) => {
    let status: AgentStatus = "pending";
    let message: string | undefined;
    if (phase.kind === "running") {
      status = "active";
      message = a.running;
    } else if (phase.kind === "done") {
      const hit = phase.response.trace.find((t) => t.name === a.traceName);
      status = "done";
      message = hit ? a.done : a.done;
    }
    return { roman: a.roman, name: a.name, status, message };
  });

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
              {phase.kind === "done" && phase.response.tokens.input > 0 && (
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
                    <p className="m-0 text-[14px] leading-snug text-mist-600">
                      {s.tldr}
                    </p>
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
            <DropPlaceholder
              icon="upload"
              title="DROP CLIENT LOGO"
              hint="OPTIONAL"
              height={120}
            />
            <DropPlaceholder
              icon="file-text"
              title="DROP FLOOR PLAN PDF"
              hint="GIVES AGENTS BETTER SPATIAL CONSTRAINTS"
              height={160}
            />
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

function DropPlaceholder({
  icon,
  title,
  hint,
  height,
}: {
  icon: string;
  title: string;
  hint: string;
  height: number;
}) {
  return (
    <div
      className="placeholder-img"
      style={{
        height,
        border: "1px dashed var(--mist-300)",
        background: "transparent",
        color: "var(--mist-500)",
      }}
    >
      <div className="text-center">
        <Icon name={icon} size={16} style={{ marginBottom: 6 }} />
        <div>{title}</div>
        <div
          className="mt-0.5 text-[9px] text-mist-400"
          style={{ maxWidth: 180 }}
        >
          {hint}
        </div>
      </div>
    </div>
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
    <div className="h-full overflow-auto p-9">
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
      <p
        className="m-0 mb-6 font-display"
        style={{
          fontSize: 19,
          color: "var(--mist-700)",
          fontVariationSettings: '"opsz" 72, "wght" 400, "SOFT" 100',
        }}
      >
        {section.tldr}
      </p>
      <div className="prose prose-sm max-w-none prose-headings:font-display prose-headings:text-ink prose-p:text-ink-soft prose-strong:text-ink">
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
