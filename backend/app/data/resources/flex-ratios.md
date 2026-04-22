---
uri: design://flex-ratios
title: Flex ratios & desk-sharing policies
audience: interior architect, space planner, workplace strategist
last_updated: 2026-04-22
scope: >
  Quantitative reference for sizing a desk pool under a hybrid policy. Combines
  published 2023-2025 industry data with sizing heuristics used in practice.
---

# Flex ratio reference

Flex ratio = **number of seats / number of FTEs**. A ratio of 0.7 means
7 seats per 10 people (3 are expected remote or mobile on peak day).

## 1. Industry state (2024 – 2025)

Source data from FlexOS 2024 analysis, Ronspot 2026 report, CBRE hybrid
reality brief, and Leesman 2024 :

- **69 %** of real-estate clients have > 40 % of their population sharing
  desks (FlexOS 2024)
- **48 %** of organisations target a sharing ratio between **1.01 and 1.49
  pers/seat** in 2025 (up from 21 % in 2024, a substantial acceleration)
- Ratios **≥ 1.5 pers/seat** have grown **+93 %** since 2023
- Share of **dedicated desks** dropped from **51 % (2021) → 40 % (2024)**
- **Global occupancy rate 111 %** in 2025 (more allocated people than seats),
  up from 101 % in 2024
- **Global office utilisation rate** : **54 %** in 2025, 49 % in 2024, 41 %
  in 2023; pre-pandemic baseline 61 %
- **Only 22 %** of employees work full-time in an office while **67 %** of
  firms offer location flexibility

## 2. Sizing a seat pool — method

### 2.1 Derive the target sharing ratio

Start from the declared presence policy :

| Presence policy                    | Average presence | Peak day factor | Target ratio (seats/FTE) |
|------------------------------------|------------------|-----------------|--------------------------|
| 5/0 (full on-site)                 | ~95 %            | 1.0             | **≥ 1.0**                |
| 4/1                                | ~80 %            | 1.15            | **0.90 – 0.95**          |
| **3/2 (hybrid standard, Lumen)**   | ~60 %            | 1.25            | **0.70 – 0.80**          |
| 2/3                                | ~40 %            | 1.30            | **0.55 – 0.65**          |
| 1/4 or fully flexible              | ~20 – 30 %       | 1.40            | **0.40 – 0.55**          |

The **peak day factor** captures the fact that on in-person-heavy days (often
Tuesday–Thursday) utilisation spikes well above the average. Seats must
absorb the peak, not the average, unless the client accepts that some
employees must hot-desk in a café or at home on peak days.

### 2.2 Lumen case — worked example

Lumen brief (§ `design://office-programming`) : 120 FTE today, 170 FTE within
24 months, **3/2 policy**, collaborative culture.

- Target range : **0.70 – 0.80 seats/FTE**
- At 170 FTE horizon :
  - 0.70 ratio → **119 seats**
  - 0.80 ratio → **136 seats**
- Peak day model @ 0.75 : average presence 102, peak presence ~128 (1.25 × )
  → choose 130 seats and live with some peak-day borrowing, or 136 seats for
  comfortable headroom

This leaves **~34 persons-worth** of surface freed vs a 1.0 assigned model —
for 170 × 11 m² NIA baseline, that's **~370 m²** reallocated to
collaboration, focus rooms, and amenities. Keep this number in the client
conversation; it's the single biggest lever on the programme.

## 3. Assigned vs unassigned — the three doctrines

| Model            | Description                                         | When it fits                                           |
|------------------|-----------------------------------------------------|--------------------------------------------------------|
| **Assigned**     | Every FTE has a named seat                          | 5/0 policy, confidential/regulated work, high seniority expectation |
| **Neighbourhood**| Assigned **to a team zone**, unassigned **inside**  | 3/2 or 4/1, strong team identity, product orgs        |
| **Fully unassigned (activity-based)** | Any seat, any day; booked via app         | 2/3 or lower, mobile sales, consulting, client-facing |

Lumen's "strong identity per team" clause (brief section 5) argues for the
**neighbourhood** model, not fully unassigned. Each team gets a quartier with
pinned assets (kit, monitors, whiteboards, mascot) and a 0.75 ratio inside
the quartier.

## 4. Flex infrastructure requirements

Flex works only with supporting infrastructure :

- **Booking system** (Joan, Robin, Envoy, OfficeSpace) with real-time display
  at each seat
- **Locker bank** : one locker per FTE, ideally with asset-tagged RFID or
  pin access. Plan 0.3 – 0.5 m² per 10 lockers including circulation.
- **Arrival / goodbye rituals** : hot-desk-ready monitor, clean-desk policy
  visibly enforced
- **Concentration supply** : ≥ 6 phone booths / 100 FTE and ≥ 4 quiet rooms
  / 100 FTE, because the removed seat headroom is partly offset by higher
  collab demand
- **Café / lounge as third working place** : typically 15 – 25 % of programme

## 5. Pitfalls to avoid

- **Ratio too aggressive early** : start at 0.80 and tighten over 18 – 24
  months with real utilisation data. A ratio of 0.60 from day one without
  infrastructure produces a visible anti-office backlash.
- **Neighbourhoods that don't match team shape** : a 12-person team in a
  10-seat neighbourhood forces members elsewhere; size to **peak-team at
  ratio**, not headcount at average.
- **Ignoring peak day** : averaging across the week hides the Tuesday pain.
  Always model at peak.
- **Removing dedicated desks without removing desk work** : if 40 % of the
  work is still long-form solo focus, a 0.60 ratio does not survive. Track
  work typology, not just headcount.

## 6. Forecast guidance

- Occupancy and utilisation metrics (54 % utilisation in 2025 vs 61 %
  pre-pandemic) suggest the ratio landing zone will tighten further over
  2025 – 2027.
- Leesman H-Lmi of 79.5 (vs office Lmi 69.5) confirms the office has to
  **offer something the home doesn't** — collaboration, serendipity,
  amenities. Flex space freed by lower ratios should primarily fund that
  premium, not be claimed back as "saved real estate".

## Sources

- FlexOS — [The Optimal Desk Sharing Ratio for Your Hybrid Office in 2024](https://www.flexos.work/learn/the-optimal-desk-sharing-ratio-for-your-hybrid-office)
- Ronspot — [The 2026 Workplace Statistics and Benchmarks Report](https://ronspotflexwork.com/blog/the-2026-workplace-statistics-and-benchmarks-report/)
- CBRE — [The Hybrid Reality: Why the Office Is More Important Than Ever](https://www.cbre.com/insights/articles/the-hybrid-reality-why-the-office-is-more-important-than-ever)
- OfficeRnD — [Determining the Ideal Office Space per Hybrid Employee (2024)](https://www.officernd.com/blog/amount-of-office-space-per-hybrid-employee/)
- OfficeSpace — [Hybrid Work in 2024 | 10 Important Statistics](https://www.officespacesoftware.com/blog/hybrid-work-statistics-2024/)
- Leesman Index — [Redefining the workplace — Lmi and H-Lmi benchmark discussion](https://www.leesmanindex.com/articles/redefining-the-workplace-why-employee-experience-matters/)
- 2727 Coworking — [Shared Office Landscape: 2025 Post-COVID Trends & Data](https://2727coworking.com/articles/shared-office-trends-2025)
