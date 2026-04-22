export default function Justify() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-4xl">Justify</h1>
        <p className="mt-3 max-w-2xl text-neutral-300">
          Every design choice grounded in acoustics, ergonomics, neuroarchitecture, and French
          ERP/PMR regulations — with citations you can click through.
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-neutral-500/20 bg-neutral-800/20 p-6">
          <p className="font-mono text-xs uppercase tracking-widest text-neutral-400">
            Retained variant
          </p>
          <div className="mt-6 grid place-items-center rounded-xl border border-neutral-500/20 bg-neutral-900/40 p-16 text-sm text-neutral-400">
            SketchUp viewer · Phase 4
          </div>
        </div>
        <div className="rounded-2xl border border-neutral-500/20 bg-neutral-800/20 p-6">
          <p className="font-mono text-xs uppercase tracking-widest text-neutral-400">
            Sourced argument
          </p>
          <p className="mt-4 text-sm text-neutral-300">
            The Research & Cite agent will assemble the full client-facing argumentaire here in
            Phase 4.
          </p>
        </div>
      </div>
    </div>
  );
}
