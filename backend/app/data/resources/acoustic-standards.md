---
uri: design://acoustic-standards
title: Office acoustics — NF S 31-080, NF S 31-199, ISO 3382-3, WELL
audience: interior architect, space planner, acoustic consultant
last_updated: 2026-04-22
version: 2
scope: >
  Acoustic performance framework for French tertiary fit-outs. Everything here
  is either cited against a norm or flagged [À VÉRIFIER]. For production
  projects, the bound norm texts (AFNOR, ISO) take precedence over this
  document — use this file to plan, brief the client, and draft
  specifications, then confirm numerically against the published standard.
---

# Office acoustic standards

Acoustics is consistently the **worst-scoring Leesman dimension** in modern
offices — only **35 %** of surveyed employees in the Leesman 2024 panel
report satisfaction with noise levels, and **40 %** with quiet rooms.
Getting acoustics right is the single highest-leverage intervention on
perceived workplace quality and, as Hongisto's work shows, on cognitive
performance itself.

This document covers :

1. The French reference — **NF S 31-080** (by space type) and the newer
   **NF S 31-199** (dedicated to open-plan offices)
2. The international open-plan measurement standard — **ISO 3382-3**
3. The research that underpins the targets — **Hongisto and Haapakangas**
4. Practical targets by space type, by performance level
5. Design playbook : absorption, partitions, masking, layout

---

## 1. NF S 31-080 — Bureaux et espaces associés

**NF S 31-080** — "Acoustique — Bureaux et espaces associés — Niveaux et
critères de performances acoustiques par type d'espace" — consolidates
French office acoustic targets for **every space type** (individual
office, collective office, open-plan, meeting room, break area, dining,
circulation).

### 1.1 Three performance levels

| Level              | Intent                                                        |
|--------------------|---------------------------------------------------------------|
| **Courant**        | Normal speech between adjacent rooms intermittently disturbs. Basic comfort. |
| **Performant**     | Normal voices are discreet between adjacent rooms. High-quality comfort. |
| **Très Performant**| Confidentiality preserved even for loud voices. HQ / board / medical-grade. |

### 1.2 Controlled metrics (all measured in situ)

| Metric   | What it measures                                             | Unit    |
|----------|--------------------------------------------------------------|---------|
| **DnT,A**    | Standardised airborne sound insulation between two spaces    | dB      |
| **L50**      | Statistical background noise level exceeded 50 % of the time | dB(A)   |
| **LnAT**     | HVAC / equipment noise level                                 | dB(A)   |
| **TR60** (or T30) | Reverberation time                                      | s       |
| **L'nT,W**   | Standardised impact noise level                              | dB      |

### 1.3 DnT,A targets, office-to-office

Based on AFNOR / Acoucibe summary of the current NF S 31-080 text :

| Scenario                              | Courant    | Performant | Très perf. |
|---------------------------------------|------------|------------|------------|
| Two enclosed individual offices       | ~35 dB     | ~40 dB     | **45 dB**  |
| Enclosed office ↔ open-plan           | ~30 dB     | ~35 dB     | ~40 dB `[À VÉRIFIER exact norme]` |
| Meeting room ↔ corridor               | ~35 dB     | ~40 dB     | ~45 dB `[À VÉRIFIER]` |
| Meeting room ↔ adjacent meeting room  | ~40 dB     | ~45 dB     | ~50 dB `[À VÉRIFIER]` |
| Office ↔ break area                   | ~35 dB     | ~40 dB     | ~45 dB `[À VÉRIFIER]` |

For project commissioning, the exact line-item values must be read from
the bound standard (AFNOR reference `FA142103`). Mark anything cited from
memory as `[À VÉRIFIER]` and consult the bound text.

### 1.4 Background-noise targets (L50 in dB(A))

| Space type                | Courant   | Performant | Très performant |
|---------------------------|-----------|------------|-----------------|
| Individual office         | ~38 dB(A) | ~35 dB(A)  | ~32 dB(A)       |
| Open-plan / open space    | ~45 dB(A) | ~42 dB(A)  | ~40 dB(A)       |
| Meeting room              | ~35 dB(A) | ~32 dB(A)  | ~30 dB(A)       |
| Board / executive meeting | ~32 dB(A) | ~30 dB(A)  | ~28 dB(A)       |
| Phone booth interior      | ≤ 30 dB(A) — industry target (e.g. Framery advertises 30 dB noise reduction)  |

Values above are typical orders of magnitude consistent with AFNOR /
Acoucibe summaries ; the bound standard publishes the authoritative
numbers. **`[À VÉRIFIER ligne par ligne avant spec finale]`**.

### 1.5 Reverberation targets (TR60, mid-frequency, in seconds)

| Space                     | Courant      | Performant   | Très performant |
|---------------------------|--------------|--------------|-----------------|
| Individual office         | ≤ 0.8 s      | ≤ 0.6 s      | ≤ 0.5 s         |
| Meeting room ≤ 50 m³      | ≤ 0.6 s      | ≤ 0.5 s      | ≤ 0.4 s         |
| Meeting room 50 – 200 m³  | ≤ 0.8 s      | ≤ 0.6 s      | ≤ 0.5 s         |
| Board / lecture ≥ 200 m³  | ≤ 1.0 s      | ≤ 0.8 s      | ≤ 0.6 s         |
| Restaurant / café         | ≤ 0.8 s      | ≤ 0.6 s      | ≤ 0.5 s         |
| Circulation corridor      | ≤ 0.8 s      | ≤ 0.6 s      | ≤ 0.5 s         |
| Open-plan office          | Volume-dependent — compute via the NF S 31-080 formulas tied to room volume V |

Open-plan TR60 is a function of room volume ; a single fixed number is
**meaningless** for open space. Use the standard's formulas, or an
acoustic simulation tool (Odeon, CATT, ReflexaTC) before committing.

**Sabine formula** for a first-pass estimate :

`TR60 = 0.161 · V / A`

- V : room volume (m³)
- A : total absorption = Σ(Si · αi) over each surface (m² Sabine)
- αi : absorption coefficient of the surface (dimensionless, 0 ≤ α ≤ 1)

Add **0.30 – 0.50 m² Sabine per occupant** as a rule of thumb for the
human body (seated, clothed).

Typical α at mid frequencies (500 – 2 000 Hz band average) :

| Material                        | α mid-freq          |
|---------------------------------|---------------------|
| Bare plasterboard               | 0.05 – 0.10         |
| Painted concrete slab           | 0.01 – 0.05         |
| Acoustic ceiling tile (NRC 0.70)| 0.65 – 0.75         |
| Acoustic ceiling tile (NRC 0.90)| 0.80 – 0.95         |
| Carpet on concrete              | 0.25 – 0.45         |
| Upholstered acoustic panel      | 0.60 – 0.85         |
| Heavy curtain, drawn            | 0.40 – 0.60         |
| Standard office window (glass)  | 0.05 – 0.10         |
| Exposed concrete wall           | 0.02 – 0.05         |
| Perforated wood panel           | 0.30 – 0.70 (depends on perforation ratio + backing) |

---

## 2. NF S 31-199 — Espaces ouverts de bureaux

Published by AFNOR in **March 2016** and revised 2022, **NF S 31-199**
is the first French standard **dedicated to open-plan office
acoustics**. It does not replace NF S 31-080 for other space types —
the two coexist.

### 2.1 Principle

NF S 31-199 treats the open-plan as a **multidimensional optimisation**
rather than a set of fixed dB targets. It recognises that open-plan
comfort depends on **use intensity** (focus-heavy vs collaboration-heavy
vs customer-facing), and tailors criteria to the declared use.

### 2.2 Key metrics adopted

Drawn directly from ISO 3382-3 (see §3) :

- **D2,S** — spatial decay rate of speech (dB per doubling of distance
  from a standard speech source)
- **Lp,A,S,4m** — A-weighted sound pressure level of speech at 4 m
  from the source
- **rD** — distraction distance, beyond which the Speech Transmission
  Index (STI) falls below 0.50
- **rC** — comfort distance (NEW in ISO 3382-3:2022) — distance at
  which the A-weighted SPL of normal speech falls below 45 dB

### 2.3 Target values for "good acoustical conditions"

| Metric       | Target (good conditions) |
|--------------|---------------------------|
| **D2,S**     | **≥ 7 dB**                |
| **Lp,A,S,4m**| **≤ 48 dB**               |
| **rD**       | **≤ 5 m**                 |
| **rC**       | 3 – 30 m (published data range; project-specific target `[À VÉRIFIER]`) |

**Reading** : at a well-designed open-plan office, speech from a talker
fades out rapidly with distance (D2,S ≥ 7), is already quiet at 4 m
(Lp,A,S,4m ≤ 48), and by 5 m another person can no longer follow the
conversation in detail (rD ≤ 5).

### 2.4 What the standard requires

- Zoning : identify focus zones, collaboration zones, and circulation
- Absorption : prescribe minimum absorption per zone (typically NRC
  ≥ 0.80 ceiling, plus wall or floor absorption)
- Partitions : specify where partial or full partitions are needed
- Furniture : use pods, high-back sofas, upholstered furniture as
  additional absorption + visual shielding
- Masking : allowed and often required for high-confidentiality zones

**Sources** :
- AFNOR — [NF S 31-080 catalogue entry](https://www.boutique.afnor.org/en-gb/standard/nf-s31080/acoustics-offices-and-associated-areas-acoustic-performance-levels-and-crit/fa142103/740)
- AFNOR — [NF S 31-199 catalogue entry](https://www.boutique.afnor.org/en-gb/standard/nf-s31199/acoustics-acoustic-performance-of-openplan-offices/fa158972/1549)
- Acoucibe — [Le standard NF S 31-080 pour les bureaux](https://acoucibe.fr/article-le-standard-nf-s-31-080-pour-les-bureaux-124)
- AFNOR press — [Acoustique : NF S31-199 open space](https://www.afnor.org/en/news/health-and-safety-at-work/acoustics-nf-s31-199-open-space/)
- Orosound — [French AFNOR takes on noise in open-plan offices](https://www.orosound.com/afnor-noise-open-plan-offices/)
- INRS Le Muet — [Approche complète NF S 31-199 (PDF)](https://www.inrs.fr/dam/jcr:bc4ee98a-a68a-41b8-aebb-9ee87bf69d66/2-presentation-LeMuet-Chevret.pdf)

---

## 3. ISO 3382-3 — measurement of open-plan office acoustics

**ISO 3382-3:2022** is the international standard for measuring open-plan
office acoustic parameters. It defines :

### 3.1 Single-number quantities

| Quantity       | Definition                                                   |
|----------------|--------------------------------------------------------------|
| **D2,S**       | Spatial decay rate of A-weighted SPL of normal speech per distance doubling |
| **Lp,A,S,4m**  | A-weighted SPL of normal speech at 4 m from the talker       |
| **rD**         | Distraction distance — distance at which STI < 0.50         |
| **rC**         | Comfort distance — distance at which Lp,A,S < 45 dB (new in 2022 ed.) |
| ~~rp~~         | ~~Privacy distance~~ — **removed** in 2022 edition           |

### 3.2 Target ranges (from ISO 3382-3 and industry rollup)

- **D2,S ≥ 7 dB** : good (open-plan class A) ; **< 5 dB** : poor
- **Lp,A,S,4m ≤ 48 dB** : good ; **> 52 dB** : poor
- **rD ≤ 5 m** : good ; **> 10 m** : poor
- **rC 3 – 30 m** : observed range, project-specific target `[À VÉRIFIER]`

### 3.3 Classification grade (unofficial / industry)

Open-plan offices are sometimes graded A → E from D2,S :

| Grade | D2,S (dB) |
|-------|-----------|
| A     | ≥ 11      |
| B     | 9 – 11    |
| C     | 7 – 9     |
| D     | 5 – 7     |
| E     | < 5       |

`[À VÉRIFIER : classification A–E n'est pas dans ISO 3382-3 officiel,
c'est une synthèse industrie]`.

**Sources** :
- ISO — [ISO 3382-3:2022 sample (PDF)](https://cdn.standards.iteh.ai/samples/77437/ce295b70a7b048509514492c8e2dffe2/ISO-3382-3-2022.pdf)
- Odeon — [ISO 3382-3 Open plan offices application note (PDF)](https://odeon.dk/pdf/Application_note_ISO-3382-3_Offices.pdf)
- MDPI — [Comfort Distance (rC) paper](https://www.mdpi.com/2076-3417/11/10/4596)
- Apex Acoustics — [ISO 3382-3: necessary but not sufficient (PDF)](https://www.apexacoustics.co.uk/images/News/PDF/apex-acoustics-open-plan-office-acoustics-iso-3382-3-necessary-but-not-sufficient-a-new-approach-ioa-2019_p37.pdf)

---

## 4. The cognitive evidence — Hongisto

### 4.1 Hongisto 2005

Hongisto, V. (2005). **A model predicting the effect of speech of varying
intelligibility on work performance**. *Indoor Air*, 15(6), 458–468.

Key findings :

- **Speech is the most distracting sound** in open-plan offices ; the
  distracting power is determined by **intelligibility (STI)**, not
  **absolute level**.
- Performance begins to decrease at **STI > 0.20**.
- Maximum performance decrement is reached at **STI ≈ 0.60** (original
  model) ; **STI ≈ 0.44** (revised model, Haapakangas et al. 2020).
- Performance decrement ranges **4 – 45 %** depending on task type.
  **Verbal short-term memory tasks** are most strongly affected.
- Reading comprehension affected by ~ 20 % ; arithmetic and
  visuo-spatial tasks less affected.

### 4.2 Haapakangas et al. 2020 revised model

Fourteen studies with 34 tests reanalysed (Haapakangas et al., 2020,
*Indoor Air*) :

- Performance degrades above **STI ≈ 0.21**
- Plateau at **STI ≈ 0.44**
- Verbal short-term memory remains the most consistently affected task

### 4.3 Industry rollup

Aisti / AkustikLab synthesis (Hongisto-informed) : offices with poor
acoustics are **~16 % less productive** than those with good acoustics.
This is not a single peer-reviewed number — it's a Hongisto-model
rollup — cite it only with that caveat.

**Sources** :
- PubMed — [Hongisto 2005 abstract](https://pubmed.ncbi.nlm.nih.gov/16268835/)
- ICBEN 2008 — [Hongisto task performance paper (PDF)](https://www.icben.org/2008/PDFs/Hongisto_et_al.pdf)
- Indoor Air 2020 — [Haapakangas et al.](https://onlinelibrary.wiley.com/doi/abs/10.1111/ina.12726)
- PubMed — [Haapakangas 2020 PubMed](https://pubmed.ncbi.nlm.nih.gov/32735743/)

---

## 5. WELL v2 acoustic features

The **WELL Building Standard v2** Sound concept contains ten features,
prerequisites (S01–S02) and optimisations (S03–S10) `[À VÉRIFIER final v2
pilot]`. Key prerequisites :

- **S01 — Sound Mapping** : zone the floor by acoustic type at design
  stage (focus / collab / social / learning).
- **S02 — Maximum Noise Levels** : background HVAC ≤ 45 dBA for open
  offices, ≤ 40 dBA for enclosed private offices, ≤ 35 dBA for meeting
  rooms `[À VÉRIFIER précis]`.

Optimisations (S03–S10) cover :

- **S03 — Sound Barriers** : partition STC minimums
- **S04 — Sound Reducing Surfaces** : minimum NRC per zone
- **S05 — Sound Masking** : uniform masking at ~45 dBA
- **S06 — Reverberation Time** : TR60 per space type
- **S07 — Sound Reinforcement** : for rooms ≥ 4 m long speech path
- **S08 — Hearing Health Conservation** : noise exposure monitoring
- **S09 — Enhanced Audio Devices** : accessibility for hearing-impaired
- **S10 — Acoustic Comfort Control** : occupant-adjustable masking
  levels

A WELL Silver / Gold target typically requires S01, S02 and 3 – 5
optimisations.

---

## 6. Speech masking — how and when

### 6.1 Mechanism

Sound-masking systems inject a **tuned broadband noise** into the
ceiling plenum, effectively raising the room's background noise floor
so that speech at neighbouring workstations becomes unintelligible
(STI < 0.2) while remaining non-intrusive (typically 42 – 48 dBA).

### 6.2 Pink vs white vs speech-shaped

- **White noise** (flat spectrum) is too bright, users perceive hiss.
- **Pink noise** (−3 dB/octave) is closer to speech spectrum, less
  fatiguing.
- **Speech-shaped broadband** (pink noise filtered further, typically
  −5 dB/octave between 125 Hz and 8 kHz) is the industry-preferred
  spectrum for office masking.

### 6.3 Typical levels

- **42 – 48 dBA** measured at seated ear height
- Any higher and masking becomes a noise source itself (degrades
  focus)
- Lower and it fails to mask (speech still intelligible)
- **Occupant-adjustable ±2 dB** is a WELL S10 optimisation and is a
  real satisfaction lever

### 6.4 Effectiveness

Well-tuned masking **lowers rD from ~8 m to ~4 m** in a typical open
plan, closing the distraction distance to near-compliance with NF S
31-199 "good" even in moderately absorbent rooms.

### 6.5 When NOT to specify masking

- Smaller enclosed offices (≤ 30 m²) — masking adds noise without
  gaining privacy
- Rooms where masking is already uniform (café, lobby) — redundant
- High-ceiling lofts with very good absorption already — diminishing
  returns

---

## 7. Phone booths and meeting pods — acoustic reality-check

Manufacturer acoustic claims are typically **reduction in speech level
from inside to outside** at a specific distance (usually 1 m from the
booth, door closed, talker at normal voice).

| Product                         | Claimed reduction             | Source                |
|---------------------------------|-------------------------------|-----------------------|
| Framery One / One Compact       | ~30 dB (class A — manufacturer classification) | framery.com |
| Framery Q                       | ~30 dB                        | framery.com `[À VÉRIFIER]` |
| Poppin Hush                     | ~27 dB `[À VÉRIFIER]`          |                       |
| Orangebox Air3                  | ~28 dB `[À VÉRIFIER]`          |                       |
| Haworth BuzziNest (open pod)    | ~12 – 15 dB — visual + partial acoustic shielding only |  |
| Steelcase Work Pods             | ~28 dB `[À VÉRIFIER]`          |                       |

**Reality check** : booths rely on **air seals, ventilation silencers,
and properly specified doors**. A scuffed door seal or a poorly fitted
duct can drop claimed 30 dB to effective 15 dB. Commission each
delivered pod in situ before signing off.

---

## 8. Design playbook — by order of impact per €

### 8.1 Ceiling absorption (highest impact)

A **Class A acoustic ceiling (αw ≥ 0.90)** across the full open plan is
the single biggest lever on TR60 and speech privacy. It usually costs
less per m² than any partition strategy and works from day one.

### 8.2 Partial partitions (1.4 – 1.6 m)

Mid-height partitions reduce the direct speech path between adjacent
workstations. They do **not** seal. A full-height partition with
continuous ceiling break is needed for real privacy — use that for
enclosed focus rooms, not for open-plan zoning.

### 8.3 Soft furniture and upholstered elements

High-back sofas, upholstered acoustic panels, heavy curtains, and tall
planters act as both visual and acoustic buffers. Ambius planters on a
sub-base can deliver α ≈ 0.50 – 0.70 over a 1 m² footprint.

### 8.4 Phone booths and meeting pods

Per 100 FTE in a collaborative organisation, plan :

- 6 – 10 phone booths (1 person)
- 2 – 4 focus rooms (1 – 2 persons)
- 3 – 5 huddle rooms (2 – 4 persons)
- 2 – 4 medium meeting rooms (6 – 8 persons)
- 1 – 2 large rooms (10 – 14 persons)
- 1 town hall (40+ persons)

See `design://collaboration-spaces` for full sizing.

### 8.5 Sound masking — last, not first

Masking works, but only **after** absorption and partitioning are
right. A masking system over bare concrete with hard ceilings is a
complaint generator. Sequence : ceiling → partial partitions → booths →
masking.

---

## 9. Measurement protocol — commissioning

- **Before move-in** : measure TR60 (ISO 3382-1/2) and ambient HVAC
  level in representative zones.
- **After move-in, 3 months post-occupancy** : repeat, plus ISO 3382-3
  D2,S, Lp,A,S,4m, rD.
- Comparison against design targets feeds a "comfort letter" the
  client can share internally and a punch-list for remediation.
- Budget for one commissioning campaign + one remedial campaign in the
  AEI contract.

---

## 10. Quick-reference acoustic envelope for the Lumen brief

For the Lumen brief (§ `design://office-programming`) :

| Space                            | Courant | Performant | Design target |
|----------------------------------|---------|------------|----------------|
| Devs concentration (façade nord) | Performant at minimum, aim Très perf. | Background ≤ 35 dBA, TR60 ≤ 0.5 s |
| Collab + café (façade sud)       | Courant | Acceptable given Leesman 52 % value informal, but buffer to focus zones |
| Board / phone booths             | Très performant | Background ≤ 30 dBA, STI < 0.2 externally |
| Town hall (≥ 120 m²)             | Dedicated acoustic study, likely reinforcement + variable absorption |

**Red flag noted by Reviewer on the Lumen test-fit** : café 260 m² +
town hall 120 m² + lounge tampon forms a **> 300 m² ouvert continuum**
→ désenfumage mandatory (see `design://erp-safety`) AND acoustic
coherence across a long reverberant space. Plan for :

- Continuous Class A ceiling (αw ≥ 0.90)
- Intermediate acoustic baffles (Ambius, Abstracta, Kvadrat baffles)
  every ~4 m at ceiling height
- Carpet in the lounge tampon, hard finishes (wood) in café
- Sound masking ≈ 45 dBA during working hours, off during events

---

## Sources (deduplicated)

- AFNOR — [NF S 31-080 catalogue entry](https://www.boutique.afnor.org/en-gb/standard/nf-s31080/acoustics-offices-and-associated-areas-acoustic-performance-levels-and-crit/fa142103/740)
- AFNOR — [NF S 31-199 catalogue entry](https://www.boutique.afnor.org/en-gb/standard/nf-s31199/acoustics-acoustic-performance-of-openplan-offices/fa158972/1549)
- AFNOR news — [NF S31-199 open space](https://www.afnor.org/en/news/health-and-safety-at-work/acoustics-nf-s31-199-open-space/)
- Acoucibe — [Le standard NF S 31-080 pour les bureaux](https://acoucibe.fr/article-le-standard-nf-s-31-080-pour-les-bureaux-124)
- INRS — [Approche complète NF S 31-199 (Le Muet, PDF)](https://www.inrs.fr/dam/jcr:bc4ee98a-a68a-41b8-aebb-9ee87bf69d66/2-presentation-LeMuet-Chevret.pdf)
- Orosound — [AFNOR takes on noise in open-plan offices](https://www.orosound.com/afnor-noise-open-plan-offices/)
- Carsat Hauts-de-France — [Bruit et bureaux (PDF)](https://carsat-hdf.fr/files/live/sites/carsat-hdf/files/PDF/entreprises/Par%20risques/Risques%20non%20sp%C3%A9cifiques/hdf-Risques%20physiques_bruit_1.pdf)
- ISO — [ISO 3382-3:2022 sample (PDF)](https://cdn.standards.iteh.ai/samples/77437/ce295b70a7b048509514492c8e2dffe2/ISO-3382-3-2022.pdf)
- Odeon — [ISO 3382-3 Open plan offices (PDF)](https://odeon.dk/pdf/Application_note_ISO-3382-3_Offices.pdf)
- MDPI — [Comfort Distance (rC) paper](https://www.mdpi.com/2076-3417/11/10/4596)
- Apex Acoustics — [ISO 3382-3: necessary but not sufficient (PDF)](https://www.apexacoustics.co.uk/images/News/PDF/apex-acoustics-open-plan-office-acoustics-iso-3382-3-necessary-but-not-sufficient-a-new-approach-ioa-2019_p37.pdf)
- PubMed — [Hongisto 2005 model](https://pubmed.ncbi.nlm.nih.gov/16268835/)
- ICBEN — [Hongisto task performance (PDF)](https://www.icben.org/2008/PDFs/Hongisto_et_al.pdf)
- Indoor Air / Wiley — [Haapakangas et al. 2020 revised model](https://onlinelibrary.wiley.com/doi/abs/10.1111/ina.12726)
- Biamp — [Sound Masking vs White vs Pink Noise](https://www.biamp.com/company/blog/details/biamp-blog/2024/11/07/sound-masking-versus-white-noise-and-pink-noise---know-the-differences)
- Cambridge Sound — [Optimum Masking Sound: White or Pink? (PDF)](https://cambridgesound.com/wp-content/uploads/2013/02/Color-of-Noise.pdf)
- Commercial Acoustics — [Sound Masking 101](https://commercial-acoustics.com/guides/sound-masking-101/)
- Framery — [Framery One tech specs](https://framery.com/en-us/office-pods-and-booths/framery-one/tech-specs/)
- Chalmers — [Evaluation of masking sounds in open-plan office (PDF)](https://publications.lib.chalmers.se/records/fulltext/212702/212702.pdf)
- IWBI — WELL Building Standard v2 Sound concept `[À VÉRIFIER current v2 pilot]`
