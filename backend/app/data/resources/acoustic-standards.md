---
uri: design://acoustic-standards
title: Acoustic standards for offices (NF S 31-080, WELL)
audience: interior architect, space planner
last_updated: 2026-04-22
scope: >
  Acoustic performance levels, metrics, and typical targets for each office
  space type. Everything here must hold up under a commissioning measurement
  campaign.
---

# Office acoustic standards

Acoustics is consistently the **worst-scoring Leesman dimension** — just 35 %
of employees satisfied with office noise (Leesman 2024). Getting this right is
the single most impactful lever on perceived workplace quality.

## 1. The French reference : NF S 31-080

**NF S 31-080** — "Acoustique — Bureaux et espaces associés — Niveaux et
critères de performances acoustiques par type d'espace" — is the French
standard that consolidates office acoustic targets.

It defines **three performance levels** for every space type :

| Level              | Intent                                                        |
|--------------------|---------------------------------------------------------------|
| Courant            | Normal speech between adjacent rooms intermittently disturbs  |
| Performant         | Normal voices are discreet between adjacent rooms             |
| Très Performant    | Confidentiality preserved even for loud voices                |

### Metrics controlled by the standard

| Metric        | What it measures                                          | Unit    |
|---------------|-----------------------------------------------------------|---------|
| **DnT,A**     | Standardised airborne sound insulation between two spaces | dB      |
| **L50**       | Statistical background noise level exceeded 50 % of time  | dB(A)   |
| **LnAT**      | HVAC / equipment noise level                              | dB(A)   |
| **TR60**      | Reverberation time                                        | s       |
| **L'nT,W**    | Standardised impact noise level                           | dB      |

### Typical DnT,A targets, office-to-office

| Scenario                              | Courant | Performant | Très perf. |
|---------------------------------------|---------|------------|------------|
| Two enclosed individual offices       | 35 dB   | ~40 dB     | 45 dB      |
| Enclosed office ↔ open-plan           | `[À VÉRIFIER]` — consult standard directly for exact values
| Meeting room ↔ corridor               | `[À VÉRIFIER]` — idem                                       |

**Note** : the ranges above are consistent with the published Acoucibe and
AFNOR summaries; for project commissioning, the exact line-item values
**must** be read from the standard itself (paid, AFNOR reference
`FA142103`). Mark anything you cite from memory as `[À VÉRIFIER]` and ask
Saad to consult the bound text.

## 2. Background noise targets (L50 in dB(A))

| Space type                | Courant   | Performant | Très performant |
|---------------------------|-----------|------------|-----------------|
| Individual office         | `[À VÉRIFIER]` — standard order ~35-40 Courant, ~32-35 Performant, ~30 Très perf. |
| Open-plan / open space    | `[À VÉRIFIER]` — generally higher tolerance (~40-45 Courant) |
| Meeting room              | `[À VÉRIFIER]` — ~35 Courant, 30 Très performant |
| Phone booth interior      | ≤ 30 dB(A) target (industry practice, e.g. Framery advertises 30 dB noise reduction) |

## 3. Reverberation targets (TR60, seconds, mid-frequency)

| Space                     | Courant      | Performant   | Très performant |
|---------------------------|--------------|--------------|-----------------|
| Individual office         | ≤ 0.6 s      | ≤ 0.5 s      | ≤ 0.4 s         |
| Open-plan                 | `[À VÉRIFIER]` — varies with volume V per NF S 31-080 formulae     |
| Meeting room              | ≤ 0.6 s      | ≤ 0.5 s      | ≤ 0.4 s         |
| Restaurant / café         | ≤ 0.8 s      | ≤ 0.6 s      | ≤ 0.5 s         |

Values above are industry-typical orders of magnitude. The standard computes
open-plan TR60 as a function of the room volume; a single fixed number is
meaningless for open space. **Always** run the room through the standard's
formula (or an acoustic simulation) before committing in writing.

### Sabine formula, for quick volume-based estimates

`TR60 = 0.161 · V / A`

where V is the room volume in m³ and A is the total absorption in m² Sabine
(sum of surface × absorption coefficient α for each material).
α is dimensionless, 0 = perfect reflector, 1 = perfect absorber.

Typical α (125-4000 Hz average, `[À VÉRIFIER par bande]`) :

| Material                       | α (mid frequencies) |
|--------------------------------|---------------------|
| Bare plasterboard              | 0.05 – 0.10         |
| Painted concrete slab          | 0.02                |
| Acoustic ceiling tile (quality)| 0.70 – 0.90         |
| Carpet on concrete             | 0.25 – 0.45         |
| Upholstered acoustic panel     | 0.60 – 0.85         |
| Typical office window (glass)  | 0.05 – 0.10         |

Add 0.30 – 0.50 m² Sabine per occupant as a rule of thumb for the human body.

## 4. Speech privacy between workstations (open-plan)

Open-plan privacy is governed in part by :

- **Distance of distraction (rD)** — distance at which speech intelligibility
  index (SII) falls to 0.20
- **Comfort distance (rC)** — distance at which SII falls to 0.50 per ISO 3382-3.

Good open-plan design (dense absorption, partial partitions, masking noise
system) usually targets rD ≤ 5 m and rC ≤ 2.5 m `[À VÉRIFIER — ordres de
grandeur ISO 3382-3]`.

## 5. WELL v2 acoustic preconditions and optimisations

The WELL Building Standard v2 (IWBI) includes acoustic features. Key office
thresholds :

- **S01 — Sound mapping** : zone the floor by acoustic type (focus, collab,
  social, learning) at design stage.
- **S02 — Maximum noise levels** : background HVAC ≤ 45 dBA for open offices,
  40 dBA for enclosed private offices `[À VÉRIFIER contre dernier WELL v2 release]`.
- **S03 — Sound barriers** : Sound Transmission Class (STC) values for
  partitions.
- **S04 — Sound reducing surfaces** : minimum absorption (NRC) by zone.
- **S05 — Sound masking** : optional, improves speech privacy.

## 6. Practical design rules

- **Ceiling absorption is the single biggest lever** : a Class A ceiling tile
  (αw ≥ 0.90) across the full open-plan ceiling is worth more than walls.
- **Partial partitions (1.4 – 1.6 m)** reduce speech path but don't seal;
  full-height partitions with a continuous ceiling break are needed for real
  privacy.
- **Phone booths** are the efficient answer to the Leesman "quiet rooms"
  pain point (40 % satisfaction). Budget 6 – 10 booths per 100 staff.
- **Sound masking** (pink/brown noise electronic system) is effective in dense
  open-plan and has become standard in Northern Europe.

## Sources

- AFNOR — [NF S 31-080 official catalogue entry](https://www.boutique.afnor.org/en-gb/standard/nf-s31080/acoustics-offices-and-associated-areas-acoustic-performance-levels-and-crit/fa142103/740)
- Acoucibe — [Le standard NF S 31-080 pour les bureaux](https://acoucibe.fr/article-le-standard-nf-s-31-080-pour-les-bureaux-124)
- Carsat Hauts-de-France — [Bruit et bureaux (guide pratique)](https://carsat-hdf.fr/files/live/sites/carsat-hdf/files/PDF/entreprises/Par%20risques/Risques%20non%20sp%C3%A9cifiques/hdf-Risques%20physiques_bruit_1.pdf)
- IWBI — WELL Building Standard v2, Sound concept `[À VÉRIFIER sur v2 pilot dernier release]`
- ISO 3382-3 — Acoustics, measurement of room acoustic parameters, open-plan offices `[À VÉRIFIER]`
