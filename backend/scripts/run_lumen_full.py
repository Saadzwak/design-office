"""One-shot end-to-end round-trip on the Lumen fixture.

Runs the hybrid PDF parser with Vision HD on, then the 3-variant + 3-reviewer
orchestration. Saves the consolidated output to
`backend/tests/fixtures/generate_output_sample.json` for later inspection.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Force UTF-8 on the Windows console so unicode diagnostics don't crash us.
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass

from app.pdf.fixtures import generate_lumen_plan_pdf  # noqa: E402
from app.pdf.parser import parse_pdf  # noqa: E402
from app.surfaces.testfit import compile_default_surface  # noqa: E402

# Lumen programme that Phase 2 produced — pasted verbatim so Phase 3 agents
# have the same context the demo will show.
LUMEN_PROGRAMME = """# Programme fonctionnel — Lumen

## 1. Context and headcount

- Lumen, startup fintech, culture plate.
- 120 FTE aujourd'hui → **170 FTE à 24 mois**.
- Politique **3 jours bureau / 2 jours télétravail**.
- Flex-ratio retenu : **0.75 seat/FTE**, peak factor 1.25 → **130 postes**.
- Enveloppe 2 400 m² utiles sur 2 niveaux, escalier central, façade sud
  sur rue, nord sur cour.
- Budget Cat B : 2,2 M€ HT.

## 2. Functional programme

- 130 postes individuels en neighbourhoods par équipe
- 6 focus rooms (5 m² chacune)
- 14 phone booths Framery One / One Compact
- 8 huddle rooms 2–4p
- 6 salles moyennes 6–8p
- 2 boardroom 10–14p
- 2 war-rooms projet persistantes
- 1 town hall / event 120 m²
- Café central 260 m²
- 17 îlots informels (1/10 FTE)
- Locker bank 170 × 0,04 m² = 40 m²
- Réception 40 m², back-office 90 m², sanitaires complémentaires 60 m²

## 3. Surface summary

- Total programmé ≈ **1 686 m²** + circulation 405 m² ≈ **2 091 m²**
- Split : individual 30 % / collab 26 % / support 25 % / circulation 19 %
- NIA/FTE à 24 mois : **12.3 m²** (dans la fourchette activity-based 2024)

## 4. Regulatory envelope

- ERP type W catégorie 4 (< 300 personnes)
- Ascenseur PMR obligatoire (effectif > 50 par niveau)
- Escalier central : encloisonnement EI 30/60 attendu, dispense à négocier
- Désenfumage déclenché au-delà de 300 m² ouverts : café + town hall à
  surveiller
- 2 sorties par niveau, 1,40 m UP cumulées
- Circulations PMR ≥ 1,40 m, portes ≥ 1,40 m pour zones ≥ 100 pers
- Éclairage : 500 lux maintenus (EN 12464-1), UGR ≤ 19, CRI ≥ 80
- Ventilation : ≥ 25 m³/h/occupant (≥ 4 250 m³/h à 170 pax)

## 5. Design intent

- **Postes concentration (devs) en façade nord** — lumière diffuse
- **Collab + café en façade sud** avec BSO / isolation acoustique façade rue
- Modèle neighbourhood (assigné à zone, libre dans la zone)
- Cafétéria centrale forte (pas reléguée)
- Marque exprimée forte sur murs identitaires par équipe
"""


def main() -> None:
    fixtures_dir = ROOT / "tests" / "fixtures"
    fixtures_dir.mkdir(parents=True, exist_ok=True)
    output_path = fixtures_dir / "generate_output_sample.json"

    plan_pdf = generate_lumen_plan_pdf(ROOT / "app" / "data" / "fixtures" / "lumen_plan.pdf")
    print(f"[1/3] Fixture PDF ready: {plan_pdf} ({plan_pdf.stat().st_size} bytes)")

    t0 = time.time()
    print("[2/3] Parsing with Vision HD ON (forced per new directive)...")
    plan = parse_pdf(plan_pdf, use_vision=True)
    t_parse = time.time() - t0
    print(
        f"       done in {t_parse:.1f}s · {len(plan.columns)} columns · "
        f"{len(plan.cores)} cores · {len(plan.stairs)} stairs · "
        f"{len(plan.windows)} windows · conf {plan.source_confidence:.2f}"
    )
    print(f"       notes: {plan.source_notes}")

    print("[3/3] Running 3-variant + 3-reviewer orchestration...")
    t0 = time.time()
    surface = compile_default_surface()
    from app.models import VariantStyle

    result = surface.generate(
        floor_plan=plan,
        programme_markdown=LUMEN_PROGRAMME,
        client_name="Lumen",
        styles=[VariantStyle.VILLAGEOIS, VariantStyle.ATELIER, VariantStyle.HYBRIDE_FLEX],
    )
    t_gen = time.time() - t0
    print(f"       done in {t_gen:.1f}s · input {result.tokens['input']:,} · output {result.tokens['output']:,}")

    output_path.write_text(result.model_dump_json(indent=2), encoding="utf-8")
    print(f"       saved → {output_path} ({output_path.stat().st_size:,} bytes)")

    print("\nVariants summary:")
    for v, verdict in zip(result.variants, result.verdicts):
        print(
            f"  {v.style.value:12} · {v.title[:60]:60} · "
            f"{v.metrics.workstation_count:3} postes · verdict {verdict.verdict}"
        )


if __name__ == "__main__":
    main()
