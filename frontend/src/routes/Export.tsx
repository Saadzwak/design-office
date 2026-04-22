export default function Export() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-4xl">Technical export</h1>
        <p className="mt-3 max-w-2xl text-neutral-300">
          Produce a dimensioned A1 DWG with title block, structured in AGENCEMENT, MOBILIER,
          COTATIONS, CLOISONS, and CIRCULATIONS layers — ready for the next studio.
        </p>
      </header>
      <section className="rounded-2xl border border-neutral-500/20 bg-neutral-800/20 p-10">
        <div className="mx-auto flex max-w-md flex-col items-center gap-6 py-10 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-neutral-400">
            Export status
          </p>
          <p className="text-lg text-bone-text">Waiting for a validated variant.</p>
          <button className="btn-primary" disabled>
            Generate technical DWG · coming in Phase 5
          </button>
        </div>
      </section>
    </div>
  );
}
