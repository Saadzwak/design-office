"""Live Justify round-trip on the saved Lumen variant (atelier).

Loads the most recent generate_output_sample.json, picks the
approved_with_notes variant, then runs Surface 3 Justify on it. Saves the
consolidated argumentaire to tests/fixtures/justify_output_sample.json.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass

from app.models import FloorPlan, VariantOutput  # noqa: E402
from app.surfaces.justify import (  # noqa: E402
    JustifyRequest,
    compile_default_surface,
)
from scripts.run_lumen_full import LUMEN_PROGRAMME  # noqa: E402

# Lumen brief (same as Phase 2 / Phase 3).
LUMEN_BRIEF = """Lumen, startup fintech, 120 personnes aujourd'hui, 170 projetées d'ici 24 mois.
Politique de présence : 3 jours au bureau, 2 télétravail, équipes tech largement en pair programming.
Culture plat, transparente, forte identité par équipe (produit, tech, data, growth, ops).
Modes de travail dominants : collaboration synchrone, design sprints, pair programming,
focus profond pour les devs, rituels all-hands hebdomadaires.
Demandes explicites : beaucoup d'espaces collab, cafétéria centrale pas reléguée,
zones calmes pour concentration, pas d'open space géant indifférencié,
expression de la marque forte.
Surface disponible : 2400 m² utiles sur 2 niveaux reliés par escalier central.
Budget Cat B : 2,2 M€ HT.
Climat : Paris, façade sud donnant sur rue, façade nord donnant sur cour intérieure."""


def main() -> None:
    fixtures_dir = ROOT / "tests" / "fixtures"
    source = fixtures_dir / "generate_output_sample.json"
    if not source.exists():
        print("Run scripts/run_lumen_full.py first to produce generate_output_sample.json")
        sys.exit(2)

    data = json.loads(source.read_text(encoding="utf-8"))
    floor_plan = FloorPlan.model_validate(data["floor_plan"])

    approved = next(
        (
            (v, verdict)
            for v, verdict in zip(data["variants"], data["verdicts"])
            if verdict["verdict"] in ("approved", "approved_with_notes")
        ),
        None,
    )
    if approved is None:
        print("No approved variant in the fixture — pick the first one anyway.")
        approved = (data["variants"][0], data["verdicts"][0])

    variant_payload, verdict_payload = approved
    variant = VariantOutput.model_validate(variant_payload)
    print(f"Selected variant : {variant.style.value} — {variant.title}")
    print(f"Reviewer verdict : {verdict_payload['verdict']}")

    surface = compile_default_surface()
    req = JustifyRequest(
        client_name="Lumen",
        brief=LUMEN_BRIEF,
        programme_markdown=LUMEN_PROGRAMME,
        floor_plan=floor_plan,
        variant=variant,
        language="fr",
    )

    t0 = time.time()
    print("Running Justify Level-3 orchestration (4 research agents + consolidator)...")
    resp = surface.generate(req)
    dt = time.time() - t0
    print(f"  done in {dt:.1f}s · input {resp.tokens['input']:,} · output {resp.tokens['output']:,}")
    print(f"  PDF id : {resp.pdf_id}")

    out_path = fixtures_dir / "justify_output_sample.json"
    out_path.write_text(resp.model_dump_json(indent=2), encoding="utf-8")
    print(f"  saved : {out_path} ({out_path.stat().st_size:,} bytes)")

    print("\nSub-agent tokens :")
    for s in resp.sub_outputs:
        print(f"  {s.name:14} in={s.tokens['input']:5}  out={s.tokens['output']:5}  {s.duration_ms/1000:5.1f}s")

    print("\n=== Argumentaire (first 1200 chars) ===")
    print(resp.argumentaire[:1200])


if __name__ == "__main__":
    main()
