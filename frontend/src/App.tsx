import { NavLink, Outlet } from "react-router-dom";

import ChatDrawer from "./components/chat/ChatDrawer";
import IntegrationBadge from "./components/ui/IntegrationBadge";

const NAV = [
  { to: "/brief", label: "Brief" },
  { to: "/testfit", label: "Test Fit" },
  { to: "/justify", label: "Justify" },
  { to: "/export", label: "Export" },
];

export default function App() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-hairline/60 bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-10">
          <NavLink
            to="/"
            className="group flex items-baseline gap-2.5 font-display text-[1.375rem] leading-none text-ink transition-colors hover:text-forest"
            style={{ fontVariationSettings: '"opsz" 72, "wght" 520, "SOFT" 100' }}
          >
            <span className="inline-block h-[7px] w-[7px] translate-y-[-3px] rounded-full bg-forest transition-transform duration-300 ease-out-gentle group-hover:scale-125" />
            <span>Design&nbsp;Office</span>
          </NavLink>
          <div className="flex items-center gap-10">
            <nav className="flex items-center gap-6">
              {NAV.map((item) => (
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
            <IntegrationBadge />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-10 pb-28 pt-12 animate-fade-rise">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-[1440px] border-t border-hairline/60 px-10 py-6">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
            Built with Opus 4.7 · MIT License · Hackathon 2026
          </p>
          <p className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
            Lumen · 170 FTE · 2 400 m²
          </p>
        </div>
      </footer>

      <ChatDrawer />
    </div>
  );
}
