import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import DotStatus from "../components/ui/DotStatus";
import TypewriterText from "../components/ui/TypewriterText";
import {
  BriefResponse,
  fetchBriefManifest,
  synthesizeBrief,
  type BriefManifest,
  type SubAgentTrace,
} from "../lib/api";

const LUMEN_BRIEF = `Lumen, startup fintech, 120 personnes aujourd'hui, 170 projetées d'ici 24 mois.
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

const AGENTS: Array<{ name: string; role: string; typing: string }> = [
  {
    name: "Effectifs",
    role: "sizes the space matrix with defended ratios",
    typing: "Counting desks, meeting rooms, support spaces…",
  },
  {
    name: "Benchmarks",
    role: "pulls Leesman & Gensler and cites the passages",
    typing: "Cross-referencing Leesman 2023 and Gensler Workplace Survey…",
  },
  {
    name: "Contraintes",
    role: "checks PMR, ERP, code du travail",
    typing: "Reading arrêté 25 juin 1980 and NF EN 527…",
  },
  {
    name: "Consolidator",
    role: "merges the three into one sourced programme",
    typing: "Folding the three voices into a single document…",
  },
];

type RunState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; response: BriefResponse }
  | { kind: "error"; message: string };

const STORAGE_KEY = "design-office.brief.result";

export default function Brief() {
  const [brief, setBrief] = useState(LUMEN_BRIEF);
  const [clientName, setClientName] = useState("Lumen");
  const [manifest, setManifest] = useState<BriefManifest | null>(null);
  const [run, setRun] = useState<RunState>({ kind: "idle" });

  useEffect(() => {
    const ac = new AbortController();
    fetchBriefManifest(ac.signal)
      .then(setManifest)
      .catch(() => setManifest(null));
    return () => ac.abort();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as BriefResponse;
      setRun({ kind: "done", response: parsed });
    } catch {
      /* ignore */
    }
  }, []);

  const onSubmit = async () => {
    setRun({ kind: "running" });
    try {
      const response = await synthesizeBrief({
        brief,
        client_name: clientName || undefined,
        language: "fr",
      });
      setRun({ kind: "done", response });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(response));
      } catch {
        /* ignore */
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setRun({ kind: "error", message });
    }
  };

  const onReset = () => {
    setRun({ kind: "idle" });
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-20">
      <section className="grid gap-14 lg:grid-cols-[minmax(0,1.25fr),minmax(0,1fr)]">
        <div>
          <p className="eyebrow-forest">I · Brief</p>
          <h1
            className="mt-5 font-display text-display-sm leading-[1.02] text-ink"
            style={{ fontVariationSettings: '"opsz" 144, "wght" 620, "SOFT" 100' }}
          >
            Synthesize the <em className="italic">programme</em>.
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-soft">
            Describe the client, their culture, the surface. Three managed agents read the brief in
            parallel, a fourth consolidates — you leave with a sourced functional programme in under
            ninety seconds.
          </p>

          <div className="mt-14 space-y-10">
            <div>
              <label className="label-xs text-ink-muted">Client</label>
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="input-line mt-3 w-full font-display text-[1.75rem] leading-tight text-ink"
                style={{ fontVariationSettings: '"opsz" 72, "wght" 520, "SOFT" 100' }}
                placeholder="Client name"
              />
            </div>

            <div>
              <label className="label-xs text-ink-muted">The brief</label>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                className="textarea-page mt-3 w-full"
                rows={16}
                placeholder="Paste the client brief — or describe their culture, their rituals, their constraints."
              />
            </div>

            <div className="flex flex-wrap items-center gap-5 border-t border-hairline pt-8">
              <button
                className="btn-primary"
                disabled={run.kind === "running" || brief.length < 50}
                onClick={onSubmit}
              >
                {run.kind === "running" ? "Synthesizing…" : "Generate programme"}
              </button>
              {run.kind === "done" && (
                <button className="btn-minimal" onClick={onReset}>
                  Start over
                </button>
              )}
              {run.kind === "error" && (
                <span className="font-mono text-[11px] uppercase tracking-label text-clay">
                  Error · {run.message}
                </span>
              )}
              {manifest && (
                <span className="ml-auto font-mono text-[10px] uppercase tracking-label text-ink-muted">
                  {manifest.files.length} resources · benchmarks v{manifest.benchmarks_version}
                </span>
              )}
            </div>
          </div>
        </div>

        <aside className="lg:pl-10">
          <p className="eyebrow-forest">Managed agents</p>
          <p
            className="mt-4 font-display text-[1.75rem] leading-[1.15] text-ink"
            style={{ fontVariationSettings: '"opsz" 72, "wght" 520, "SOFT" 100' }}
          >
            Three readers, <em className="italic">one editor</em>.
          </p>
          <ol className="mt-10 space-y-8">
            {AGENTS.map((agent, i) => (
              <AgentLine key={agent.name} index={i} agent={agent} state={run} />
            ))}
          </ol>

          {run.kind === "done" && (
            <div className="mt-12 border-t border-hairline pt-6">
              <p className="label-xs text-ink-muted">Token usage</p>
              <p className="mt-2 font-mono text-[13px] text-ink">
                {run.response.tokens.input.toLocaleString()} in ·{" "}
                {run.response.tokens.output.toLocaleString()} out
              </p>
            </div>
          )}
        </aside>
      </section>

      <AnimatePresence mode="wait">
        {run.kind === "running" && <RunningPanel key="running" />}
        {run.kind === "done" && <DonePanel key="done" response={run.response} />}
      </AnimatePresence>
    </div>
  );
}

function AgentLine({
  index,
  agent,
  state,
}: {
  index: number;
  agent: { name: string; role: string; typing: string };
  state: RunState;
}) {
  const isDone =
    state.kind === "done" && state.response.trace.find((t) => t.name === agent.name);
  const isRunning = state.kind === "running";
  const tone = isDone ? "ok" : isRunning ? "running" : "idle";

  return (
    <li className="flex items-start gap-4">
      <span className="mt-[10px] shrink-0">
        <DotStatus tone={tone} />
      </span>
      <div className="flex-1">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span
            className="font-display text-[1.05rem] text-ink"
            style={{ fontVariationSettings: '"opsz" 72, "wght" 520, "SOFT" 100' }}
          >
            {agent.name}
          </span>
        </div>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">{agent.role}</p>
        {isRunning && (
          <p className="mt-2 font-mono text-[11px] uppercase tracking-label text-forest">
            <TypewriterText text={agent.typing} speed={22} caret />
          </p>
        )}
      </div>
    </li>
  );
}

function RunningPanel() {
  const lines = [
    "Loading 10 MCP resources…",
    "Fanning out to three sub-agents in parallel…",
    "Effectifs is counting support spaces and ancillary rooms…",
    "Benchmarks is cross-referencing Leesman and Gensler…",
    "Contraintes is reading the arrêté 25 juin 1980…",
    "Consolidator is weaving the three voices together…",
  ];
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-lg border border-hairline bg-raised/70 px-12 py-14"
    >
      <p className="eyebrow-forest">Opus 4.7 · live</p>
      <h2
        className="mt-5 font-display text-[2.25rem] leading-tight text-ink"
        style={{ fontVariationSettings: '"opsz" 96, "wght" 560, "SOFT" 100' }}
      >
        Synthesizing programme…
      </h2>
      <ul className="mt-10 space-y-3 font-mono text-[12px] uppercase tracking-label text-ink-muted">
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
    </motion.section>
  );
}

function DonePanel({ response }: { response: BriefResponse }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="grid gap-10 lg:grid-cols-[minmax(0,1.7fr),minmax(0,1fr)]"
    >
      <article className="min-w-0">
        <p className="eyebrow-forest">The programme</p>
        <div className="mt-4 prose prose-lg max-w-none prose-headings:font-display prose-headings:text-ink prose-p:text-ink-soft prose-strong:text-ink prose-a:text-forest prose-a:no-underline hover:prose-a:underline prose-table:text-[14px]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{response.programme}</ReactMarkdown>
        </div>
      </article>

      <aside className="min-w-0 lg:border-l lg:border-hairline lg:pl-10">
        <p className="eyebrow-forest">Agent trace</p>
        <div className="mt-5 space-y-3">
          {response.trace.map((trace) => (
            <TraceCard key={trace.name} trace={trace} />
          ))}
        </div>
      </aside>
    </motion.section>
  );
}

function TraceCard({ trace }: { trace: SubAgentTrace }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-hairline bg-raised transition-colors hover:border-mist-300">
      <button
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div>
          <p
            className="font-display text-[1.1rem] text-ink"
            style={{ fontVariationSettings: '"opsz" 72, "wght" 520, "SOFT" 100' }}
          >
            {trace.name}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-label text-ink-muted">
            {(trace.tokens.input + trace.tokens.output).toLocaleString()} tok ·{" "}
            {(trace.duration_ms / 1000).toFixed(1)}s
          </p>
        </div>
        <span className="mt-1 font-mono text-[10px] uppercase tracking-label text-forest">
          {open ? "close" : "read"}
        </span>
      </button>
      {open && (
        <div className="border-t border-hairline px-5 pb-5 pt-4">
          <div className="prose prose-sm max-w-none prose-p:text-ink-soft prose-strong:text-ink">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{trace.text}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
