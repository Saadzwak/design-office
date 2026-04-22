import { NavLink, Outlet } from "react-router-dom";

const NAV = [
  { to: "/brief", label: "Brief" },
  { to: "/testfit", label: "Test Fit" },
  { to: "/justify", label: "Justify" },
  { to: "/export", label: "Export" },
];

export default function App() {
  return (
    <div className="min-h-screen bg-ink text-bone-text">
      <header className="sticky top-0 z-20 border-b border-neutral-500/20 bg-ink/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <NavLink to="/" className="flex items-center gap-2 font-serif text-lg">
            <span className="inline-block h-2 w-2 rounded-full bg-terracotta" />
            Design Office
          </NavLink>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    "rounded-lg px-3 py-1.5 text-sm transition-colors duration-200 ease-out-expo",
                    isActive
                      ? "bg-neutral-700/50 text-bone-text"
                      : "text-neutral-300 hover:bg-neutral-700/30 hover:text-bone-text",
                  ].join(" ")
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-7xl px-6 pb-10 pt-16">
        <p className="font-mono text-xs text-neutral-400">
          Built with Opus 4.7 · MIT License · Hackathon 2026
        </p>
      </footer>
    </div>
  );
}
