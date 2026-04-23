# Client-awareness: a deep-dive index

Design Office adapts to the client's industry — not cosmetically but at
the level of **ratios, typology mix, materials, furniture, lighting, and
language**. This document indexes the three proof points, with concrete
numbers, fixture pointers, and the exact agent prompts / MCP resources
that drove the adaptation.

All three proofs were produced by the **same code paths** against the
same MCP resources and `ratios.json`. Only the **client brief text +
`client_industry` input** changed between runs.

---

## Proof 1 · Brief synthesis adapts at the top of the funnel

_Surface I · Brief · Level-1 orchestration (Effectifs + Benchmarks +
Contraintes + Consolidator)._

Two live runs, same prompts, same resources, same 3-agent fan-out +
consolidator.

| Signal | **Lumen** (tech startup) | **Altamont & Rees** (law firm) |
|---|---|---|
| Flex ratio | 0.75 seats / FTE | **1.0 seats / FTE**, argued as "a deliberate counter-trend position against the 2024-2025 industry drift" |
| Dedicated enclosed work | **0 m²** (open-plan first) | **1 090 m²** — 20 partner offices × 14 m² + 45 shared two-person associate offices |
| Café / town hall | Central café 260 m² + town-hall 120 m² | Staff café 120 m² + **tasting kitchen 50 m²** + **wine cellar 15 m²** (climate-controlled, off client path) |
| Boardrooms | 2 | **3 deposition-ready at DnT,A ≥ 45 dB** |
| Phone booths | 14 for 170 FTE | **10 for 160 FTE** — "most confidential calls happen inside offices" |
| Presence policy | 3/2 hybrid | **Near-full-onsite** (5/0 for partners + associates) |
| Library | — | **400 linear m of shelving**, 80 m², 6 reading seats |
| Epistemic honesty | — | `[TO VERIFY: exact named-partner count]`, `[TO VERIFY: target bottle capacity]`, `[TO VERIFY: dedicated PAs vs pool]` |

Same Effectifs + Benchmarks + Contraintes + Consolidator agents. Same
`office-programming.md`, `flex-ratios.md`, `pmr-requirements.md`,
`erp-safety.md`. Only the brief text changed and the Consolidator picked
up every industry signal.

Fixtures :

- **Lumen** — the fixture shipped in-app (see `LUMEN_BRIEF` in
  `frontend/src/routes/Brief.tsx` for the source text; the Level-1
  orchestration produces the programme at runtime)
- **Altamont** — `backend/tests/fixtures/altamont_brief_output.json`
  (89 k in / 16 k out / 52 KB, full 4-agent trace)

Regression guard :
`backend/tests/test_brief_manifest.py::test_live_altamont_brief_is_industry_adapted`
asserts the identity + "private partner office" + "wine cellar" +
"deposition" + "tasting kitchen" + near-1.0 flex + 4-agent trace +
token-budget shape.

---

## Proof 2 · Mood Board curator adapts per industry

_Surface III · Mood Board · Level-3 curator agent_.

Three live runs, same prompts, same `mood-board-method.md` +
`material-finishes.md` + `client-profiles.md` resources. Only the
industry + brief excerpt change.

| Client · industry | Hero palette | Signature materials | Furniture anchors | Tagline (Opus-generated) |
|---|---|---|---|---|
| **Lumen · tech_startup** | Linen canvas · Pale oak · Atelier ink · Studio putty · Lumen sun | Amtico Worn Oak LVT · Interface Composure · Kvadrat Linen · BAUX wood-wool · Farrow & Ball Railings | Herman Miller Jarvis · Vitra ID Chair Mesh · Framery One Compact · Vitra Alcove · Hay Mags Soft | *An atelier of focus on the north light, a bright social forge on the south.* |
| **Altamont & Rees · law_firm** | Chambers green · Walnut leather · Parchment · Ink graphite · Aged brass | Dinesen Douglas plank · Farrow & Ball Card Room Green · Mutina Margarita terrazzo · Gustafs walnut · Création Baumann Hush | Herman Miller Embody · Vitra Eames Segmented 4000 · Vitra Alcove 2264 · Framery One · Pedrali Babila | *A discreet enfilade of chambers — where light is filtered, conversations stay, and every material earns its patina.* |
| **Kaito Miró · creative_agency** | Plaster ivory · Kiln terracotta · Raw plywood · Concrete brut · Acid yellow | Polished concrete slab · Clayworks clay plaster · BAUX terracotta tiles · Woven Image EchoPanel (acid yellow) · Bolon Artisan | Vitra Joyn Bench · Vitra ID Chair Mesh · Hay Mags Soft · Herman Miller Everywhere Round · Framery One Compact | *A loud, plaster-white gallery where every wall is a weekly exhibition.* |

Each product cited is a real SKU from a real manufacturer — a space
planner can place the order straight from the PDF. Kelvin lighting
strategy also differentiates :

- Lumen : 3 000 K in café + lounge, 3 500 K in meeting rooms, 4 000 K
  CRI ≥ 90 at workbenches
- Altamont : 3 000 K throughout partner offices + library + client
  lounges, 3 000 K with dimming in boardrooms, 3 500 K in corridors
- Kaito Miró : gallery-grade 3 500 K CRI ≥ 95 on pin-up spine,
  3 000 K warm pendants in tasting kitchen, 4 000 K task lamps on
  creative desks

Fixtures :

- `backend/tests/fixtures/lumen_moodboard.pdf` (6.2 KB, A3 landscape)
  + `lumen_moodboard_selection.json`
- `backend/tests/fixtures/altamont_moodboard.pdf` (6.5 KB)
  + `altamont_moodboard_selection.json`
- `backend/tests/fixtures/kaito_moodboard.pdf` (6.3 KB)
  + `kaito_moodboard_selection.json`

Each PDF contrasts on the page in every section — header, hero
Atmosphere block, palette, materials grid, furniture cards, planting,
lighting. Side-by-side compositing is the outro beat of
[`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) §02:45–03:00.

---

## Proof 3 · Micro-zoning drills down with industry-aware furniture

_Surface II · Test Fit · micro tab · Level-2b agent_.

Zone-by-zone breakdown of the retained Atelier variant on Lumen, with
real-brand finishes and exact acoustic / lighting targets per zone.

Selected highlights from `backend/tests/fixtures/lumen_microzoning_atelier.md`
(52 k in / 5 k out / 11 KB) :

- **Developer établi (north façade, 8 clusters × 16 desks)** —
  `millerknoll_jarvis_1524 × 130`, `millerknoll_aeron_b × 130`,
  floor: `Interface Composure` (carbon-neutral), wall: `Woven Image
  EchoPanel` 12 mm recycled PET felt, ceiling: `Armstrong Ultima+`
  Class A αw ≥ 0.90. Acoustic target: NF S 31-199 "good" — D2,S ≥ 7 dB,
  Lp,A,S,4m ≤ 48 dB, rD ≤ 5 m. 500 lux maintained at desk at 4 000 K
  CRI ≥ 80.
- **Focus + huddle spine** — `hm_everywhere_1800 × 6`, `arper_kinesit`,
  `Maars Living Walls Momentum` 44 dB Rw, `Gustafs` micro-perforated
  oak on the back wall, `Ecophon Solo` free-hanging islands
  NRC 0.95. DnT,A ≥ 40 dB, TR60 ≤ 0.5 s, 3 500 K dimmable to 300 lux
  for video calls.
- **Boardroom + deposition** — `vitra_eames_segmented_4000 × 2`,
  `millerknoll_embody × 26`, `BAUX Acoustic Pulp` (pinboard-compatible
  war-rooms), `Kvadrat Soft Cells` (boardrooms), DnT,A ≥ 45 dB,
  TR60 ≤ 0.8 s, 500 lux 3 500 K dimmable, `Artemide Tolomeo` pendants.
- **Café + lounge + town hall (south façade, 380 m²)** — `Lithurin`
  polished concrete in café, `Clayworks` clay plaster feature wall,
  `Ecophon Solo` at 3 heights forming a fractal canopy (D ≈ 1.4,
  Taylor 2001), mature `Ficus lyrata` 2.5 m + `Monstera deliciosa`,
  `Bocci 28` cluster over the bar, 3 000 K 300 lux ambient.

Epistemic honesty : `[TO VERIFY: column at x=54 500 vs desk 8 clash]`,
`[TO VERIFY: AV scope in Lumen contract]`, `[TO VERIFY: HVAC return
above y=12 500 for booth heat rejection]`,
`[TO VERIFY: ERP Type W classification with local bureau de contrôle]`.

Fixture : `backend/tests/fixtures/lumen_microzoning_atelier.md`.

---

## Why this matters

The competing approach for design-LLM apps is to template-fill — pick
a client type, pull the pre-written programme, swap the company name
in. Design Office doesn't. **The agents read every brief as if they
were reading it for the first time**, cite peer-reviewed studies and
French standards by resource URI, and carry their epistemic doubt
through as `[TO VERIFY]` markers.

The three proofs above show the adaptation happens at **every level of
the orchestration**: programming synthesis (Level 1), macro + micro
test-fit (Level 2), mood-board curation (Level 3). Justify (Level 4,
downstream of a retained variant) inherits the adaptation from the
variant and programme it consumes.

No prompt templates were swapped between the three runs. No hidden
industry switches in the code path. One model, one set of resources,
three clients, three defensible fit-outs.

---

## See also

- [`USE_CASE.md`](USE_CASE.md) — full Lumen walkthrough with numbers
- [`HACKATHON_SUMMARY.md`](HACKATHON_SUMMARY.md) §"Proof the
  client-aware system works"
- [`ARCHITECTURE.md`](ARCHITECTURE.md) §2 "Managed-agent orchestration
  across six surfaces"
- [`../backend/tests/test_brief_manifest.py`](../backend/tests/test_brief_manifest.py)
  regression guards
