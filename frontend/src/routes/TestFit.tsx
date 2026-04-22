export default function TestFit() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-4xl">Test fit — 3D variants</h1>
        <p className="mt-3 max-w-2xl text-neutral-300">
          Upload a PDF floor plan. Opus Vision HD reads it, then three sub-agents build three
          contrasted 3D variants in SketchUp. Iterate in natural language.
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[380px,1fr]">
        <aside className="rounded-2xl border border-neutral-500/20 bg-neutral-800/20 p-6">
          <h2 className="font-serif text-lg">Plan & program</h2>
          <div className="mt-6 rounded-xl border border-dashed border-neutral-500/40 p-6 text-center text-sm text-neutral-400">
            Drop a PDF plan here · Phase 3
          </div>
        </aside>
        <section className="rounded-2xl border border-neutral-500/20 bg-neutral-800/20 p-6">
          <div className="flex items-center gap-2 border-b border-neutral-500/20 pb-4">
            {["Villageois", "Atelier", "Hybride flex"].map((v) => (
              <button
                key={v}
                className="rounded-lg border border-neutral-500/30 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-300/50"
              >
                {v}
              </button>
            ))}
          </div>
          <div className="mt-8 grid place-items-center rounded-xl border border-neutral-500/20 bg-neutral-900/40 p-16 text-sm text-neutral-400">
            SketchUp viewer · Phase 3
          </div>
        </section>
      </div>
    </div>
  );
}
