# design://adjacency-rules

> Catalogue of spatial-adjacency rules for office fit-out. Consumed by
> the `adjacency_validator` agent in Design Office's Level 2 + Level 2b
> orchestration (`backend/app/agents/orchestrator.py`). Every rule
> carries a stable `rule_id` so violations surface as structured data
> the frontend can link to.
>
> Sources are cited inline. Numeric thresholds follow WELL v2,
> BREEAM UK 2018 New Construction, NF S 31-080 (2006) and
> peer-reviewed workplace-acoustics literature (Hongisto, Banbury,
> Haapakangas). Where a source gives a range, the stricter bound is
> used — space planners can always relax but not tighten.

## 0. How this resource is consumed

The `adjacency_validator` agent receives :

- the retained floor-plan (envelope + cores + façades + stairs),
- the macro-zoning variant being reviewed (typed zones with bboxes),
- optionally a micro-zoning drill-down.

It emits an `AdjacencyAudit` (see `backend/app/models.py`) with:

- `score` (0–100, weighted by rule severity),
- `violations[]` — each a `{ rule_id, severity, zones, description, suggestion, source }`,
- `recommendations[]` — non-blocking improvements.

Severity weights for the score :
- `critical` → −25
- `major` → −10
- `minor` → −4
- `info` → −1
A variant with no violations scores 100. Minimum floor is 0.

---

## 1. Acoustic adjacencies

Open-plan desks exposed to intelligible speech lose 10–15 % cognitive
performance on reading-comprehension and short-term-memory tasks
(Banbury & Berry 1998, 2005; Haapakangas et al. 2021). Adjacency
planning is the cheapest intervention : separation distance + buffer
programming beats treatment alone.

### Rule `acoustic.open_desks_next_to_boardroom`

- **Statement** : no cluster of open-plan workstations shares a wall
  with a boardroom, client meeting room or training room (speech
  source ≥ 65 dB(A), LAeq).
- **Buffer required** : at least one of — partition to ceiling with
  Rw ≥ 45 dB (WELL Feature S02), a corridor ≥ 1.80 m, a storage wall,
  or a focus-room strip.
- **Severity** : major.
- **Source** : WELL Building Standard v2 — Feature S02 (Sound
  Mapping) ; NF S 31-080 (2006) category "espace de bureau — ouvert".

### Rule `acoustic.phone_booths_cluster_must_buffer_open_desks`

- **Statement** : phone-booth clusters (≥ 3 booths back-to-back)
  placed inside an open-plan area must sit ≥ 2.5 m from the nearest
  desk, or be grouped against a partition wall.
- **Severity** : minor (major if the cluster opens directly onto a
  desk aisle narrower than 1.40 m).
- **Rationale** : door-cycle noise + speech-leak on opening. Steelcase
  WorkSpace Futures "The Privacy Crisis" (2014) — 95 % of employees
  identify unscheduled interruptions as the main productivity drag.

### Rule `acoustic.quiet_room_min_distance_from_hospitality`

- **Statement** : dedicated focus rooms / library / reading corners
  must be ≥ 8 m (or behind 2 partitions with Rw ≥ 40 dB each) from
  coffee points, printers, break-out kitchens, kitchenettes.
- **Severity** : major.
- **Source** : Hongisto 2005 — speech-intelligibility model ; WELL
  Feature S03 maximum-noise-levels table (kitchen area LAeq ≤ 55 dB).

### Rule `acoustic.training_room_not_adjacent_to_focus`

- **Statement** : training rooms, pitch rooms, podcast booths must
  not share a wall with focus rooms, phone booths, meditation rooms.
  Impulse-noise exposure (applause, laughter) breaks deep-work flow.
- **Severity** : major.
- **Source** : Banbury & Berry 2005 ; BREEAM Hea 05 (Acoustic
  performance).

### Rule `acoustic.printer_reprography_buffer`

- **Statement** : print / reprography / scan alcoves must be
  ≥ 6 m from the nearest focus room or individual desk, and must sit
  on a circulation spine (never inside a team neighbourhood).
- **Severity** : minor.
- **Source** : NF S 31-080 recommends ≥ 6 m from occupied positions
  for equipment with LpA ≥ 55 dB at 1 m.

---

## 2. Circulation and flow adjacencies

Movement paths determine the psychological map of the floor. "Eye
lines" (Gensler 2022 U.S. Workplace Survey, p. 14) correlate with
perceived productivity more strongly than desk density.

### Rule `flow.toilets_not_adjacent_to_brainstorm`

- **Statement** : W.C. blocks must not share a wall, door or direct
  eye-line with brainstorming / design-sprint / war rooms.
- **Rationale** : door-cycle noise, hand-dryer impulsive noise,
  odour leak, concentration breakage.
- **Severity** : major.
- **Source** : Leesman Index 2022 — toilet-proximity complaints rank
  3rd among space-satisfaction drivers.

### Rule `flow.toilets_not_adjacent_to_hospitality`

- **Statement** : W.C. blocks must not share an entrance corridor
  shorter than 4 m with a café, pantry, kitchenette, dining area.
- **Severity** : major (critical if the café door faces the WC door
  directly within 3 m).
- **Source** : French "code du travail" R. 4228-10 (good practice,
  not a hard rule) ; FM Global hygiene guideline.

### Rule `flow.reception_linked_to_boardroom_corridor`

- **Statement** : reception must reach the visitor-facing boardroom
  or client meeting rooms without passing through open-desk areas or
  private team zones.
- **Severity** : minor (major for regulated-industry clients — law,
  bank, healthcare).
- **Source** : Steelcase "Guest Experience in the Hybrid Office"
  (2023).

### Rule `flow.primary_circulation_width`

- **Statement** : the main circulation spine must be ≥ 1.80 m clear
  width, secondary aisles ≥ 1.40 m (PMR), dead-end aisles ≤ 10 m
  before reaching a cross-aisle.
- **Severity** : critical for < 1.40 m ; major for 1.40–1.60 m main
  spine ; minor for 1.60–1.80 m main spine.
- **Source** : French Arrêté du 8 décembre 2014 (accessibility for
  ERP) ; see also `design://pmr-requirements`.

### Rule `flow.hub_activity_zone_at_entrance`

- **Statement** : the first 10–15 m behind the reception should host
  "energetic" programs — café, town-hall stair, showroom, project
  gallery — not private or high-focus programs.
- **Severity** : info (preferred, not blocking).
- **Source** : MoreySmith thesis on "arrival choreography" ;
  Gensler 2022 Workplace Survey — "choice architecture".

---

## 3. Privacy and confidentiality adjacencies

Some programs REQUIRE buffered access. Ignoring this is an HR,
compliance and trust failure. WELL Feature M07 (Enhanced Access to
Nature) is loosely adjacent — daylight is not a privacy driver.

### Rule `privacy.hr_office_not_on_public_corridor`

- **Statement** : HR offices and HR conversation rooms must be on a
  secondary corridor, behind a visual-privacy door, and out of direct
  sight of reception or the primary spine.
- **Severity** : major.
- **Source** : GDPR Article 32 (appropriate organisational measures
  for confidentiality) ; CIPD practitioner guidance.

### Rule `privacy.exec_suite_buffer`

- **Statement** : executive offices / partner offices / C-suite
  meeting rooms must be ≥ 2 partitions from the primary circulation
  and must not share a wall with open-desk clusters.
- **Severity** : minor (major for law / bank / consulting sectors).
- **Rationale** : speech-privacy class under ASTM E2638 ≥ 80
  (confidential speech) requires STC ≥ 48 + masking ; easier to
  achieve with a buffer zone.

### Rule `privacy.finance_legal_compliance_cluster`

- **Statement** : finance, legal and compliance teams must be grouped
  together, away from visitor paths, ideally behind a badged door.
- **Severity** : minor, sector-dependent.
- **Source** : Deloitte "Future of the Financial Workplace" 2021 ;
  Gensler Legal Benchmark.

### Rule `privacy.wellness_room_discretion`

- **Statement** : wellness / prayer / lactation rooms must have a
  discreet approach (not facing reception, not on the main café
  corridor) AND be signposted from a neutral corridor.
- **Severity** : major.
- **Source** : WELL Feature M07 (Restorative Spaces) ; US PUMP Act
  2022 for lactation rooms.

---

## 4. Daylight and orientation adjacencies

Daylight access improves sleep quality and alertness (Boubekri et
al. 2014) and is the single strongest Leesman satisfaction driver
for under-35s.

### Rule `daylight.focus_rooms_off_facade`

- **Statement** : enclosed focus rooms and single-person offices
  should sit behind the first row of windows, not on the façade —
  daylight belongs to the shared desk areas first.
- **Severity** : info.
- **Source** : Leesman Index 2022 — "natural light" is #1 ranked
  feature ; HOK Workplace Strategy 2021.

### Rule `daylight.deep_focus_desks_not_glare_zone`

- **Statement** : deep-focus desk clusters must sit ≥ 4 m from
  clear-glazed façades without shading, to avoid direct-sun glare
  on screens between 10 h and 16 h local time.
- **Severity** : minor.
- **Source** : BREEAM Hea 01 (Visual comfort) ; WELL Feature L03
  (Circadian Lighting Design).

### Rule `daylight.meeting_rooms_can_take_façade`

- **Statement** : mid-sized meeting rooms ARE allowed to occupy
  façade positions when the client explicitly values daylight in
  collaboration ceremonies (design sprints, reviews).
- **Severity** : info (preferred behaviour, not a violation to break).
- **Source** : Gensler Design Forecast 2023.

### Rule `daylight.north_façade_for_creative_studios`

- **Statement** : photography studios, physical model-making areas,
  art walls benefit from indirect north-façade light (northern
  hemisphere).
- **Severity** : info.
- **Source** : classical studio-design literature.

### Rule `daylight.south_façade_street_noise_penalty`

- **Statement** : if the south (or street-facing) façade logs
  exterior LAeq ≥ 65 dB(A) during the day, open-focus desks on that
  façade need operable shading + double-glazing Rw ≥ 37 dB OR should
  be relocated inland.
- **Severity** : major.
- **Source** : NF S 31-080 ; PEB / HQE guidance.

---

## 5. ERP safety adjacencies

ERP type W (French office classification) hard constraints. Non-
negotiable — any violation scores `critical`.

### Rule `erp.egress_path_not_blocked`

- **Statement** : primary and secondary egress paths (exit signs,
  staircases, emergency exits) must remain clear width ≥ 1.40 m with
  NO furniture, planters, bins inside the path.
- **Severity** : critical.
- **Source** : Arrêté du 25 juin 1980 (ERP type W) ; CO 35/36.

### Rule `erp.max_travel_distance_to_exit`

- **Statement** : any occupied position must be ≤ 30 m from a
  compartmentalised egress (40 m for single-direction corridors).
- **Severity** : critical.
- **Source** : Arrêté du 25 juin 1980, CO 40.

### Rule `erp.dead_end_aisle_max_10m`

- **Statement** : dead-end aisles (cul-de-sac) are limited to 10 m
  beyond the nearest cross-aisle.
- **Severity** : major.
- **Source** : Arrêté du 25 juin 1980, CO 36.

### Rule `erp.desenfumage_not_blocked`

- **Statement** : smoke-extraction vents (désenfumage) must not be
  blocked by partitions, storage walls or enclosed rooms added in
  Cat B fit-out.
- **Severity** : critical.
- **Source** : Instruction technique 246 (IT 246).

---

## 6. Programme zoning — calm vs energy

The macro-zoning rule of thumb (Steelcase WorkSpace Futures, Gensler
Workplace Survey 2022) is a graded gradient : the floor should feel
like a continuous volume moving from `hospitality → social collab →
team neighbourhoods → deep focus`, not a patchwork of unrelated
islands.

### Rule `zoning.calm_energy_gradient`

- **Statement** : deep-focus zones (focus rooms, library, quiet
  lounge) should sit at the opposite end of the floor from
  hospitality and all-hands zones — not adjacent.
- **Severity** : minor.
- **Source** : Steelcase Global Report "Engagement and the Global
  Workplace" 2016 ; Leesman Index 2022.

### Rule `zoning.team_neighbourhood_has_own_gravity`

- **Statement** : each team neighbourhood ≥ 12 people must host its
  own huddle + 1 phone booth + 1 informal meeting nook WITHIN the
  neighbourhood boundary — "zero-walk" adjacency for common
  interactions.
- **Severity** : minor.
- **Source** : Gensler 2022 p. 18, "proximity effects on
  collaboration" ; HOK Workplace Strategy 2021.

### Rule `zoning.social_hub_central_not_peripheral`

- **Statement** : the main café / hub / town-hall stair must occupy
  a central or strongly-visible position — not a peripheral room.
  Lumen's brief explicitly states this ("cafétéria centrale pas
  reléguée").
- **Severity** : major for a brief that calls it out ; minor
  otherwise.
- **Source** : IDEO "Social Density" ; MoreySmith case studies.

### Rule `zoning.brand_expression_on_visitor_path`

- **Statement** : brand-expression spaces (showroom, wall gallery,
  history corridor) should sit on the visitor path from reception to
  meeting rooms — not hidden behind the operations zone.
- **Severity** : info.
- **Source** : Saguez & Partners case studies.

---

## 7. Micro-zoning adjacencies (within a zone)

Used at the `/testfit?tab=micro` drill-down, on top of the macro
rules above.

### Rule `micro.desk_cluster_face_to_face_acoustic`

- **Statement** : face-to-face desk clusters ≥ 6 positions must have
  a mid-desk screen (H ≥ 1 450 mm, NRC ≥ 0.7) or an acoustic canopy
  above the cluster.
- **Severity** : minor.
- **Source** : NF EN ISO 23351-1 (speech-level reduction of
  screens) ; Steelcase desk-screen guidance.

### Rule `micro.huddle_door_not_onto_desk_aisle`

- **Statement** : huddle-room doors (4–6 pax) must not open directly
  onto a desk aisle — offset ≥ 1.20 m, or give onto a secondary
  corridor.
- **Severity** : minor.
- **Rationale** : 30 % of huddle-room sessions start or end with a
  standing conversation spilling into the aisle.

### Rule `micro.biophilic_zone_not_over_cabling`

- **Statement** : biophilic zones (planting islands, living walls)
  must not sit directly above a floor-box cluster, cable-tray run or
  server-room feed.
- **Severity** : minor.
- **Source** : BREEAM Hea 07 — installation practicality.

### Rule `micro.phone_booth_in_focus_cluster_ratio`

- **Statement** : focus-cluster (≥ 8 desks) should carry 1 phone
  booth per 5 desks, not < 1 per 8.
- **Severity** : info.
- **Source** : Leesman Index 2022 — "place to concentrate" gap.

---

## 8. Wellness and inclusion adjacencies

### Rule `wellness.mothers_room_proximity_to_wc`

- **Statement** : the lactation / mother's room should be ≤ 30 m
  walking from the nearest W.C. AND not opening directly onto it.
- **Severity** : major.
- **Source** : PUMP Act 2022 ; WELL Feature M07.

### Rule `wellness.prayer_room_sightline_privacy`

- **Statement** : the prayer / multi-faith room must not be visible
  from a heavily-trafficked corridor or the café seating area.
- **Severity** : major.
- **Source** : CIPD practitioner guidance ; "Inclusive Design" RIBA
  2022 toolkit.

### Rule `wellness.rest_room_buffer_from_energy`

- **Statement** : nap / meditation rooms must be on the "calm" end
  of the calm-energy gradient (see `zoning.calm_energy_gradient`)
  AND not share a wall with a training room or phone-booth cluster.
- **Severity** : major.
- **Source** : WELL Feature M07 ; "The Case for Naps at Work"
  (Harvard Business Review 2019).

---

## 9. Scoring guidance

The validator should :

1. Walk every pair of adjacent zones (share a wall, share an aisle
   ≤ 3 m, or are on a direct ≤ 6 m line of sight) and evaluate each
   applicable rule. Non-applicable rules are silent.
2. Collapse duplicate violations (same rule, same zone pair) into one.
3. Weight by severity as noted in §0.
4. Clamp to `[0, 100]`.
5. Emit at most the 10 most impactful violations (severity desc, then
   alphabetical by rule_id) so the UI stays legible.
6. Add up to 3 `recommendations` — phrased as imperative sentences
   ("Move the HR room behind the finance cluster"), each ≤ 25 words.

---

## 10. Citations

- ASTM E2638-10 — Speech Privacy in Enclosed Rooms.
- Banbury S., Berry D.C. (1998, 2005) — Disruption of office-related
  tasks by speech and office noise. *British Journal of Psychology.*
- Boubekri M., Cheung I., Reid K., Wang C.-H., Zee P. (2014) — Impact
  of windows and daylight exposure on overall health and sleep
  quality of office workers. *Journal of Clinical Sleep Medicine.*
- BREEAM UK New Construction 2018 — Hea 01, Hea 05, Hea 07.
- Deloitte (2021) — Future of the Financial Workplace.
- French Arrêté du 25 juin 1980 (ERP type W) — articles CO, CH, GN.
- French Arrêté du 8 décembre 2014 (accessibility, ERP fit-out).
- Gensler U.S. Workplace Survey 2022 — "Choice and Experience".
- Haapakangas A., Hongisto V., Liebl A. (2021) — The relation
  between the acoustic environment and tasks performed in open-plan
  offices. *Building Acoustics.*
- HOK Workplace Strategy & Design 2021 benchmarks.
- Hongisto V. (2005) — A model predicting the effect of speech of
  varying intelligibility on work performance. *Indoor Air.*
- IT 246 — Instruction technique désenfumage ERP.
- Leesman Index 2022 — Global Workplace Report.
- NF EN ISO 23351-1 — Acoustics — Measurement of speech level
  reduction of furniture ensembles and enclosures.
- NF S 31-080 (2006) — Acoustique — Bureaux et espaces associés.
- PUMP Act 2022 (US) — Providing Urgent Maternal Protections for
  Nursing Mothers.
- Saguez & Partners, case studies (public presentations).
- Steelcase WorkSpace Futures — "The Privacy Crisis" (2014),
  "Engagement and the Global Workplace" (2016), "The Guest
  Experience in the Hybrid Office" (2023).
- WELL Building Standard v2 — Features S02, S03, L03, M07.
