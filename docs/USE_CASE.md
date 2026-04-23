# Use case — Lumen, fintech, 2 400 m²

Walkthrough of the reference use case Design Office ships with. Every
number below was produced by a live run through the six surfaces —
see `backend/tests/fixtures/` for the raw JSON outputs, the mood-board
and argumentaire PDFs, the PPTX pitch deck, and the DXF.

> Note on history: this walkthrough captures the Lumen run as it was
> originally executed. The brief fixture shipped in the app is now in
> English (see the `LUMEN_BRIEF` constant in the Brief surface); the
> French transcript preserved below is the exact text the Opus 4.7
> agents actually saw on that run.

---

## The brief (verbatim, as the user pastes it)

> Lumen, startup fintech, 120 personnes aujourd'hui, 170 projetées
> d'ici 24 mois.
>
> Politique de présence : 3 jours au bureau, 2 télétravail, équipes
> tech largement en pair programming.
>
> Culture plat, transparente, forte identité par équipe (produit, tech,
> data, growth, ops).
>
> Modes de travail dominants : collaboration synchrone, design sprints,
> pair programming, focus profond pour les devs, rituels all-hands
> hebdomadaires.
>
> Demandes explicites : beaucoup d'espaces collab, cafétéria centrale
> pas reléguée, zones calmes pour concentration, pas d'open space
> géant indifférencié, expression de la marque forte.
>
> Surface disponible : 2 400 m² utiles sur 2 niveaux reliés par
> escalier central.
>
> Budget Cat B : 2,2 M€ HT.
>
> Climat : Paris, façade sud donnant sur rue, façade nord donnant sur
> cour intérieure.

## The fictitious plan

60 m × 40 m plate, column grid every 7 m (54 columns, Ø400 mm), two
6×6 m technical cores (elevators / WC), central 4×5 m stair,
12 windows (6 on the north façade, 6 on the south façade).

The plan is generated procedurally by `backend/app/pdf/fixtures.py` so
the demo works without a real architectural PDF. Run :

```powershell
python backend/scripts/run_lumen_full.py
```

to materialise the PDF and kick off the full pipeline.

---

## Surface I — Brief synthesis

### Live run statistics

| Agent | Tokens in | Tokens out | Duration |
|-------|-----------|------------|----------|
| Effectifs | 12 308 | 3 864 | 68.3 s |
| Benchmarks | 16 718 | 2 548 | 47.2 s |
| Contraintes | 12 743 | 4 000 | 75.4 s |
| Consolidator | 11 659 | 4 787 | 89.1 s |
| **Total** | **53 428** | **15 199** | 164.5 s |

### Output (excerpt)

```markdown
# Programme fonctionnel — Lumen

## 1. Context and headcount

- Client : Lumen, startup fintech, culture plate et transparente,
  forte identité par équipe (produit, tech, data, growth, ops).
- Effectifs : 120 FTE aujourd'hui → 170 FTE à 24 mois
- Politique de présence : 3 jours bureau / 2 jours télétravail,
  pair programming intensif côté tech.
- Flex-ratio retenu : 0.75 seat/FTE (fourchette 0.70–0.80 pour
  une politique 3/2, `ratios_json.flex_ratio_by_policy.3_2_hybrid_standard`),
  peak-day factor 1.25 → 130 individual desks.
- Enveloppe disponible : 2 400 m² utiles sur 2 niveaux.
- Budget Cat B : 2,2 M€ HT.

## 2. Functional programme (table)

| Typologie | Nombre | Unitaire (m²) | Total (m²) | Justification |
|---|---|---|---|---|
| Postes individuels | 130 | 4.5 | 585 | 170 × 0.75 × peak 1.25 |
| Focus rooms 1–2p | 6 | 5 | 30 | 4/100 FTE max, pair programming |
| Phone booths | 14 | 1.5 | 21 | 8/100 FTE, hybride intensif |
| Huddle rooms 2–4p | 8 | 9 | 72 | collab-heavy culture |
| Salles moyennes 6–8p | 6 | 22 | 132 | design sprints, rituels |
| War-rooms projet | 2 | 20 | 40 | "design sprints" (brief) |
| Boardroom 10–14p | 2 | 35 | 70 | board + pitch investisseurs |
| Town hall / event | 1 | 120 | 120 | all-hands 170 FTE théâtre |
| Café central | 1 | 260 | 260 | « cafétéria pas reléguée » |
| Îlots informels | 17 | 6 | 102 | 1/10 FTE org collab |
| Print / copy | 4 | 6 | 24 | 1/quartier |
| Lockers | 170 | 0.04 | 40 | 1/FTE, flex < 1 |
| Réception | 1 | 40 | 40 | fintech client-facing |
| Back-office | 1 | 90 | 90 | MDF/IDF + storage |
| Sanitaires complémentaires | 1 | 60 | 60 | douches mobilité |
| — | — | — | 1 686 | sous-total programmé |
| Circulation NIA | — | — | 405 | ~19 %, 2 niveaux |
| Total programme | — | — | ≈ 2 091 | cible |

(Split : individuel 30 % / collab 26 % / support 25 % / circulation 19 %.
NIA/FTE à 24 mois : 12.3 m², dans la fourchette activity-based 2024 12–15.)
```

### Red flags the consolidator surfaced

- **Ascenseur PMR** mandatory (effectif > 50 per level) — verify the
  existing lift, major CAPEX hit if absent.
- **Escalier central ouvert** — default regulation requires enclosure
  (EI 30/60 + fire doors). Open "design" stair needs a bureau de
  contrôle dispensation, to engage at APS.
- **Café 260 m² + town hall 120 m²** : if combined in a single open
  volume, triggers désenfumage above 300 m².
- **Split 30 / 26 / 25 / 19 %** deliberately below the industry 45 – 55
  % individual floor — this is a *choice*, not an *accident*, and must
  be validated with the client as such.

The consolidator carried all `[À VÉRIFIER]` markers through intact
(seuils CO 38 / CO 49 / DH, dimensions cabinet PMR, R. 4222 R. 4223
dernière version 2026).

---

## Surface II — Test Fit (macro-zoning)

### PDF parse (Vision HD + PyMuPDF)

- Render : 2 576 px PNG of the fictitious PDF
- PyMuPDF : **54 columns**, **2 cores** (rectangles), **1 stair**,
  **12 windows** (as horizontal line runs on N/S edges), envelope
  60 × 40 m, 2 400 m²
- Vision HD : returns empty `windows_px` (stylised PDF with plain
  lines), scale label "LUMEN — Plateau niveau 1 (60 m x 40 m) —
  échelle 1:200", orientation arrow not present, text labels
  "Facade Sud (rue)", "Facade Nord (cour)"
- Fusion confidence : **0.9** (both paths agree on geometry)

### Variant generation

Three parallel agents produce JSON plans ; Python replays them through
`SketchUpFacade` (mock or live) and collects traces. Reviewers grade
in parallel.

| Variant | Title | Postes | Zones | Verdict |
|---------|-------|--------|-------|---------|
| villageois | Le Village Lumen | 130 | 120 | rejected |
| atelier | L'Atelier Nord — Fabrique Lumineuse | 130 | 122 | approved_with_notes |
| hybride_flex | Lumen Modular Grid | 112 | 118 | rejected |

Total for this surface : **142 520 input / 22 172 output tokens, 108 s**.

### Reviewer issues captured

**villageois** :
- Back-of-house (reception 40 m², back-office 90 m², sanitaires 60 m²)
  not instantiated as zones
- Focus rooms sized at 14 m² each vs programme 5 m²
- Town hall declared in narrative but not placed as a distinct zone

**atelier** :
- Workstation cluster x=54 500 mm with 2 desks risks column
  collision at x=52 500 or x=59 500 — needs spot-check
- Huddle S4 has degenerate y coordinates (y=26 800 both ends)
- Locker bank + back-office acknowledged in notes, not placed

**hybride_flex** :
- 112 desks vs programme 130 (−14 %), outside ± 5 % tolerance
- 0 meeting_room_count and 0 phone_booth_count (likely parse issue on
  a partial JSON — but flagged as hard violation)
- Back-of-house missing as zones

The Reviewer is the safety net that catches regressions the variant
agents introduce. Without it we'd have signed off on a variant with 0
meeting rooms.

---

## Surface IV — Justify

Selected variant : **atelier** (the only one with
`approved_with_notes`).

### Live run

| Agent | Tokens in | Tokens out | Duration |
|-------|-----------|------------|----------|
| Acoustic | 40 243 | 3 138 | 65.3 s |
| Biophilic | 38 483 | 3 898 | 82.6 s |
| Regulatory | 24 647 | 4 500 | 86.0 s |
| Programming | 28 492 | 3 919 | 71.3 s |
| Consolidator | 16 733 | 7 038 | 139.7 s |
| **Total** | **148 598** | **22 493** | 229 s |

### Output structure

```
# Lumen — Pourquoi cette variante

## 1. Le pari
## 2. Ce que dit la recherche
   ### Acoustique & confort sonore
   ### Biophilie & neuroarchitecture
   ### Programme & flex
## 3. Ce que dit la réglementation
## 4. Arbitrages et incertitudes
## 5. Résultats attendus, 6 et 12 mois
## 6. Prochaines étapes
## 7. Sources
```

14 242 characters total. Every number carries a citation or a
`[À VÉRIFIER]` marker.

### Excerpt — "Le pari"

> La variante « atelier nord » fait un pari simple : rendre au bureau
> Lumen ce que le domicile ne peut pas donner — collaboration synchrone,
> rituels d'équipe, café qui rassemble — tout en protégeant ce que le
> pair programming exige de plus précieux, l'attention profonde.
> Leesman 2024 chiffre l'écart à combler : **10 points** entre le Lmi
> bureau (69,5) et le H-Lmi domicile (79,5). Notre réponse : une
> **bande postes en façade nord** pour la concentration diffuse, une
> **spine centrale cloisonnée** qui absorbe appels et huddles, et un
> **café sud de 260 m²** assumé comme cœur social — fidèle à votre
> demande « cafétéria centrale pas reléguée ». Le tout indexé sur une
> politique 3/2 et un ratio **0,75 seat/FTE** prudent, cohérent avec
> l'identité forte par équipe que vous revendiquez.

### PDF output

A 5-page A4 PDF renders via ReportLab in the Organic Modern palette
(forest eyebrow `#2F4A3F`, sand rules `#C9B79C`, ink body `#1C1F1A`,
Helvetica). Download link available at
`GET /api/justify/pdf/148727235162bc34`.

---

## Surface V — Export

Headless `ezdxf` backend on the atelier variant :

- **Export id** : `db4b14d8bdd293fd`
- **DXF bytes** : 167 970
- **Sheet / scale** : A1 / 1:100
- **Layers** : AGENCEMENT, MOBILIER, COTATIONS, CLOISONS, CIRCULATIONS
- **AutoCad trace length** : 334 operations

The DXF opens cleanly in AutoCAD ; the title-block cartouche in the
bottom-right carries :

```
Lumen — L'Atelier Nord — Fabrique Lumineuse
Projet : LUMEN-CAT-B-DEMO        Échelle : 1:100 — A1
Niveau : Atelier                 Date : 2026-04-22
Dessiné : DO                     Postes : 130
Design Office — Built with Opus 4.7 — MIT License
```

Copy of the DXF is saved at
`backend/tests/fixtures/lumen_export_atelier.dxf` for inspection
without running the stack.

---

## End-to-end token budget

| Surface | Input | Output | Wall clock |
|---------|-------|--------|-----------|
| 1 — Brief | 53 428 | 15 199 | 165 s |
| 2 — Test Fit (incl. Vision HD) | 147 814 | 23 857 | 134 s parse + 108 s generate ≈ 4 min |
| 3 — Justify | 148 598 | 22 493 | 229 s |
| 4 — Export | 0 | 0 | 2 s |
| **Total** | **≈ 350 k** | **≈ 61 k** | **~10 minutes** |

From a cold start — typed brief to signable DXF + client-ready PDF —
in about **10 minutes of wall-clock time**.

---

## What the consolidator got right

Reading the consolidator's "Le pari" paragraph, the agent :

1. Named the strategic choice (collaboration + rituals + café vs the
   home office gap)
2. Quantified the gap (10 points Leesman)
3. Tied each design move to a brief quote (« cafétéria centrale pas
   reléguée »)
4. Stated the ratio with the source (`ratios_json.flex_ratio_by_policy`)
5. Respected the identity claim the brief opened with

This is the level of argumentation a junior associate would spend a
day drafting. The consolidator does it in 2 minutes, with citations
that can be clicked through.

## What to verify before handing to the client

Pull the `[À VÉRIFIER]` markers from the argumentaire — they list every
claim that needs a human recheck (article numbers in CO 35 – CO 50,
seuils de désenfumage, dernière version de R. 4222, exact DOI for
Cummings & Waring 2020, empirical support for the 8-of-14 Browning
target). None are blockers for the client conversation ; all should be
tightened before tendering.
