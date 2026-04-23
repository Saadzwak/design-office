import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

const HERO_IMG =
  "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1800&q=80";
const SECOND_IMG =
  "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1800&q=80";

const SURFACES = [
  {
    n: "I",
    title: "Brief",
    description:
      "Three agents turn a client brief into a costed, sourced functional programme — ready to send.",
    eta: "≈ 3 minutes",
    to: "/brief",
  },
  {
    n: "II",
    title: "Test Fit",
    description:
      "Opus Vision reads your plan at HD and composes three contrasted 3D variants in SketchUp.",
    eta: "≈ 3 minutes",
    to: "/testfit",
  },
  {
    n: "III",
    title: "Mood Board",
    description:
      "A curated palette of materials, furniture and planting, adapted to the client's industry and identity.",
    eta: "≈ 2 minutes",
    to: "/moodboard",
  },
  {
    n: "IV",
    title: "Justify",
    description:
      "Every decision defended with a source — acoustic, neuroarchitecture, regulatory, programming.",
    eta: "≈ 4 minutes",
    to: "/justify",
  },
  {
    n: "V",
    title: "Export",
    description:
      "A dimensioned A1 DWG, five Design Office layers, title-block ready for the approvals office.",
    eta: "≈ 2 seconds",
    to: "/export",
  },
];

const SOURCES = [
  "NF S 31-080 · Bureaux & espaces associés",
  "NF S 31-199 · Open-plan acoustic performance",
  "ISO 3382-3:2022 · D2,S / rD / Lp,A,S,4m",
  "Arrêté du 20 avril 2017 · Accessibilité ERP",
  "Code du travail · R. 4222 / R. 4223",
  "EN 12464-1 · 500 lux task area",
  "Browning · Ryan · Clancy 2014 · 14 Patterns",
  "Kellert · Heerwagen · Mador 2008",
  "Nieuwenhuis et al. 2014 · +15 % productivity",
  "Ulrich 1984 · View through a window (Science)",
  "Kaplan & Kaplan · Attention Restoration",
  "Hongisto 2005 · STI threshold 0.21",
  "Leesman 2019–2024 · Lmi / H-Lmi",
  "Gensler 2020–2024 · Workplace Survey",
];

export default function Landing() {
  return (
    <div className="space-y-40">
      {/* Hero */}
      <section className="relative">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="grid grid-cols-12 gap-8 pt-4"
        >
          <div className="col-span-12 lg:col-span-7">
            <p className="eyebrow-forest">
              AI co-architect · tertiary fit-out
            </p>
            <h1
              className="mt-10 font-display text-[72px] leading-[0.98] tracking-[-0.035em] text-ink md:text-[104px]"
              style={{ fontVariationSettings: '"opsz" 144, "wght" 620, "SOFT" 100' }}
            >
              A quiet
              <br />
              <span className="italic" style={{ fontVariationSettings: '"opsz" 144, "wght" 450, "SOFT" 100' }}>
                co-architect
              </span>
              <br />
              for office
              <br />
              interiors.
            </h1>
            <p className="mt-10 max-w-xl font-serif text-[19px] leading-[1.55] text-ink-soft" style={{ fontVariationSettings: '"opsz" 24, "wght" 400, "SOFT" 100' }}>
              Space planners spend two to eight weeks on programming and one to
              three on a test fit. Design Office reads your plan, drafts three
              variants in SketchUp, and justifies every choice with a real
              source — in the time it takes to brew a pot of coffee.
            </p>
            <div className="mt-12 flex items-center gap-5">
              <Link to="/brief" className="btn-primary">
                Start a project
                <ArrowUpRight className="h-4 w-4" />
              </Link>
              <a href="#how-it-works" className="btn-minimal">
                How it works
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-5">
            <figure className="relative overflow-hidden rounded-lg border border-hairline bg-raised">
              <img
                src={HERO_IMG}
                alt="Light-filled tertiary interior, warm wood and white volumes"
                className="aspect-[4/5] w-full object-cover"
                style={{ filter: "grayscale(1) contrast(1.04) brightness(0.98)" }}
                loading="eager"
              />
              <figcaption className="absolute bottom-0 left-0 right-0 flex items-end justify-between bg-gradient-to-t from-ink/55 via-ink/15 to-transparent p-5 text-raised">
                <p className="font-mono text-[10px] uppercase tracking-label">
                  Lumen · Paris · 2 400 m²
                </p>
                <p className="font-mono text-[10px] uppercase tracking-label">
                  atelier north · 130 desks
                </p>
              </figcaption>
            </figure>
          </div>
        </motion.div>
      </section>

      {/* Metric strip */}
      <section>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline md:grid-cols-4">
          <Metric n="10" suffix="minutes" label="Cold-start to signable plan" />
          <Metric n="2,700" suffix="lines" label="Sourced MCP resources" />
          <Metric n="3 × 3" suffix="agents" label="Managed-agent levels" />
          <Metric n="41" suffix="SKUs" label="Furniture catalogue" />
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="grid grid-cols-12 gap-8">
        <div className="col-span-12 lg:col-span-4">
          <p className="eyebrow-forest">Five surfaces</p>
          <h2
            className="mt-6 font-display text-[48px] leading-[1.02] tracking-[-0.02em] text-ink md:text-[60px]"
            style={{ fontVariationSettings: '"opsz" 96, "wght" 560, "SOFT" 100' }}
          >
            The craft,
            <br />
            compressed.
          </h2>
          <p className="mt-6 max-w-md font-sans text-[15px] leading-relaxed text-ink-soft">
            Four moments in the life of a fit-out — programming, test fit,
            justification, technical export — each now a few minutes instead
            of a few weeks. Nothing silently fabricated ; every number carries
            a footnote.
          </p>
        </div>

        <ol className="col-span-12 lg:col-span-8 divide-y divide-hairline">
          {SURFACES.map((step, idx) => (
            <motion.li
              key={step.n}
              initial={{ opacity: 0, y: 4 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: idx * 0.06, ease: [0.22, 1, 0.36, 1] }}
              className="group flex items-start gap-8 py-8 transition-colors duration-300 ease-out-gentle hover:bg-mist-50/40"
            >
              <span
                className="mt-1 font-display text-[13px] tracking-[0.25em] text-ink-muted"
                style={{ fontVariationSettings: '"opsz" 14, "wght" 420' }}
              >
                {step.n}
              </span>
              <div className="flex-1">
                <div className="flex items-baseline justify-between gap-4">
                  <h3
                    className="font-display text-[32px] leading-none text-ink transition-transform duration-300 ease-out-gentle group-hover:translate-x-1"
                    style={{ fontVariationSettings: '"opsz" 48, "wght" 520, "SOFT" 100' }}
                  >
                    {step.title}
                  </h3>
                  <span className="font-mono text-[11px] uppercase tracking-label text-ink-muted">
                    {step.eta}
                  </span>
                </div>
                <p className="mt-3 max-w-lg font-sans text-[14.5px] leading-relaxed text-ink-soft">
                  {step.description}
                </p>
                <Link
                  to={step.to}
                  className="mt-4 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-label text-forest transition-colors hover:text-forest-dark"
                >
                  Open <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </motion.li>
          ))}
        </ol>
      </section>

      {/* Editorial image + quote */}
      <section className="relative grid grid-cols-12 gap-8">
        <figure className="col-span-12 lg:col-span-7">
          <img
            src={SECOND_IMG}
            alt="Warm timber office — workstations by the north façade"
            className="aspect-[5/4] w-full rounded-lg object-cover"
            style={{ filter: "grayscale(1) contrast(1.04) brightness(0.96)" }}
            loading="lazy"
          />
          <figcaption className="mt-3 font-mono text-[10px] uppercase tracking-label text-ink-muted">
            Atelier variant · desks along the north façade · Opus 4.7 + SketchUp MCP
          </figcaption>
        </figure>
        <blockquote className="col-span-12 self-center lg:col-span-5">
          <p className="eyebrow-forest">Atelier doctrine</p>
          <p
            className="mt-6 font-display text-[40px] leading-[1.08] tracking-[-0.02em] text-ink md:text-[52px]"
            style={{ fontVariationSettings: '"opsz" 96, "wght" 460, "SOFT" 100' }}
          >
            <span className="italic">&ldquo;</span>Give the office back what
            home can't — collaboration, rituals, a café that brings people
            together<span className="italic">&rdquo;</span>
          </p>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-label text-ink-muted">
            Excerpt from the Lumen argumentaire · Opus 4.7 consolidator
          </p>
        </blockquote>
      </section>

      {/* Sources marquee */}
      <section>
        <div className="flex items-end justify-between">
          <div>
            <p className="eyebrow-forest">Cited, not invented</p>
            <h2
              className="mt-4 font-display text-[44px] leading-[1.02] tracking-[-0.02em] text-ink md:text-[56px]"
              style={{ fontVariationSettings: '"opsz" 80, "wght" 540, "SOFT" 100' }}
            >
              Every number
              <br />
              <span className="italic" style={{ fontVariationSettings: '"opsz" 80, "wght" 440, "SOFT" 100' }}>
                footnoted.
              </span>
            </h2>
          </div>
          <p className="hidden max-w-sm font-sans text-[14px] leading-relaxed text-ink-soft md:block">
            Anything we could not verify at time of writing carries a{" "}
            <code className="rounded bg-mist-100 px-1 py-0.5 font-mono text-[11px]">[À VÉRIFIER]</code>{" "}
            marker — not a fabrication.
          </p>
        </div>
        <div className="relative mt-10 overflow-hidden border-y border-hairline py-5">
          <div className="flex animate-marquee whitespace-nowrap">
            {[...SOURCES, ...SOURCES].map((src, i) => (
              <span
                key={`${src}-${i}`}
                className="mx-8 inline-block font-mono text-[11px] uppercase tracking-label text-ink-soft"
              >
                <span className="mr-3 text-forest">§</span>
                {src}
              </span>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-canvas to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-canvas to-transparent" />
        </div>
      </section>

      {/* CTA close */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-2xl border border-hairline bg-raised p-12 md:p-20"
      >
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-forest/6 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-sand/20 blur-3xl" />
        <div className="relative grid grid-cols-12 gap-8">
          <div className="col-span-12 lg:col-span-8">
            <p className="eyebrow-forest">Hackathon build · Built with Opus 4.7</p>
            <h2
              className="mt-5 font-display text-[44px] leading-[1.03] tracking-[-0.02em] text-ink md:text-[60px]"
              style={{ fontVariationSettings: '"opsz" 96, "wght" 540, "SOFT" 100' }}
            >
              Try it on Lumen —
              <br />
              <span className="italic" style={{ fontVariationSettings: '"opsz" 96, "wght" 430, "SOFT" 100' }}>
                the reference brief ships with the repo.
              </span>
            </h2>
          </div>
          <div className="col-span-12 flex flex-wrap items-end gap-3 lg:col-span-4 lg:justify-end">
            <Link to="/brief" className="btn-primary">
              Start a project
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link to="/testfit" className="btn-ghost">
              Open the Test Fit
            </Link>
          </div>
        </div>
      </motion.section>
    </div>
  );
}

function Metric({ n, suffix, label }: { n: string; suffix: string; label: string }) {
  return (
    <div className="flex flex-col justify-between gap-6 bg-canvas p-8">
      <p className="font-mono text-[10px] uppercase tracking-label text-ink-muted">{label}</p>
      <p
        className="font-display text-[52px] leading-none tracking-[-0.025em] text-ink md:text-[68px]"
        style={{ fontVariationSettings: '"opsz" 120, "wght" 560, "SOFT" 100' }}
      >
        {n}
        <span className="ml-2 font-mono text-[11px] align-top uppercase tracking-label text-forest">
          {suffix}
        </span>
      </p>
    </div>
  );
}
