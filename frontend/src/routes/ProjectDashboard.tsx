import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  Card,
  Eyebrow,
  Icon,
  Pill,
  PillToggle,
} from "../components/ui";
import { useProjectState } from "../hooks/useProjectState";
import { setViewMode, type ViewMode } from "../lib/projectState";
import {
  loadProjectsIndex,
  onProjectsIndexChange,
  setActiveProject,
  type ProjectSummary,
  type SurfaceKey,
  type SurfaceState,
  type SurfaceSummary,
} from "../lib/adapters/projectsIndex";

const SURFACES: Array<{
  key: SurfaceKey;
  roman: string;
  label: string;
  icon: string;
  route: string;
}> = [
  { key: "brief", roman: "I", label: "Brief", icon: "file-text", route: "/brief" },
  { key: "testfit", roman: "II", label: "Test fit", icon: "layout-grid", route: "/testfit" },
  { key: "moodboard", roman: "III", label: "Mood board", icon: "feather", route: "/moodboard" },
  { key: "justify", roman: "IV", label: "Justify", icon: "messages-square", route: "/justify" },
  { key: "export", roman: "V", label: "Export", icon: "download", route: "/export" },
];

const STATE_COLOR: Record<SurfaceState, { dot: string; label: string }> = {
  done: { dot: "var(--mint)", label: "Complete" },
  active: { dot: "var(--forest)", label: "In progress" },
  draft: { dot: "var(--sun)", label: "Draft" },
  pending: { dot: "var(--mist-300)", label: "Not started" },
};

export default function ProjectDashboard() {
  const [projects, setProjects] = useState<ProjectSummary[]>(() =>
    loadProjectsIndex(),
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    const unsub = onProjectsIndexChange(setProjects);
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      const q = query.trim().toLowerCase();
      const qMatch =
        !q ||
        (p.name + " " + p.industry + " " + p.client).toLowerCase().includes(q);
      const fMatch =
        filter === "all" || p.stage.toLowerCase() === filter.toLowerCase();
      return qMatch && fMatch;
    });
  }, [projects, query, filter]);

  const opened = openId
    ? projects.find((p) => p.id === openId) ?? null
    : null;

  return (
    <div className="space-y-10">
      {opened ? (
        <ProjectDetail project={opened} onBack={() => setOpenId(null)} />
      ) : (
        <ProjectsList
          projects={filtered}
          totalProjects={projects.length}
          query={query}
          setQuery={setQuery}
          filter={filter}
          setFilter={setFilter}
          onOpen={(id) => {
            setOpenId(id);
            setActiveProject(id);
          }}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────── ProjectsList ──────

function ProjectsList({
  projects,
  totalProjects,
  query,
  setQuery,
  filter,
  setFilter,
  onOpen,
}: {
  projects: ProjectSummary[];
  totalProjects: number;
  query: string;
  setQuery: (q: string) => void;
  filter: string;
  setFilter: (f: string) => void;
  onOpen: (id: string) => void;
}) {
  const filters = ["all", "Brief", "Test fit", "Justify", "Export"];

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow style={{ marginBottom: 10 }}>DASHBOARD · PROJECTS</Eyebrow>
          <h1
            className="m-0 font-display italic"
            style={{
              fontSize: 64,
              letterSpacing: "-0.02em",
              lineHeight: 1.02,
              fontVariationSettings: '"opsz" 144, "wght" 600, "SOFT" 100',
            }}
          >
            Your studio, at a glance.
          </h1>
          <p
            className="mt-2.5 font-display"
            style={{
              fontSize: 20,
              color: "var(--mist-600)",
              maxWidth: 620,
              fontVariationSettings: '"opsz" 72, "wght" 380, "SOFT" 100',
            }}
          >
            {totalProjects} active{" "}
            {totalProjects === 1 ? "project" : "projects"} — from first brief
            to engineering handoff.
          </p>
        </div>
        <button className="btn-primary">
          <Icon name="plus" size={14} /> New project
        </button>
      </header>

      {/* Filter bar */}
      <div
        className="flex items-center gap-3.5 border border-mist-200 px-[18px] py-3"
        style={{
          background: "var(--canvas-alt)",
          borderRadius: 10,
        }}
      >
        <Icon name="search" size={14} style={{ color: "var(--mist-500)" }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects, clients, industries…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-mist-400"
        />
        <span className="h-5 w-px bg-mist-200" aria-hidden />
        <div className="flex gap-1.5">
          {filters.map((f) => {
            const active =
              filter === (f === "all" ? "all" : f.toLowerCase());
            return (
              <Pill
                key={f}
                variant={active ? "active" : "ghost"}
                className="!text-[11px]"
                onClick={() => setFilter(f === "all" ? "all" : f.toLowerCase())}
              >
                {f === "all" ? "All stages" : f}
              </Pill>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}
      >
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} onOpen={() => onOpen(p.id)} />
        ))}
        {projects.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-mist-300 p-12 text-center text-mist-500">
            No projects match your search.
          </div>
        )}
      </div>
    </>
  );
}

function ProjectCard({
  project,
  onOpen,
}: {
  project: ProjectSummary;
  onOpen: () => void;
}) {
  const complete = Object.values(project.surfaces).filter(
    (s) => s.state === "done",
  ).length;
  const total = SURFACES.length;

  return (
    <Card noPadding as="button" onClick={onOpen} className="overflow-hidden">
      {/* Tinted banner */}
      <div
        className="relative flex h-[132px] items-end p-[18px]"
        style={{
          background: `linear-gradient(135deg, ${project.tint}22 0%, ${project.tint}44 100%), repeating-linear-gradient(135deg, rgba(28,31,26,0.04) 0 10px, transparent 10px 20px)`,
        }}
      >
        <div className="absolute left-3.5 top-3.5 font-mono text-[11px] uppercase tracking-[0.1em]"
          style={{ color: project.tint, fontWeight: 600 }}>
          {project.ref}
        </div>
        <div className="absolute right-3.5 top-3.5">
          <span
            className="pill"
            style={{
              background: "rgba(255, 253, 249, 0.9)",
              fontSize: 10,
              padding: "4px 10px",
            }}
          >
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: project.tint }}
            />
            {project.stage}
          </span>
        </div>
      </div>

      <div className="p-5">
        <div className="mb-1.5 flex items-baseline justify-between">
          <h3
            className="m-0 font-display"
            style={{
              fontSize: 26,
              fontWeight: 400,
              letterSpacing: "-0.01em",
              fontVariationSettings: '"opsz" 96, "wght" 460, "SOFT" 100',
            }}
          >
            {project.name}
          </h3>
          <span className="mono text-[10px] text-mist-500">
            {complete}/{total}
          </span>
        </div>
        <div className="mb-3.5 text-[13px] text-mist-600">
          <span className="italic">{industryLabel(project.industry)}</span>
          <span className="text-mist-400"> · </span>
          {project.headcount} → {project.headcountTarget} staff
          <span className="text-mist-400"> · </span>
          {project.surface} m²
        </div>

        <div className="mb-3.5 h-1 overflow-hidden rounded-[2px] bg-mist-100">
          <div
            className="h-full rounded-[2px] transition-all duration-300 ease-out-gentle"
            style={{ width: `${project.progress}%`, background: project.tint }}
          />
        </div>

        <div className="flex gap-1">
          {SURFACES.map((s) => {
            const st = project.surfaces[s.key];
            const c = STATE_COLOR[st.state];
            return (
              <div
                key={s.key}
                title={`${s.label} · ${c.label}`}
                className="flex flex-1 flex-col items-center gap-1 rounded-[4px] p-2"
                style={{
                  background:
                    st.state === "pending"
                      ? "var(--mist-50)"
                      : "var(--canvas-alt)",
                  opacity: st.state === "pending" ? 0.55 : 1,
                }}
              >
                <span className="mono text-[9px] text-mist-500">{s.roman}</span>
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: c.dot }}
                />
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-mist-100 pt-3.5">
          <span className="mono text-[10px] text-mist-500">
            UPDATED · {project.updatedAt.toUpperCase()}
          </span>
          <span className="flex items-center gap-1 text-[12px] text-forest">
            Open <Icon name="arrow-right" size={12} />
          </span>
        </div>
      </div>
    </Card>
  );
}

// ───────────────────────────────────────────── ProjectDetail ──────

function ProjectDetail({
  project,
  onBack,
}: {
  project: ProjectSummary;
  onBack: () => void;
}) {
  const navigate = useNavigate();
  const activeCount = Object.values(project.surfaces).filter(
    (s) => s.state !== "pending",
  ).length;
  const app = useProjectState();

  return (
    <>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-[13px] text-mist-600 hover:text-ink"
      >
        <Icon name="arrow-left" size={14} /> All projects
      </button>

      {/* Hero band */}
      <section
        className="relative mt-6 overflow-hidden rounded-[14px] border border-mist-200 p-8"
        style={{
          background: `linear-gradient(135deg, ${project.tint}18 0%, ${project.tint}08 100%)`,
        }}
      >
        <div className="flex items-start justify-between gap-10">
          <div className="flex-1">
            <Eyebrow style={{ marginBottom: 8 }}>PROJECT · {project.ref}</Eyebrow>
            <h1
              className="m-0 font-display"
              style={{
                fontSize: 48,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                fontVariationSettings: '"opsz" 144, "wght" 450, "SOFT" 100',
              }}
            >
              {project.name}
              <span className="text-mist-400"> · </span>
              <span
                className="italic"
                style={{ fontWeight: 300 }}
              >
                {industryLabel(project.industry)}
              </span>
            </h1>
            <div className="mt-3.5 flex flex-wrap gap-2.5">
              <Pill>
                ● {project.headcount} → {project.headcountTarget} staff
              </Pill>
              <Pill>
                {project.surface} m² · {project.floors}{" "}
                {project.floors === 1 ? "floor" : "floors"}
              </Pill>
              <Pill>{project.location}</Pill>
              <Pill
                variant="active"
                className="!bg-forest-ghost !text-forest"
                style={{
                  background: "var(--forest-ghost)",
                  color: "var(--forest)",
                }}
              >
                Stage · {project.stage}
              </Pill>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2.5">
            <PillToggle<ViewMode>
              options={[
                { value: "engineering", label: "Engineering" },
                { value: "client", label: "Client" },
              ]}
              value={app.view_mode}
              onChange={setViewMode}
            />
            <div className="text-right">
              <div className="mono text-[10px] text-mist-500">
                OVERALL PROGRESS
              </div>
              <div
                className="font-display"
                style={{
                  fontSize: 36,
                  fontWeight: 400,
                  letterSpacing: "-0.02em",
                  color: project.tint,
                  fontVariationSettings: '"opsz" 144, "wght" 450, "SOFT" 100',
                }}
              >
                {project.progress}
                <span className="text-[18px] text-mist-500">%</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Surface grid */}
      <div className="flex items-center justify-between">
        <Eyebrow>
          SURFACES · {activeCount} / {SURFACES.length} ACTIVE
        </Eyebrow>
        <button className="btn-ghost btn-sm">
          <Icon name="plus" size={12} /> New run
        </button>
      </div>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
      >
        {SURFACES.map((s) => {
          const st = project.surfaces[s.key];
          const c = STATE_COLOR[st.state];
          const disabled = st.state === "pending";
          return (
            <Card
              key={s.key}
              as="button"
              onClick={() => !disabled && navigate(s.route)}
              className={
                disabled ? "opacity-60 !cursor-default" : ""
              }
              style={{ minHeight: 180 }}
            >
              <div className="flex h-full flex-col">
                <div className="mb-4 flex items-center justify-between">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg"
                    style={{
                      background: disabled
                        ? "var(--mist-100)"
                        : "var(--forest-ghost)",
                      color: disabled
                        ? "var(--mist-500)"
                        : "var(--forest)",
                    }}
                  >
                    <Icon name={s.icon} size={18} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: c.dot }}
                    />
                    <span className="mono text-[10px] text-mist-500">
                      {c.label.toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="mb-1.5 flex items-baseline gap-2.5">
                  <span
                    className="font-display italic"
                    style={{
                      fontSize: 22,
                      color: "var(--sand)",
                      fontVariationSettings: '"opsz" 72, "wght" 400, "SOFT" 100',
                    }}
                  >
                    {s.roman}.
                  </span>
                  <span
                    className="font-display"
                    style={{
                      fontSize: 26,
                      fontWeight: 400,
                      letterSpacing: "-0.01em",
                      fontVariationSettings: '"opsz" 96, "wght" 440, "SOFT" 100',
                    }}
                  >
                    {s.label}
                  </span>
                </div>
                <p className="m-0 flex-1 text-[13px] leading-relaxed text-mist-600">
                  {st.note}
                </p>
                <div className="mt-4 flex items-center justify-between border-t border-mist-100 pt-3">
                  <span className="mono text-[10px] text-mist-500">
                    {st.updatedAt.toUpperCase()}
                  </span>
                  {!disabled && (
                    <span className="flex items-center gap-1 text-[12px] text-forest">
                      Open <Icon name="chevron-right" size={12} />
                    </span>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Recent activity */}
      <div>
        <Eyebrow style={{ marginTop: 44, marginBottom: 14 }}>
          RECENT ACTIVITY
        </Eyebrow>
        <div
          className="flex flex-col gap-0.5 rounded-[10px] border border-mist-200 p-1.5"
          style={{ background: "var(--canvas-alt)" }}
        >
          {activityFor(project).map((a, i) => (
            <div
              key={i}
              className="grid items-center gap-3.5 rounded-md px-4 py-3"
              style={{ gridTemplateColumns: "140px 140px 1fr auto" }}
            >
              <span className="mono text-[10px] uppercase text-mist-500">
                {a.t.toUpperCase()}
              </span>
              <span className="mono text-[10px] uppercase text-forest">
                {a.kind.toUpperCase()}
              </span>
              <span className="text-[13px]">{a.label}</span>
              <Icon
                name="more-horizontal"
                size={14}
                style={{ color: "var(--mist-400)" }}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ───────────────────────────────────────────── helpers ──────

function industryLabel(key: string): string {
  const map: Record<string, string> = {
    tech_startup: "Tech startup",
    law_firm: "Law firm",
    bank_insurance: "Bank & insurance",
    consulting: "Consulting",
    creative_agency: "Creative agency",
    healthcare: "Healthcare",
    public_sector: "Public sector",
    other: "Other",
  };
  return map[key] ?? key;
}

function activityFor(project: ProjectSummary): Array<{
  t: string;
  kind: string;
  label: string;
}> {
  // Synthesise a plausible 5-entry activity log from the surfaces.
  const entries: Array<{ t: string; kind: string; label: string }> = [];
  const add = (s: SurfaceSummary, kind: string, label: string) => {
    if (s.state === "pending") return;
    entries.push({ t: s.updatedAt, kind, label });
  };
  add(project.surfaces.moodboard, "Mood board", project.surfaces.moodboard.note);
  add(project.surfaces.testfit, "Test fit", project.surfaces.testfit.note);
  add(project.surfaces.justify, "Justify", project.surfaces.justify.note);
  add(project.surfaces.brief, "Brief", project.surfaces.brief.note);
  add(project.surfaces.export, "Export", project.surfaces.export.note);
  return entries.slice(0, 5);
}
