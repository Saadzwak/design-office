import { motion } from "framer-motion";
import { Link } from "react-router-dom";

const STEPS = [
  {
    n: "01",
    title: "Brief",
    body: "Paste a client brief. Three agents produce a costed, sourced functional program in seconds.",
  },
  {
    n: "02",
    title: "Test fit",
    body: "Upload a PDF floor plan. Opus Vision reads it in HD and builds three 3D variants in SketchUp in parallel.",
  },
  {
    n: "03",
    title: "Justify",
    body: "Every design choice backed by acoustic, ergonomic, regulatory, and neuroarchitecture sources.",
  },
  {
    n: "04",
    title: "Export",
    body: "One click to a dimensioned A1 DWG with title block, ready for the construction package.",
  },
];

export default function Landing() {
  return (
    <div className="space-y-24">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="pt-16"
      >
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-terracotta">
          AI co-architect · office interiors
        </p>
        <h1 className="mt-6 max-w-4xl font-serif text-5xl leading-[1.05] tracking-tight md:text-7xl">
          Design Office turns a brief into a dimensioned plan.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-neutral-300">
          The programming and test-fit phases used to take weeks. With Opus 4.7 reading your floor
          plans, orchestrating managed agents, and citing real sources, they take minutes.
        </p>
        <div className="mt-10 flex items-center gap-3">
          <Link to="/brief" className="btn-primary">
            Start a project
          </Link>
          <a href="#how-it-works" className="btn-ghost">
            How it works
          </a>
        </div>
      </motion.section>

      <section id="how-it-works" className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, idx) => (
          <motion.article
            key={step.n}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: idx * 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border border-neutral-500/20 bg-neutral-800/30 p-6"
          >
            <p className="font-mono text-xs text-neutral-400">{step.n}</p>
            <h3 className="mt-3 text-2xl text-bone-text">{step.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-neutral-300">{step.body}</p>
          </motion.article>
        ))}
      </section>
    </div>
  );
}
