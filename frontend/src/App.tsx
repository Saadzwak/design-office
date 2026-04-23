import { NavLink, Outlet } from "react-router-dom";

import ChatDrawer from "./components/chat/ChatDrawer";
import IntegrationBadge from "./components/ui/IntegrationBadge";
import ViewModeToggle from "./components/ui/ViewModeToggle";
import { useProjectState } from "./hooks/useProjectState";

const NAV_ENGINEERING = [
  { to: "/brief", label: "Brief" },
  { to: "/testfit", label: "Test Fit" },
  { to: "/moodboard", label: "Mood Board" },
  { to: "/justify", label: "Justify" },
  { to: "/export", label: "Export" },
];

const NAV_CLIENT = [
  { to: "/brief", label: "Brief" },
  { to: "/moodboard", label: "Mood Board" },
  { to: "/testfit", label: "Concept" },
  { to: "/justify", label: "Story" },
];

export default function App() {
  const project = useProjectState();
  const nav = project.view_mode === "client" ? NAV_CLIENT : NAV_ENGINEERING;
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-hairline/60 bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 md:px-10">
          <NavLink
            to="/"
            className="group flex items-baseline gap-2.5 font-display text-[1.125rem] leading-none text-ink transition-colors hover:text-forest md:text-[1.375rem]"
            style={{ fontVariationSettings: '"opsz" 72, "wght" 520, "SOFT" 100' }}
          >
            <span className="inline-block h-[7px] w-[7px] translate-y-[-3px] rounded-full bg-forest transition-transform duration-300 ease-out-gentle group-hover:scale-125" />
            <span>Design&nbsp;Office</span>
          </NavLink>
          <div className="flex items-center gap-3 md:gap-8">
            {/* Main nav hidden below lg — mobile users navigate via the
                chat drawer's action dispatch or the content-embedded
                links. Desktop-priority per the product brief. */}
            <nav className="hidden items-center gap-5 lg:flex">
              {nav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      "relative py-1 font-sans text-[13px] tracking-tight transition-colors duration-200 ease-out-gentle",
                      isActive ? "text-ink" : "text-ink-muted hover:text-ink",
                    ].join(" ")
                  }
                >
                  {({ isActive }) => (
                    <>
                      {item.label}
                      {isActive && (
                        <span className="absolute -bottom-[22px] left-0 right-0 h-[1.5px] bg-forest" />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
            <ViewModeToggle />
            <div className="hidden md:block">
              <IntegrationBadge />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 pb-28 pt-8 animate-fade-rise md:px-10 md:pt-12">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-[1440px] border-t border-hairline/60 px-4 py-6 md:px-10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
            Built with Opus 4.7 · MIT License · Hackathon 2026
          </p>
          <p className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
            {project.client.name || "Untitled"} ·{" "}
            {project.programme.growth_target ?? "—"} FTE horizon
          </p>
        </div>
      </footer>

      <ChatDrawer />
    </div>
  );
}
