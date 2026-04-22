---
uri: design://office-programming
title: Office programming — ratios, surfaces, densities
audience: interior architect, space planner, test-fit broker
last_updated: 2026-04-22
scope: >
  Reference numbers for translating a functional program (headcount,
  collaboration intensity, flex policy) into a surface budget (m² utiles).
---

# Office programming reference

This document is the single source of truth for m²/person ratios, space-type
shares, and density targets used when turning a client brief into a functional
program. Every number either cites a verifiable benchmark or is marked
`[À VÉRIFIER]`.

## 1. Net internal area (NIA, "surface utile") per workstation

The classic planning envelope for office buildings in Europe and North America
is **10 – 15 m² NIA per workstation**, all programmed uses included (circulation
inside the NIA, collaboration, support, but excluding core, elevators, loading
docks, technical risers).

| Archetype                          | NIA / workstation | Notes                                                 |
|------------------------------------|-------------------|-------------------------------------------------------|
| Dense open office (pre-COVID)      | 8 – 10 m²         | High density; often degraded Leesman noise scores     |
| Typical French Cat B fit-out       | 10 – 12 m²        | `[À VÉRIFIER via bench client]`                       |
| Activity-based / hybrid (2024)     | 12 – 15 m²        | Post-COVID shift to more collab and amenity space     |
| Premium HQ                         | 15 – 18 m²        | Heavy amenity, events, wellbeing                      |

## 2. Functional program split (activity-based working)

For an activity-based workplace, a common split of the NIA is:

- **Individual work** (assigned + flex desks, focus rooms, phone booths) : 45 – 55 %
- **Collaboration** (meeting rooms, project rooms, huddle, town hall) : 20 – 30 %
- **Support & amenities** (café, print, storage, lockers, wellness) : 15 – 25 %
- **Circulation inside NIA** (informal meeting, pass-through) : 10 – 15 %

These are working ranges; the exact split depends on the flex ratio (§4), the
collaboration intensity declared in the brief, and the presence of
client-facing functions (reception, showroom, demo).

## 3. Meeting room mix — rule of thumb

Per 100 employees in a collaborative organisation (pair programming, design
sprints, product teams), a workable starting mix is:

| Room type          | Capacity | Count / 100 pax | Typical footprint |
|--------------------|---------|-----------------|-------------------|
| Phone booth (1p)   | 1       | 6 – 10          | 1 – 1.5 m²        |
| Huddle             | 2 – 4   | 3 – 5           | 6 – 10 m²         |
| Medium meeting     | 6 – 8   | 2 – 4           | 18 – 25 m²        |
| Large / boardroom  | 10 – 14 | 1 – 2           | 30 – 45 m²        |
| Town hall / event  | 40+     | 1               | 80 – 150 m²       |

Ratios above are a planning heuristic consistent with industry guidance.
Calibrate against Leesman "Informal, unplanned meetings" scores for the client
(at Leesman population average, 52 % of employees cite this activity as
important to their role).

## 4. Flex ratio (desk-sharing) — current industry state

Source : **Leesman 2024 data summary** (Lmi benchmark) and **FlexOS 2024** /
industry operator reports.

- Share of organisations with >40 % of population desk-sharing : **69 %**
  `[À VÉRIFIER source exacte FlexOS / JLL, la fourchette est cohérente avec les reports publics 2024]`
- Target ratio 1.01 – 1.49 pers/seat : **48 % des entreprises en 2025**
  (vs 21 % en 2024, donc forte accélération)
- Ratios ≥ 1.5 pers/seat : **+93 % depuis 2023**
- Dedicated desks dropped from **51 % (2021) → 40 % (2024)**
- Global office utilisation : **54 % en 2025**, 49 % en 2024, 41 % en 2023,
  pre-pandemic baseline 61 %.

**Planning implication** : for a hybrid-first brief, assume a flex ratio of
**0.7 – 0.8 seats per FTE** unless the brief explicitly pushes for assigned
seats. Validate by modelling peak-day occupancy at 1.1 – 1.3 × average.

## 5. Workplace experience benchmarks (Leesman Lmi)

- Leesman Index average **Lmi = 69.5 in 2024** (up from 64.3 in 2019)
- Leesman+ **Excellent** : Lmi 70.0 – 79.9
- Leesman+ **Outstanding** : Lmi ≥ 80.0
- Home-working index **H-Lmi 2024 = 79.5** (10 points higher than office Lmi)
- Persistent pain points (% satisfied) :
  - Noise levels : **35 %**
  - Quiet rooms : **40 %**
  - Temperature control : **41 %**
  - Plants and greenery : **47 %**
- Positive drivers :
  - Informal unplanned meetings valued by **52 %**
  - **73 %** say the office supports idea-sharing

These numbers are the baseline against which the client's current office
should be measured if a Leesman survey exists; they also identify the classic
programming levers : acoustic treatment (§ `design://acoustic-standards`),
quiet-room count (§3), biophilia (§ `design://biophilic-office`), climate.

## 6. French regulatory envelope (ERP type W)

Offices are classified as **ERP type W** in the French fire-safety system.
For programming purposes this drives two early decisions (details in
`design://erp-safety`) :

- **Effectif** : occupancy is computed from the declared headcount OR, as a
  default, at 1 pers / 10 m² (specially arranged indoor areas) or
  1 pers / 100 m² (non-arranged floor area).
- **Issues de secours** : at least two distinct and secure exits.
- **Category** drives the fire-alarm system level (1st/2nd category → type
  2b alarm, 3rd → type 3, 4th → type 4).

For accessibility (PMR), any programme has to respect the
**arrêté du 20 avril 2017** — principal doors serving zones of ≥ 100 persons
have a minimum useful clear width of **1.40 m**. See `design://pmr-requirements`.

## 7. Lighting envelope

- **Code du travail R. 4223-4** sets a **minimum** of 120 lux for work spaces,
  200 lux for offices with no natural light.
- **NF EN 12464-1** specifies **500 lux at the task area** for typical office
  work, with context modifiers raising to 750 lux for workers aged 50+ or for
  fine detail work.

See `design://ergonomic-workstation` for the full lighting and ergonomics
envelope.

## Sources

- Leesman Index — [Redefining the workplace: Why employee experience matters](https://www.leesmanindex.com/articles/redefining-the-workplace-why-employee-experience-matters/)
- Leesman Index — [The workplace why](https://www.leesmanindex.com/articles/the-workplace-why/)
- Gensler — [Global Workplace Survey 2024](https://www.gensler.com/gri/global-workplace-survey-2024) — 16 040 employees, 15 countries, fieldwork Oct 2023 – Jan 2024
- FlexOS — [The Optimal Desk Sharing Ratio for Your Hybrid Office in 2024](https://www.flexos.work/learn/the-optimal-desk-sharing-ratio-for-your-hybrid-office)
- Légifrance — [Arrêté du 20 avril 2017, accessibilité ERP](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000034485459)
- Légifrance — [Code du travail, R. 4223-1 à R. 4223-12 (Éclairage)](https://www.legifrance.gouv.fr/codes/id/LEGISCTA000018532273)
- Légifrance — [ERP type W — Chapitre XI, articles W 1 à W 16](https://www.legifrance.gouv.fr/codes/section_lc/JORFTEXT000000290033/LEGISCTA000020336387/)
