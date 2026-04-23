import { useNavigate } from "react-router-dom";

import { Eyebrow, Icon, Placeholder } from "../components/ui";

/**
 * Landing — Claude Design bundle parity (iter-18e).
 *
 * Hero split + metric strip + editorial surfaces grid + pull quote
 * + sources marquee + footer. Own marketing-style nav (distinct
 * from the product GlobalNav, which App.tsx hides on `/`).
 */
export default function Landing() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-canvas">
      {/* Landing-specific nav */}
      <nav
        className="sticky top-0 z-20 flex items-center justify-between border-b border-mist-100 px-16 py-5 backdrop-blur"
        style={{ background: "rgba(250, 247, 242, 0.85)" }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="inline-block h-2.5 w-2.5"
            style={{
              background: "var(--forest)",
              borderRadius: 2,
              transform: "rotate(45deg)",
            }}
          />
          <span
            className="font-display text-[20px] font-medium leading-none tracking-[-0.01em] text-ink"
            style={{ fontVariationSettings: '"opsz" 96, "wght" 500, "SOFT" 100' }}
          >
            Design Office
          </span>
        </div>
        <div className="flex items-center gap-7">
          {[
            { label: "Surfaces", target: "surfaces" },
            { label: "Method", target: "method" },
            { label: "Journal", target: "journal" },
          ].map((a) => (
            <a
              key={a.target}
              href={`#${a.target}`}
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById(a.target)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="mono text-[11px] uppercase tracking-[0.08em] text-ink transition-colors hover:text-forest"
            >
              {a.label}
            </a>
          ))}
          <button
            onClick={() => navigate("/project")}
            className="btn-primary btn-sm"
          >
            Sign in
          </button>
        </div>
      </nav>

      {/* Hero split */}
      <section
        className="grid items-center gap-[72px] px-16 pb-[60px] pt-[80px]"
        style={{
          gridTemplateColumns: "1.05fr 0.95fr",
          minHeight: "calc(100vh - 74px)",
        }}
      >
        <div className="animate-fade-rise">
          <Eyebrow style={{ marginBottom: 28 }}>
            AI CO-ARCHITECT FOR INTERIOR DESIGNERS
          </Eyebrow>
          <h1
            className="m-0 mb-[18px] font-display italic"
            style={{
              fontSize: "clamp(52px, 9vw, 112px)",
              lineHeight: 1.02,
              letterSpacing: "-0.02em",
              fontVariationSettings: '"opsz" 144, "wght" 600, "SOFT" 100',
            }}
          >
            Design
            <br />
            Office.
          </h1>
          <p
            className="m-0 mb-11 font-display"
            style={{
              fontSize: "clamp(22px, 2.5vw, 34px)",
              color: "var(--mist-600)",
              lineHeight: 1.3,
              maxWidth: 640,
              fontVariationSettings: '"opsz" 96, "wght" 350, "SOFT" 100',
            }}
          >
            Augment your test-fit, mood board, <br />
            and client presentation.
          </p>
          <div className="mb-16 flex gap-3.5">
            <button
              onClick={() => navigate("/project?new=1")}
              className="btn-primary"
              style={{ padding: "16px 28px", fontSize: 15 }}
            >
              Start a project <Icon name="arrow-right" size={14} />
            </button>
            <button
              onClick={() => navigate("/project")}
              className="btn-ghost"
              style={{ padding: "16px 28px", fontSize: 15 }}
            >
              <Icon name="play" size={12} /> Watch the demo
            </button>
          </div>
          <div className="mono text-mist-500">
            <span style={{ color: "var(--forest)" }}>●</span> 2026 · Opus 4.7 · Paris
          </div>
        </div>

        <div className="relative">
          <Placeholder
            tag="ARCHITECTURAL CORRIDOR · SUNLIT · 4:5"
            ratio="4/5"
            tint="#3C5D50"
            style={{ boxShadow: "var(--sh-hero)" }}
          />
          <div
            className="absolute bottom-[-18px] left-[-18px] flex flex-col gap-0.5 bg-canvas"
            style={{
              padding: "14px 18px",
              border: "1px solid var(--mist-200)",
              borderRadius: 8,
              boxShadow: "var(--sh-soft)",
            }}
          >
            <span className="mono text-mist-500">LUMEN · PARIS 9E</span>
            <span
              className="font-display italic"
              style={{ fontVariationSettings: '"opsz" 72, "wght" 380, "SOFT" 100' }}
            >
              2400 m² · 170 FTE
            </span>
          </div>
        </div>
      </section>

      {/* Metric strip */}
      <section
        className="grid border-y border-mist-200"
        style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
      >
        {[
          ["10×", "FASTER TEST-FIT"],
          ["3", "INDUSTRIES PROVEN"],
          ["6", "EDITORIAL SURFACES"],
          ["0", "ENGINEERING REWRITE"],
        ].map(([num, label], i) => (
          <div
            key={i}
            className="flex flex-col gap-2 px-8 py-11"
            style={{
              borderRight: i < 3 ? "1px solid var(--mist-200)" : "none",
            }}
          >
            <div
              className="font-display"
              style={{
                fontSize: 56,
                fontWeight: 300,
                letterSpacing: "-0.03em",
                fontVariationSettings: '"opsz" 144, "wght" 300, "SOFT" 100',
              }}
            >
              {num}
            </div>
            <div className="mono text-mist-500">{label}</div>
          </div>
        ))}
      </section>

      {/* Surfaces I–VI asymmetric editorial grid */}
      <section id="surfaces" className="px-16 py-[120px]" style={{ scrollMarginTop: 80 }}>
        <div
          className="mb-[72px] grid gap-[80px]"
          style={{ gridTemplateColumns: "1fr 2fr" }}
        >
          <div>
            <Eyebrow style={{ marginBottom: 18 }}>SURFACES · I — VI</Eyebrow>
            <h2
              className="m-0 font-display"
              style={{
                fontSize: 44,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                fontVariationSettings: '"opsz" 96, "wght" 500, "SOFT" 100',
              }}
            >
              Six editorial surfaces, one continuous handoff.
            </h2>
          </div>
          <p
            className="pt-5 font-display"
            style={{
              fontSize: 22,
              color: "var(--mist-600)",
              lineHeight: 1.45,
              fontVariationSettings: '"opsz" 72, "wght" 380, "SOFT" 100',
            }}
          >
            Each surface is a chapter — briefed, visualized, sourced. The tool
            moves at the speed of your taste, not the speed of a form.
          </p>
        </div>

        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(12, 1fr)",
            rowGap: 56,
            columnGap: 32,
          }}
        >
          {[
            { r: "I", t: "Brief", d: "Natural-language ingestion, Leesman-calibrated programme.", span: 5, offset: 0 },
            { r: "II", t: "Test fit", d: "Three concepts, macro and micro zoning in 2D and 3D.", span: 5, offset: 2 },
            { r: "III", t: "Mood board", d: "Editorial collage of materials, furniture, light.", span: 4, offset: 1 },
            { r: "IV", t: "Justify", d: "Sourced argumentaire, toggled Engineering ↔ Client.", span: 5, offset: 2 },
            { r: "V", t: "Export", d: "DXF and DWG, five named layers, zero rewrite.", span: 4, offset: 0 },
            { r: "VI", t: "Chat", d: "A co-architect in the corner of every page.", span: 4, offset: 4 },
          ].map((s) => (
            <div
              key={s.r}
              style={{ gridColumn: `${s.offset + 1} / span ${s.span}` }}
            >
              <div className="mb-3.5 flex items-baseline gap-[18px]">
                <span
                  className="font-display italic"
                  style={{
                    fontSize: 28,
                    color: "var(--sand)",
                    fontVariationSettings: '"opsz" 96, "wght" 400, "SOFT" 100',
                  }}
                >
                  {s.r}.
                </span>
                <span
                  className="font-display"
                  style={{
                    fontSize: 32,
                    fontWeight: 400,
                    letterSpacing: "-0.01em",
                    fontVariationSettings: '"opsz" 96, "wght" 420, "SOFT" 100',
                  }}
                >
                  {s.t}
                </span>
              </div>
              <p className="m-0 text-mist-600" style={{ maxWidth: 380 }}>
                {s.d}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pull quote */}
      <section
        id="method"
        className="border-y border-mist-200 px-16 py-20"
        style={{ background: "var(--canvas-alt)", scrollMarginTop: 80 }}
      >
        <blockquote
          className="m-0 font-display italic"
          style={{
            fontSize: "clamp(32px, 4.2vw, 60px)",
            fontWeight: 300,
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            maxWidth: 1200,
            fontVariationSettings: '"opsz" 144, "wght" 300, "SOFT" 100',
          }}
        >
          "From brief to client deck, <br />
          in one continuous editorial."
        </blockquote>
        <div className="mt-8 mono text-mist-500">
          — DESIGN OFFICE · MANIFESTO
        </div>
      </section>

      {/* Sources marquee */}
      <section
        id="journal"
        className="overflow-hidden"
        style={{ padding: "60px 0", scrollMarginTop: 80 }}
      >
        <div className="mono mb-6 px-16 text-mist-500">
          SOURCES · WORKPLACE RESEARCH &amp; MANUFACTURERS
        </div>
        <div
          className="flex flex-wrap gap-[72px] px-16"
          style={{
            fontFamily: "var(--f-display)",
            fontSize: 32,
            fontStyle: "italic",
            color: "var(--mist-400)",
          }}
        >
          {[
            "Leesman",
            "Gensler",
            "Steelcase",
            "Herman Miller",
            "Vitra",
            "Framery",
            "Kvadrat",
          ].map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="flex items-center justify-between border-t border-mist-200 px-16 py-12">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-block h-2 w-2"
            style={{
              background: "var(--forest)",
              borderRadius: 2,
              transform: "rotate(45deg)",
            }}
          />
          <span className="mono text-mist-500">
            © 2026 DESIGN OFFICE · PARIS
          </span>
        </div>
        <div className="mono flex gap-6 text-mist-500">
          <a
            href="https://github.com/anthropics/design-office"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-forest"
          >
            GITHUB
          </a>
          <a
            href="#journal"
            onClick={(e) => {
              e.preventDefault();
              document
                .getElementById("journal")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="transition-colors hover:text-forest"
          >
            JOURNAL
          </a>
          <span>BUILT WITH OPUS 4.7</span>
        </div>
      </footer>
    </div>
  );
}
