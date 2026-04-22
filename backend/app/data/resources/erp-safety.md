---
uri: design://erp-safety
title: ERP type W — fire safety envelope for offices
audience: interior architect, space planner
last_updated: 2026-04-22
scope: >
  Programming-level constraints from the French ERP fire-safety regime as it
  applies to offices. Detailed design compliance is the responsibility of the
  bureau de contrôle; this file exists so that early programming decisions
  don't collide with the regulation.
---

# ERP type W — safety envelope

**Legal base** : Règlement de sécurité contre les risques d'incendie et de
panique dans les établissements recevant du public. ERP type W covers
**administrations, banks and offices** (Chapitre XI / XII selon édition,
articles W 1 – W 16 / W 41).

## 1. Definition and category

Type W is attributed to any premises whose primary activity is administrative
or banking work open to the public. Category (1 to 5) is determined by the
total effectif (public + staff) :

| Category | Effectif (pub + staff)   | Typical situation               |
|----------|--------------------------|---------------------------------|
| 1        | > 1 500                   | HQ tours, tertiary complexes    |
| 2        | 701 – 1 500              | Large offices                   |
| 3        | 301 – 700                | Medium offices                  |
| 4        | ≤ 300                     | Small to medium offices         |
| 5        | Below thresholds          | Smallest — simplified regime    |

## 2. Effectif computation

If the owner's declared headcount is unavailable, the default is :

- **1 person / 10 m²** in specially arranged indoor areas (halls, counters,
  waiting rooms)
- **1 person / 100 m²** of floor surface in non-specially arranged areas

For a 2 400 m² plateau treated as 30 % "arranged" (reception, café, town
hall) and 70 % "non-arranged" office floor :

- Arranged : 720 m² / 10 = **72 persons**
- Non-arranged : 1 680 m² / 100 = **17 persons**
- **Declarative effectif from headcount supersedes** both if available.

Always cross-check against the real declared occupancy — Lumen's 120 FTE
scenario (§ `design://office-programming`) pushes the site into **Category 4**.

## 3. Mandatory exits and evacuation

- **At least two distinct and secure exits** per storey accessible to the
  public.
- **Dégagements accessoires** : additional exits required beyond certain
  effectif thresholds — consult articles CO 35 – CO 50 for the exact rule.
- **Clear exit width** : ≥ 0.90 m per unit of passage (UP). Required number
  of UPs scales with effectif :
  - 1 – 19 persons : 1 UP (0.90 m)
  - 20 – 50 persons : 1 UP (0.90 m) or 2 UP (1.40 m) `[À VÉRIFIER seuils
    exacts CO 38]`
  - 51 – 100 persons : 2 UP (1.40 m)
  - beyond : 1 UP added per tranche de 100 persons supplémentaires

### Travel distance to an exit

- ≤ **40 m** to nearest exit from any point of a storey (single direction)
- ≤ **30 m** if the path is a dead-end (cul-de-sac) `[À VÉRIFIER]`
- Every point of the building must be within reach of ≥ 2 independent paths
  when the effectif of the concerned zone exceeds 50 persons `[À VÉRIFIER
  seuil exact]`

## 4. Fire alarm and detection by category

- **Category 1 & 2** : fire-safety system (SSI) of category C, D or E with
  alarm equipment **type 2b**
- **Category 3** : alarm **type 3**
- **Category 4** : alarm **type 4**
- Communication with firefighters required in all establishments (article
  MS 70)

Type 4 alarm is a simple manual call point + sounder. Type 2b adds automatic
detection in circulations and a centralised panel. The jump from 4 → 2b is a
material cost driver.

## 5. Extinguishers

- Portable water-spray extinguishers ≥ **6 litres**, judiciously distributed.
- **Minimum 1 per 200 m²** of floor.
- Maximum travel distance to an extinguisher : **15 m**.
- CO₂ extinguishers near electrical risks (server rooms, main boards).

## 6. Compartmentation and désenfumage

- **Compartment** : floors above **8 m** high require compartmentation of
  the surface into zones ≤ 500 m² `[À VÉRIFIER seuils exacts]`.
- **Désenfumage (smoke extraction)** :
  - Circulations > 30 m long require natural or mechanical smoke extraction.
  - Open-plan areas > 300 m² require désenfumage (either SHEV in natural
    smoke extraction or mechanical extraction + make-up air) `[À VÉRIFIER
    seuils DH 1 – DH 44]`.

## 7. Finishing materials — reaction to fire classification

All interior finishes must be classified against the **Euroclasses**
(EN 13501-1) :

| Location                | Min. classification     |
|-------------------------|-------------------------|
| Walls in circulations   | **B-s2, d0** (ex-M1)    |
| Ceilings in circulations| **B-s2, d0**            |
| Floor in circulations   | **Cfl-s1**              |
| Walls in rooms          | **C-s3, d0** (ex-M2)    |
| Textiles in seating     | **M1 / B-s1, d0**       |

## 8. Key CO articles to read in detail

- **CO 35 – CO 39** : number, width, distribution of exits
- **CO 49** : dead-end paths
- **DF 1 – DF 4** : smoke-control systems
- **DH 1 – DH 44** : désenfumage (if applicable)
- **MS 15 – MS 75** : fire-fighting means
- **AS 1 – AS 9** : alarm systems

## 9. Practical planning consequences

- **Town hall / event** areas that push the effective occupancy into the
  next category drive the alarm type and compartment strategy. Size these
  rooms with the category cliff in mind.
- **Dead-end corridors** longer than ~10 m are a common planning mistake;
  prefer loops or drive-through circulations.
- **Escaliers encloisonnés** : every internal stair connecting two served
  levels must be enclosed in a fire-rated volume with self-closing
  fire-rated doors (e.g. EI 30 – EI 60 depending on the layout). Open
  "design" stairs between levels require a regulatory dispensation.

## Sources

- Légifrance — [Chapitre XI : Etablissements du type W (Art. W 1 – W 16)](https://www.legifrance.gouv.fr/codes/section_lc/JORFTEXT000000290033/LEGISCTA000020336387/)
- Légifrance — [Chapitre XII : Etablissements du type W (Art. W 1 – W 41)](https://www.legifrance.gouv.fr/codes/section_lc/JORFTEXT000000441635/LEGISCTA000020274387/)
- URA — [Réglementation type W (synthèse)](https://www.ura.fr/reglementation/reglementation-type-w)
- SiteSecurite — [Type W, articles W 11 à W 16 commentés](https://sitesecurite.com/contenu/_erp/erpw/w11a16.php)
- Batiss — [Règlement Sécurité ERP type W, édition 30 juin 2017 (PDF)](https://batiss.fr/content/uploads/rglt-secu-30juin2017/typew.pdf)
- EN 13501-1 — classification Euroclasses des matériaux `[À VÉRIFIER édition en vigueur]`
