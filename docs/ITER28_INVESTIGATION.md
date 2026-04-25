# Iter-28 Phase A — Investigation entités hors plate

**Date** : 2026-04-25 — Phase A pure investigation, AUCUN code de
correction. Diagnostic livré pour validation Saad avant Phase C.

---

## 0. Contexte

Saad a testé le pipeline post-iter-27 sur le PDF Bâtiment A
(Haussmannien, plan résidentiel converti) et observe encore des
zones / cubes alignés HORS du plan visible (capture jointe au
brief iter-28). Iter-27 a fixé le parser (rooms_px clamp + reject
+ envelope_bbox_px), mais la capture montre des entités leak qui
ne passent par aucun validator existant.

L'objectif de Phase A : **identifier précisément quelles entités
leak, par quel chemin, et pourquoi**. Le fix correspondant en
Phase C sera dimensionné selon ces findings.

## 1. Méthode

`backend/scripts/iter28_phase_a_capture.py` reproduit la chaîne
`/api/testfit/generate` sur le PDF cached Bâtiment A
(`f616c5f508eacfc7deac6f311f31ceaa.pdf`) avec les 3 styles
(`villageois | atelier | hybride_flex`), exactement comme un appel
prod. Pour chaque entrée du `sketchup_trace` de chaque variante :

1. Mirror du Ruby helper qu'elle invoque (calcul du bbox mm en
   Python identique à ce que fait `design_office_extensions.rb`).
2. Comparaison contre `envelope = [0, plate_w_mm] × [0, plate_h_mm]`.
3. Calcul d'un `overflow_ratio` = fraction de l'aire bbox hors envelope.
4. Classification :
   - `clean` (overflow = 0)
   - `minor` (≤ 5 %) — clamp candidate
   - `major` (5–50 %) — reject candidate
   - `extreme` (> 50 %) — placement bug brut

Tous les helpers Ruby ont été audités et leurs footprints reproduits
exactement (workstation_cluster avec count + spacing + orientation,
phone_booth 1030×1000, hero slugs avec leur half-width / half-depth,
etc.).

**Run instrumentée (2026-04-25 03:55-04:00)** :
- Vision HD a parsé 44 rooms, 8 columns, 2 cores, 0 stairs.
- Envelope mm = 34000 × 50027 (= 34.0 × 50.0 m, plate Bâtiment A).
- Vision a renvoyé `envelope_bbox_px` (iter-27 L3 actif).
- 3 variantes générées en parallèle : 138 entrées de trace au total.

## 2. Résultats agrégés

```json
by_class = { "clean": 122, "major": 1 }
```

Sur **138 entrées** émises pendant la génération des 3 variantes :

| Source layer       | clean | minor | major | extreme |
|--------------------|------:|------:|------:|--------:|
| `parser`           |    33 |     0 |     0 |       0 |
| `agent`            |    54 |     0 |   **1** |       0 |
| `agent_decorative` |    35 |     0 |     0 |       0 |
| **TOTAL**          |   122 |     0 |     1 |       0 |

### 2.1 Le seul leak observé

```text
v=1 (atelier)   idx=13   create_workstation_cluster   source=agent
                overflow=21.35%
                bbox=[18900.0, 33000.0, 38100.0, 33800.0]
                params: origin=(18900, 33000) count=12 spacing=1600 ang=0.0
```

**Lecture** : l'agent variant `atelier` ("L'Enfilade Haussmannienne
— Bâtiment A") a placé un cluster de 12 postes alignés horizontalement
à `x ∈ [18900, 38100]`. La plate Bâtiment A fait 34 000 mm de large.
Les **2.5 derniers postes** (≈4 100 mm) tombent hors envelope sur la
façade Est. Overflow = 4 100 × 800 / (19 200 × 800) = 21.35 %.

L'agent a juste **mal compté** : `origin_x + count × spacing + desk_w`
= `18900 + 12·1600 + 1600` = `39700` > `34000`. Il a posé un cluster
trop long pour rentrer.

## 3. Diagnostic des 4 hypothèses du brief

### A1 — Les decoratives échappent au validator iter-27 ✓ confirmé (sans manifestation cette run)

**Statut** : confirmé structurellement, mais clean sur cette run.

`zone_overlap_validator.py` ligne 23-24 :
> Skipped on purpose : `partition_wall` (1D), `phone_booth` (point-
> placed entity), `place_human` / `place_plant` / `place_hero` /
> `apply_variant_palette` (decor / scene-wide).

→ 35 entrées `agent_decorative` sont passées clean cette run, mais
**aucun mécanisme n'aurait empêché un leak**. L'advisor avait raison :
le post-validator que Phase C va construire DOIT couvrir tous ces
kinds bypassés (humans, plants, heroes, phone_booths, partition_walls).

### A2 — Le validator overlap iter-26 ne valide pas le containment ✓ confirmé

**Statut** : confirmé. C'est le gap structurel principal.

Le validator d'overlap (iter-26 P2) détecte les **collisions entre
zones**. Il ne vérifie pas qu'une zone est COMPLÈTEMENT HORS de
l'envelope. C'est pourquoi le cluster v=1 idx=13 a passé tous les
checks alors qu'il dépasse de 21 %. Aucune ligne de code dans
`backend/app/agents/` ne fait `bbox ⊂ envelope`.

### A3 — Le prompt agent ne contraint pas explicitement les coords ✓ confirmé

**Statut** : confirmé.

`backend/app/prompts/agents/testfit_variant.md` ligne 106-132 contient
des "Hard rules" mais AUCUNE n'est de la forme :

> "All coordinates MUST satisfy 0 ≤ x ≤ plate_w_mm AND 0 ≤ y ≤
> plate_h_mm. Specifically for workstation_cluster :
> origin_mm[0] + count × row_spacing_mm × cos(orientation_rad) +
> 1600 ≤ plate_w_mm."

Le prompt contient `<floor_plan_json>` qui inclut bien envelope.points
en mm, mais aucune instruction explicite ne demande à l'agent de
vérifier la containement avant émission. Il s'appuie sur l'inférence
spatiale du LLM, qui a un blind spot sur les clusters longs (count
× spacing peut dépasser intuitivement).

### A4 — Le Ruby pose les coords telles quelles sans valider ✓ confirmé

**Statut** : confirmé par audit. Voir `_safe_pushpull_up` iter-27 P1 qui
gère le z (extrusion vers le haut) mais aucun check sur xy.

`design_office_extensions.rb` :
- `place_column`, `place_core`, `place_stair` : dessinent à la coord
  fournie sans vérifier l'envelope.
- `create_workstation_cluster` : dessine N desks à origin + i × spacing,
  sans cap.
- `create_meeting_room`, `create_phone_booth`, `apply_biophilic_zone` :
  dessinent à la bbox / position fournie.
- `place_human`, `place_plant`, `place_hero` : pareil, no validation.

→ Le Ruby est volontairement "dumb" — c'est un layer de rendu, pas
un layer de validation. La validation appartient au layer Python en
amont, qui n'existe pas pour le containement aujourd'hui.

## 4. Disambiguation "outside plate" vs "outside PNG"

Question de l'advisor : les leaks sont-ils dans une zone où le PNG
de référence est mal dimensionné (auquel cas le bug est ailleurs) ?

**Réponse** : non, les deux frames de référence coïncident
exactement.

- `import_plan_pdf` (Ruby) : `add_image(pdf_path, origin, mm(width_m
  × 1000.0))` puis `img.height = mm(height_m × 1000.0)`.
- `width_m`, `height_m` viennent du `FloorPlan.real_width_m / m`
  qui est calibré par Vision HD (envelope_real_dimensions_m).
- Donc PNG-mm = `[0, width_m × 1000] × [0, height_m × 1000]` = envelope-mm.

Sur la run instrumentée :
- envelope mm = 34000 × 50027
- PNG mm (via import_plan_pdf width_m=34.0 height_m=50.027) = 34000 × 50027 ✓

Le cluster qui leak est à `bbox=[18900, 33000, 38100, 33800]`.
- Hors envelope : ✓ (38100 > 34000)
- Hors PNG : ✓ (38100 > 34000)

→ C'est un **coord-mm bug côté agent**, pas un PNG sizing bug. Le
fix doit cibler l'agent (prompt + post-validator), pas le pipeline
de rendu.

## 5. Synthèse — root cause unique

Il n'y a **qu'une seule classe de bug** observée sur cette run :

> **L'agent variant Opus 4.7 émet occasionnellement des
> `create_workstation_cluster` dont la longueur (count × spacing
> + desk_w) dépasse l'envelope, parce que le prompt ne contraint
> pas explicitement la containement et qu'aucun layer Python ne
> vérifie post-émission.**

Les decoratives, phone_booths, partition_walls, et autres area-zones
**peuvent** théoriquement leak (advisor confirmed) parce qu'ils
bypassent tous les validators existants — mais sur cette run précise
ils sont restés sains.

La capture que Saad a vue (cubes en file indienne hors du plan)
correspond visuellement à cette signature :
- "cubes en file indienne" = N desks d'un cluster horizontal
- "hors du plan" = la moitié du cluster qui dépasse
- "multiple lines" = potentiellement plusieurs clusters leak en même
  temps (variance LLM run-to-run)

**Note importante sur la divergence quantitative** : Saad voyait BEAUCOUP
plus d'entités dehors que le 1 seul cluster identifié sur cette run.
Hypothèses possibles :
1. **Variabilité LLM** : à chaque run le pattern de leak change. Une
   run "malchanceuse" peut avoir 3-4 clusters leak ensemble.
2. **Capture pre-iter-27** : iter-27 a nettoyé les rooms_px input. Si
   l'agent recevait des coordonnées polluées (rooms parser-leaked) il
   "accommodait" en plaçant des zones à des positions extravagantes.
   Avec rooms_px clean post-iter-27, l'agent leak moins.
3. **Les "cubes" visibles** étaient peut-être des heroes/decoratives
   leak qui sont structurellement non couverts (advisor flag).

Phase A ne tranche pas définitivement entre 1, 2 et 3 — il faudrait
multi-runs pour avoir des stats. **Mais aucune des 3 hypothèses ne
change le fix design** : il faut quoi qu'il arrive ajouter prompt
constraint + Python post-validator couvrant TOUS les kinds.

## 6. Recommandation pour Phase C

### 6.1 Couche 1 — Prompt update (`testfit_variant.md`)

Ajouter une **Hard rule** explicite :

```
- **Containment is non-negotiable.** Before emitting any zone, verify :
  • For `workstation_cluster` : origin_mm[0] + count × row_spacing_mm ×
    cos(orientation_rad) + 1600 ≤ plate_w_mm AND origin_mm[1] + count ×
    row_spacing_mm × sin(orientation_rad) + 800 ≤ plate_h_mm
  • For `meeting_room` / `collab_zone` / `biophilic_zone` :
    every corner / bbox value in [0, plate_w_mm] × [0, plate_h_mm]
  • For `phone_booth` / `place_human` / `place_plant` / `place_hero` :
    position_mm + footprint half-width ≤ plate_w_mm AND ≥ 0
  • For `partition_wall` : both endpoints inside envelope
  Be bold and creative in WHERE you place zones. Push to walls, exploit
  corners, create asymmetric layouts. But every coordinate MUST land
  within the envelope. Conformity to geometry is non-negotiable, but
  conformity should not flatten your creative ambition.
```

(Phrasing créativité-contrainte demandé par Saad.)

### 6.2 Couche 2 — Post-validator Python

Nouveau module : `backend/app/agents/zone_envelope_validator.py`.

Surface :

```python
def validate_zones_against_envelope(
    zones: list[dict],
    envelope_mm: tuple[float, float],
    *,
    project_id: str | None = None,
    strict: bool = False,
) -> tuple[list[dict], list[dict]]:
    """Returns (cleaned_zones, warnings).

    `strict=False` (default) : emit structured WARNINGs but return
    zones UNCHANGED. Lumen + existing fixtures stay green.

    `strict=True` : reject `extreme` (>50% overflow), clamp `major`
    (5-50%), keep `minor` (≤5%) unchanged. WARNINGs emitted with
    project_id, kind, idx, bbox_mm, overflow_ratio, action_taken.
    """
```

Couvre les 13 kinds vus dans le trace + un `default` qui logue un
WARN unknown_kind. Mirror exact du pattern parser L1+L2 (clamp +
reject + structured logging).

Wired dans `_replay_zones` (au début, avant la boucle de dispatch).

### 6.3 Tests

- Unit pytest : 8-10 tests (clean, minor, major, extreme par kind).
- Régression Lumen : strict=False, fixture existante doit rester verte.
- Live Bâtiment A : strict=True, le cluster overflow=21% doit être
  clamped (origin reculé à `plate_w - count×spacing - 1600`) et un
  WARNING émis.
- Test custom : projet avec tous les kinds qui leak en major + extreme,
  vérifier que le rapport de validation est exhaustif.

### 6.4 Estimation

- Couche 1 (prompt) : 30 min — simple texte, mais prompt-eval (1 run
  Bâtiment A) pour confirmer que l'agent obéit à la nouvelle hard rule.
- Couche 2 (post-validator + tests) : 90-120 min — mirror iter-27 L1+L2.
- Live test + regression Lumen : 30 min.

**Total estimé Phase C : 2.5 - 3h.**

### 6.5 Hors scope Phase C

Conformément au brief Saad iter-28 :
- **Phase B (3D Warehouse mobilier)** déférée. Les hero builders
  Ruby produisent déjà des silhouettes 3D reconnaissables (chair
  avec dossier, desk avec pieds, plant avec canopée + pot terracotta).
  Si A+C livré <3h, possibilité d'amélioration ciblée non-asset (mieux
  proportions / matériaux / ombres).
- **Forbidden zones** (cores, stairs, terraces) : Phase C couvre
  l'envelope containment. La détection d'overlap avec les forbidden
  zones existe déjà via le validator iter-26 P2 (zone × zone
  overlap). On n'ajoute PAS un nouveau check forbidden_zones tant
  que le containment de base ne tient pas — un fix à la fois.

---

## 7. Fichiers produits Phase A

- `backend/scripts/iter28_phase_a_capture.py` — driver de capture
- `docs/iter28_phase_a_report.json` — dump complet (3 variants × 138
  entries × bbox + overflow + classification)
- `docs/ITER28_INVESTIGATION.md` — ce document

Aucune modification de code de production.

---

**STATUS** : Phase A complète, en attente du **GO Phase C** de Saad
sur le plan §6.
