import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, FileText, Layers, Radio, Workflow } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const STEPS = [
  {
    n: "01",
    title: "Brief",
    icon: FileText,
    body: "Paste a client brief. Three agents produce a costed, sourced functional program in seconds.",
    to: "/brief",
  },
  {
    n: "02",
    title: "Test fit",
    icon: Layers,
    body: "Upload a PDF floor plan. Opus Vision reads it in HD and builds three 3D variants in SketchUp in parallel.",
    to: "/testfit",
  },
  {
    n: "03",
    title: "Justify",
    icon: Radio,
    body: "Every design choice backed by acoustic, ergonomic, regulatory, and neuroarchitecture sources.",
    to: "/justify",
  },
  {
    n: "04",
    title: "Export",
    icon: Workflow,
    body: "One click to a dimensioned A1 DWG with title block, ready for the construction package.",
    to: "/export",
  },
];

const STATS = [
  {
    value: "10",
    suffix: "min",
    label: "from brief to signable DWG (Lumen end-to-end)",
  },
  {
    value: "2 700",
    suffix: "lines",
    label: "sourced MCP resources (NF, ISO, WELL, arrêtés, peer-reviewed)",
  },
  {
    value: "3 × 3",
    suffix: "agents",
    label: "managed-agent orchestration levels",
  },
  {
    value: "41",
    suffix: "SKUs",
    label: "manufacturer furniture catalogue with real dimensions",
  },
];

const SOURCES = [
  "Browning · Ryan · Clancy 2014 — 14 Patterns",
  "NF S 31-080 · Bureaux et espaces associés",
  "NF S 31-199 · Open-plan acoustic performance",
  "ISO 3382-3:2022 — rD / D2,S / Lp,A,S,4m",
  "Nieuwenhuis et al. 2014 — +15 % productivity",
  "Ulrich 1984 — View Through a Window (Science)",
  "Arrêté du 20 avril 2017 — Accessibilité ERP",
  "Code du travail R. 4223 — Éclairage",
  "EN 12464-1:2021 — 500 lx task area",
  "Kaplan & Kaplan — Attention Restoration Theory",
  "Hongisto 2005 · Haapakangas 2020 · STI threshold 0.21",
  "Leesman 2019-2024 multi-year Lmi / H-Lmi",
  "Gensler Workplace Survey 2020-2024",
  "FlexOS · Ronspot · CBRE — 2024-2025 flex industry",
];

function useCycle<T>(items: T[], ms = 2400): T {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % items.length), ms);
    return () => clearInterval(t);
  }, [items.length, ms]);
  return items[i];
}

export default function Landing() {
  const rotator = useCycle(
    [
      { label: "Vision HD reads your plans", accent: "Opus 4.7" },
      { label: "Three agents draft the programme", accent: "Opus 4.7" },
      { label: "Three variants in parallel SketchUp", accent: "Opus 4.7" },
      { label: "Four researchers cite every claim", accent: "Opus 4.7" },
      { label: "One click, A1 DWG, five layers", accent: "AutoCAD" },
    ],
    2800,
  );

  return (
    <div className="space-y-32">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative pt-16"
      >
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-terracotta">
          AI co-architect · office interiors · built with Opus 4.7
        </p>
        <h1 className="mt-8 max-w-5xl font-serif text-5xl leading-[1.02] tracking-tight md:text-[84px] md:leading-[0.98]">
          Design Office
          <br />
          turns a brief
          <br />
          into a dimensioned plan.
        </h1>

        <p className="mt-8 max-w-2xl text-lg leading-relaxed text-neutral-300">
          Space planners spend <span className="text-bone-text">two to eight weeks</span> on
          programming and <span className="text-bone-text">one to three weeks</span> per test fit.
          With Opus 4.7 reading your floor plans, orchestrating managed agents, and citing real
          sources, both collapse to minutes — and every design choice ships with a footnote.
        </p>

        <div className="mt-12 flex flex-wrap items-center gap-3">
          <Link to="/brief" className="btn-primary">
            Start a project <ArrowRight className="h-4 w-4" />
          </Link>
          <a href="#how-it-works" className="btn-ghost">
            How it works
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-neutral-400 hover:text-bone-text"
          >
            Open-source · MIT license
          </a>
        </div>

        {/* Live rotating ticker */}
        <div className="mt-16 overflow-hidden rounded-2xl border border-neutral-500/20 bg-neutral-800/20 p-5">
          <div className="flex items-center gap-4">
            <span className="h-2 w-2 animate-pulse rounded-full bg-terracotta" />
            <AnimatePresence mode="wait">
              <motion.p
                key={rotator.label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35 }}
                className="flex flex-1 items-baseline justify-between"
              >
                <span className="font-serif text-xl text-bone-text">{rotator.label}</span>
                <span className="font-mono text-xs uppercase tracking-widest text-neutral-400">
                  via {rotator.accent}
                </span>
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      </motion.section>

      {/* Stats strip */}
      <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {STATS.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border border-neutral-500/20 bg-neutral-800/20 p-6"
          >
            <p className="font-serif text-5xl text-bone-text">
              {stat.value}
              <span className="ml-2 font-mono text-xs uppercase tracking-widest text-terracotta">
                {stat.suffix}
              </span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-neutral-300">{stat.label}</p>
          </motion.div>
        ))}
      </section>

      {/* How it works */}
      <section id="how-it-works" className="space-y-8">
        <div className="flex items-end justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-terracotta">
              How it works
            </p>
            <h2 className="mt-4 max-w-3xl font-serif text-4xl leading-tight md:text-5xl">
              Four surfaces, three levels of managed agents, zero slide decks.
            </h2>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, idx) => (
            <motion.article
              key={step.n}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: idx * 0.05, ease: [0.16, 1, 0.3, 1] }}
              className="group relative overflow-hidden rounded-2xl border border-neutral-500/20 bg-neutral-800/30 p-6 transition-colors hover:border-terracotta/50"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-500/30 bg-neutral-900/50">
                  <step.icon className="h-4 w-4 text-terracotta" />
                </span>
                <p className="font-mono text-xs text-neutral-400">{step.n}</p>
              </div>
              <h3 className="mt-6 text-2xl text-bone-text">{step.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-neutral-300">{step.body}</p>
              <Link
                to={step.to}
                className="mt-6 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-widest text-terracotta transition-colors hover:text-bone-text"
              >
                Open <ArrowRight className="h-3 w-3" />
              </Link>
              <div className="pointer-events-none absolute -bottom-24 -right-24 h-48 w-48 rounded-full bg-terracotta/5 blur-3xl transition-opacity group-hover:bg-terracotta/10" />
            </motion.article>
          ))}
        </div>
      </section>

      {/* Sources marquee */}
      <section className="space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-terracotta">
              Cited, not invented
            </p>
            <h2 className="mt-4 max-w-3xl font-serif text-4xl leading-tight md:text-5xl">
              Every number footnoted. Every regulation quoted.
            </h2>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-neutral-500/20 bg-neutral-800/20 p-2">
          <div className="flex animate-marquee whitespace-nowrap">
            {[...SOURCES, ...SOURCES].map((src, i) => (
              <span
                key={`${src}-${i}`}
                className="mx-6 inline-block py-4 font-mono text-xs uppercase tracking-widest text-neutral-300"
              >
                <span className="mr-3 text-terracotta">·</span>
                {src}
              </span>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-ink to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-ink to-transparent" />
        </div>
        <p className="text-sm text-neutral-400">
          Full resource list in the{" "}
          <a
            href="https://github.com"
            className="text-terracotta hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            docs/ARCHITECTURE.md
          </a>
          . Anything we couldn't verify at time of writing carries a{" "}
          <code className="rounded border border-neutral-500/30 bg-neutral-900/50 px-1 py-0.5 font-mono text-[11px] text-neutral-300">
            [À VÉRIFIER]
          </code>{" "}
          marker — not a fabrication.
        </p>
      </section>

      {/* CTA strip */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-2xl border border-neutral-500/20 bg-neutral-800/30 p-10 md:p-16"
      >
        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-terracotta">
              Hackathon build — Built with Opus 4.7
            </p>
            <h2 className="mt-4 max-w-3xl font-serif text-4xl leading-tight md:text-5xl">
              Try it on Lumen — the reference brief ships with the repo.
            </h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/brief" className="btn-primary">
              Start a project <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/testfit" className="btn-ghost">
              Open the Test Fit
            </Link>
          </div>
        </div>
        <div className="pointer-events-none absolute -right-40 -top-40 h-96 w-96 rounded-full bg-terracotta/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 -bottom-24 h-96 w-96 rounded-full bg-ochre/10 blur-3xl" />
      </motion.section>
    </div>
  );
}
