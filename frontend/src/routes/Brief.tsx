import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

const AGENT_ORDER = ["Effectifs", "Benchmarks", "Contraintes", "Consolidator"];

type RunState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; response: BriefResponse }
  | { kind: "error"; message: string };

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

  const onSubmit = async () => {
    setRun({ kind: "running" });
    try {
      const response = await synthesizeBrief({
        brief,
        client_name: clientName || undefined,
        language: "fr",
      });
      setRun({ kind: "done", response });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setRun({ kind: "error", message });
    }
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[1.1fr,1fr]">
      <section>
        <h1 className="font-serif text-4xl">Smart brief</h1>
        <p className="mt-3 max-w-xl text-neutral-300">
          Describe the client, their culture, their constraints. Three managed agents merge into a
          sourced functional programme you can send tomorrow morning.
        </p>

        <label className="mt-8 block font-mono text-xs uppercase tracking-widest text-neutral-400">
          Client name
        </label>
        <input
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          className="mt-2 w-full rounded-xl border border-neutral-500/30 bg-neutral-800/30 px-4 py-2.5 text-sm text-bone-text focus:border-terracotta/50 focus:outline-none"
        />

        <label className="mt-6 block font-mono text-xs uppercase tracking-widest text-neutral-400">
          Client brief
        </label>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          className="mt-2 h-80 w-full resize-none rounded-2xl border border-neutral-500/30 bg-neutral-800/30 p-4 font-mono text-sm leading-relaxed text-bone-text focus:border-terracotta/50 focus:outline-none"
        />

        <div className="mt-6 flex items-center gap-3">
          <button
            className="btn-primary"
            disabled={run.kind === "running" || brief.length < 50}
            onClick={onSubmit}
          >
            {run.kind === "running" ? "Generating…" : "Generate programme"}
          </button>
          {run.kind === "error" && (
            <span className="font-mono text-xs text-terracotta">Error: {run.message}</span>
          )}
        </div>

        {manifest && (
          <p className="mt-4 font-mono text-[11px] text-neutral-500">
            {manifest.files.length} MCP resources loaded · benchmarks v{manifest.benchmarks_version}
          </p>
        )}
      </section>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-neutral-500/20 bg-neutral-800/20 p-6">
          <p className="font-mono text-xs uppercase tracking-widest text-neutral-400">
            Managed agents
          </p>
          <ul className="mt-4 space-y-4 text-sm text-neutral-200">
            <AgentRow name="Effectifs" state={run} index={0}>
              computes the space matrix with defended ratios.
            </AgentRow>
            <AgentRow name="Benchmarks" state={run} index={1}>
              pulls Leesman / Gensler benchmarks and cites them.
            </AgentRow>
            <AgentRow name="Contraintes" state={run} index={2}>
              checks PMR, ERP, and code du travail.
            </AgentRow>
            <AgentRow name="Consolidator" state={run} index={3} consolidator>
              merges the three into a sourced programme.
            </AgentRow>
          </ul>
        </div>

        {run.kind === "done" && (
          <div className="rounded-2xl border border-neutral-500/20 bg-neutral-800/20 p-6">
            <p className="font-mono text-xs uppercase tracking-widest text-neutral-400">
              Token usage
            </p>
            <p className="mt-2 font-mono text-xs text-neutral-300">
              {run.response.tokens.input.toLocaleString()} in ·{" "}
              {run.response.tokens.output.toLocaleString()} out
            </p>
          </div>
        )}
      </aside>

      <AnimatePresence>
        {run.kind === "done" && (
          <motion.section
            key="programme"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-2"
          >
            <div className="mt-4 grid gap-6 lg:grid-cols-[1.6fr,1fr]">
              <article className="prose prose-invert max-w-none rounded-2xl border border-neutral-500/20 bg-neutral-800/20 p-8">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{run.response.programme}</ReactMarkdown>
              </article>
              <aside className="space-y-3">
                <p className="font-mono text-xs uppercase tracking-widest text-neutral-400">
                  Agent trace
                </p>
                {AGENT_ORDER.map((name) => {
                  const trace = run.response.trace.find((t) => t.name === name);
                  if (!trace) return null;
                  return <TraceCard key={name} trace={trace} />;
                })}
              </aside>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

function AgentRow({
  name,
  children,
  state,
  index,
  consolidator,
}: {
  name: string;
  children: React.ReactNode;
  state: RunState;
  index: number;
  consolidator?: boolean;
}) {
  const label =
    state.kind === "done" && state.response.trace.find((t) => t.name === name)
      ? "done"
      : state.kind === "running"
        ? "running…"
        : "idle";
  return (
    <li className="flex items-start gap-3">
      <span
        className={[
          "mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full",
          label === "done"
            ? "bg-terracotta"
            : label === "running…"
              ? "animate-pulse bg-ochre"
              : "bg-neutral-500/50",
        ].join(" ")}
      />
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-neutral-400">
          {String(index + 1).padStart(2, "0")} · {consolidator ? "→ " : ""}
          {name}
        </p>
        <p className="mt-1 text-sm text-neutral-200">{children}</p>
      </div>
    </li>
  );
}

function TraceCard({ trace }: { trace: SubAgentTrace }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-neutral-500/20 bg-neutral-800/30 p-4">
      <button
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-serif text-lg">{trace.name}</span>
        <span className="font-mono text-[11px] text-neutral-400">
          {trace.tokens.input + trace.tokens.output} tok · {(trace.duration_ms / 1000).toFixed(1)} s
        </span>
      </button>
      {open && (
        <div className="prose prose-invert mt-4 max-w-none text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{trace.text}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
