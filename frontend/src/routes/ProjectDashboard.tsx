/**
 * ProjectDashboard — iter-18f stub.
 *
 * The full projects-list → project-detail drill-down lives in iter-18f.
 * This stub seeds the `/project` route so the GlobalNav + router
 * surface it immediately, and renders a minimal "coming next" panel
 * in the meantime (never shipped to production — iter-18f replaces
 * this entire file).
 */

import { useNavigate } from "react-router-dom";

import { Eyebrow } from "../components/ui";
import { loadProjectsIndex } from "../lib/adapters/projectsIndex";

export default function ProjectDashboard() {
  const projects = loadProjectsIndex();
  const navigate = useNavigate();

  return (
    <div className="space-y-10">
      <header>
        <Eyebrow>DASHBOARD · PROJECTS</Eyebrow>
        <h1
          className="mt-3 font-display text-[56px] leading-[1.02] italic tracking-[-0.02em] text-ink"
          style={{ fontVariationSettings: '"opsz" 144, "wght" 600, "SOFT" 100' }}
        >
          Your studio, at a glance.
        </h1>
        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-mist-600">
          {projects.length} active projects — from first brief to
          engineering handoff. The full grid + drill-down ships in
          iter-18f ; this stub lets you jump straight into any surface
          for the active project.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => navigate("/brief")}
            className="card text-left"
            style={{ borderColor: p.isActive ? "var(--forest)" : undefined }}
          >
            <div
              className="-mx-6 -mt-6 mb-4 h-20 rounded-t-lg"
              style={{
                background: `linear-gradient(135deg, ${p.tint}22 0%, ${p.tint}44 100%), repeating-linear-gradient(135deg, rgba(28,31,26,0.04) 0 10px, transparent 10px 20px)`,
              }}
            />
            <p className="font-mono text-[10px] uppercase tracking-label text-mist-500">
              {p.ref}
            </p>
            <h3
              className="mt-1 font-display text-[22px] leading-snug text-ink"
              style={{
                fontVariationSettings: '"opsz" 72, "wght" 500, "SOFT" 100',
              }}
            >
              {p.name}
            </h3>
            <p className="mt-0.5 text-[13px] text-mist-600">
              <span className="italic">
                {p.industry.replace("_", " ")}
              </span>{" "}
              · {p.headcount} → {p.headcountTarget} FTE
            </p>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-label text-forest">
              STAGE · {p.stage}
            </p>
          </button>
        ))}
      </section>
    </div>
  );
}
