import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

import ChatDrawer from "./components/chat/ChatDrawer";
import Icon from "./components/ui/Icon";
import IntegrationBadge from "./components/ui/IntegrationBadge";
import ViewModeToggle from "./components/ui/ViewModeToggle";
import { useProjectState } from "./hooks/useProjectState";
import {
  getActiveProject,
  loadProjectsIndex,
  onProjectsIndexChange,
  type ProjectSummary,
} from "./lib/adapters/projectsIndex";

/**
 * Routes are ordered for the GlobalNav. Each carries a roman-numeral
 * eyebrow + a label. The bundle hides `/` (landing) and `/chat`
 * (fullpage) from the nav itself — they still render as the <Outlet/>
 * below, just without the top chrome.
 */
const ROUTES = [
  { to: "/project", label: "Dashboard", eyebrow: "HOME" },
  { to: "/brief", label: "Brief", eyebrow: "I" },
  { to: "/testfit", label: "Test fit", eyebrow: "II" },
  { to: "/moodboard", label: "Mood", eyebrow: "III" },
  { to: "/justify", label: "Justify", eyebrow: "IV" },
  { to: "/export", label: "Export", eyebrow: "V" },
  { to: "/chat", label: "Chat", eyebrow: "VI" },
];

// Engineering-only client-variant relabelling happens at each screen
// via `view_mode`. The top nav keeps a stable spatial vocabulary so
// users don't lose their bearings when switching views.

function useActiveProject(): ProjectSummary | null {
  const [active, setActive] = useState<ProjectSummary | null>(() => {
    try {
      return getActiveProject();
    } catch {
      return null;
    }
  });

  useEffect(() => {
    // Keep the nav in sync when the dashboard flips the active project.
    const unsub = onProjectsIndexChange((projects) => {
      setActive(projects.find((p) => p.isActive) ?? projects[0] ?? null);
    });
    // Re-seed on mount in case localStorage was only populated after
    // our first render (SSR-style hydration skew).
    try {
      const all = loadProjectsIndex();
      setActive(all.find((p) => p.isActive) ?? all[0] ?? null);
    } catch {
      /* ignore */
    }
    return unsub;
  }, []);

  return active;
}

export default function App() {
  const project = useProjectState();
  const location = useLocation();
  const navigate = useNavigate();
  const activeProject = useActiveProject();
  const [chatOpen, setChatOpen] = useState(false);

  // Landing is the only page without the nav/footer shell. Chat
  // fullpage is also chrome-less per the bundle. Both still go
  // through the router, just bypassing the chrome.
  const path = location.pathname;
  const isLanding = path === "/";
  const isChat = path === "/chat";
  const showShell = !isLanding && !isChat;
  const showFloatingChat = !isChat;

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {showShell && (
        <GlobalNav
          active={activeProject}
          projectName={project.client.name}
          headcount={project.programme.headcount}
          growthTarget={project.programme.growth_target}
        />
      )}

      <main
        className={
          showShell
            ? "mx-auto max-w-[1440px] px-6 pb-28 pt-8 animate-fade-rise md:px-12"
            : "animate-fade-rise"
        }
      >
        <Outlet />
      </main>

      {showShell && (
        <footer className="mx-auto max-w-[1440px] border-t border-mist-200 px-6 py-6 md:px-12">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-label text-mist-500">
              Built with Opus 4.7 · MIT License · Hackathon 2026
            </p>
            <p className="font-mono text-[10px] uppercase tracking-label text-mist-500">
              {activeProject?.name ?? project.client.name ?? "Untitled"}
              {activeProject?.ref ? ` · ${activeProject.ref}` : ""}
            </p>
          </div>
        </footer>
      )}

      {/* Floating chat trigger — hidden on /chat (fullpage lives there).
          The drawer body itself is managed by ChatDrawer. */}
      {showFloatingChat && (
        <button
          onClick={() => setChatOpen(true)}
          title="Open co-architect"
          className="fixed bottom-7 right-7 z-[70] flex h-14 w-14 items-center justify-center rounded-full animate-soft-breathe"
          style={{
            background: "var(--forest)",
            color: "var(--canvas)",
            boxShadow: "0 8px 24px rgba(47, 74, 63, 0.35)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
          }}
          aria-label="Open chat drawer"
        >
          <Icon name="messages-square" size={20} />
        </button>
      )}

      {/* Pass the open-state to ChatDrawer. ChatDrawer internally renders
          a bottom-right trigger when controlled=false ; we're controlling
          it here so pass through. */}
      <ChatDrawer
        open={chatOpen}
        onOpenChange={setChatOpen}
        onExpand={() => {
          setChatOpen(false);
          navigate("/chat");
        }}
      />
    </div>
  );
}

function GlobalNav({
  active,
  projectName,
  headcount,
  growthTarget,
}: {
  active: ProjectSummary | null;
  projectName: string | null;
  headcount: number | null;
  growthTarget: number | null;
}) {
  const primaryLabel = active?.name ?? projectName ?? "New project";
  const secondary =
    active?.ref ??
    (headcount && growthTarget ? `${headcount} → ${growthTarget} FTE` : null);

  return (
    <nav
      className="sticky top-0 z-30 border-b border-mist-200 backdrop-blur"
      style={{
        background: "rgba(250, 247, 242, 0.88)",
      }}
    >
      <div className="mx-auto flex max-w-[1440px] items-center gap-6 px-6 py-3.5 md:px-12">
        {/* Logo */}
        <NavLink
          to="/"
          className="flex items-center gap-2"
          aria-label="Back to landing"
        >
          <span
            className="inline-block h-2.5 w-2.5"
            style={{
              background: "var(--forest)",
              borderRadius: 2,
              transform: "rotate(45deg)",
            }}
          />
          <span
            className="font-display text-[17px] font-medium leading-none text-ink"
            style={{ fontVariationSettings: '"opsz" 72, "wght" 500, "SOFT" 100' }}
          >
            Design Office
          </span>
        </NavLink>

        <span
          aria-hidden
          className="hidden h-5 w-px bg-mist-200 md:inline-block"
        />

        {/* Main nav — horizontal segmented links with roman eyebrow */}
        <div className="hidden flex-1 items-center gap-0.5 md:flex">
          {ROUTES.map((r) => (
            <NavLink
              key={r.to}
              to={r.to}
              className={({ isActive }) =>
                [
                  "inline-flex items-center gap-2 rounded-md px-3 py-[7px] text-[13px] transition-colors duration-200 ease-out-gentle",
                  isActive
                    ? "bg-forest-ghost text-forest font-medium"
                    : "text-ink hover:bg-mist-50",
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`mono min-w-[18px] text-right ${isActive ? "text-forest" : "text-mist-400"}`}
                    style={{ fontSize: 10 }}
                  >
                    {r.eyebrow}
                  </span>
                  <span>{r.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Right side — active project + view toggle + integrations */}
        <div className="ml-auto hidden items-center gap-3 md:flex">
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-mono text-[10px] uppercase tracking-label text-mist-500">
              {primaryLabel.toUpperCase()}
            </span>
            {secondary && (
              <span className="font-mono text-[10px] tracking-wide text-mist-400">
                {secondary}
              </span>
            )}
          </div>
          <ViewModeToggle size="sm" />
          <div className="hidden lg:block">
            <IntegrationBadge />
          </div>
        </div>

        {/* Mobile shortcut — dashboard button only */}
        <NavLink
          to="/project"
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-forest px-3 py-2 text-xs text-canvas md:hidden"
        >
          <Icon name="layout-grid" size={12} />
          Projects
        </NavLink>
      </div>
    </nav>
  );
}
