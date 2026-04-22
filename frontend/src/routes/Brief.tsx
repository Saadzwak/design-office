const LUMEN_BRIEF = `Lumen, startup fintech, 120 personnes aujourd'hui, 170 projetées d'ici 24 mois.
Politique de présence : 3 jours au bureau, 2 télétravail, équipes tech largement en pair programming.
Culture plat, transparente, forte identité par équipe (produit, tech, data, growth, ops).
Modes de travail dominants : collaboration synchrone, design sprints, pair programming,
focus profond pour les devs, rituels all-hands hebdomadaires.
Demandes explicites : beaucoup d'espaces collab, cafétéria centrale pas reléguée,
zones calmes pour concentration, pas d'open space géant indifférencié,
expression de la marque forte.
Surface disponible : 2400 m² utiles sur 2 niveaux reliés par escalier central.
Budget Cat B : 2,2 M€ HT.
Climat : Paris, façade sud donnant sur rue, façade nord donnant sur cour intérieure.`;

export default function Brief() {
  return (
    <div className="grid gap-10 lg:grid-cols-[1.1fr,1fr]">
      <section>
        <h1 className="font-serif text-4xl">Smart brief</h1>
        <p className="mt-3 max-w-xl text-neutral-300">
          Describe the client, their culture, their constraints. Three agents will merge into a
          costed functional program with inline sources.
        </p>
        <label className="mt-8 block font-mono text-xs uppercase tracking-widest text-neutral-400">
          Client brief
        </label>
        <textarea
          className="mt-2 h-80 w-full resize-none rounded-2xl border border-neutral-500/30 bg-neutral-800/30 p-4 font-mono text-sm leading-relaxed text-bone-text focus:border-terracotta/50 focus:outline-none"
          placeholder={LUMEN_BRIEF}
          defaultValue={LUMEN_BRIEF}
        />
        <button className="btn-primary mt-6" disabled>
          Generate program · coming in Phase 2
        </button>
      </section>
      <aside className="rounded-2xl border border-neutral-500/20 bg-neutral-800/20 p-6">
        <p className="font-mono text-xs uppercase tracking-widest text-neutral-400">
          Managed agents
        </p>
        <ul className="mt-4 space-y-4 text-sm text-neutral-200">
          <li>
            <span className="text-terracotta">01 · Effectifs</span> — computes the space matrix
            with defended ratios.
          </li>
          <li>
            <span className="text-terracotta">02 · Benchmarks</span> — pulls Leesman / Gensler /
            HOK benchmarks and cites them.
          </li>
          <li>
            <span className="text-terracotta">03 · Contraintes</span> — checks PMR, ERP, and code
            du travail constraints.
          </li>
          <li>
            <span className="text-bone-text">→ Consolidator</span> — merges the three into a single
            sourced program.
          </li>
        </ul>
      </aside>
    </div>
  );
}
