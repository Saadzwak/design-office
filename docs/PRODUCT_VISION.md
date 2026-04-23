# Product vision

A short explanation of what Design Office is, who it is for, and the
product-level decisions that shaped iteration 16.

---

## Who it is for

Interior architects and space planners who design office fit-outs for
the tertiary sector. They wear two very different hats across a single
project:

- **Engineering hat** — programming tables, PMR circulation, ERP type W
  category, acoustic calculations, AutoCAD layers, dimensioned plans.
  The audience is the client's technical lead, the bureau de contrôle,
  the general contractor. The register is dense, numeric, factual.
- **Client-presentation hat** — vision narrative, mood board, ambiance,
  pitch deck. The audience is the CEO / COO / People lead / facilities
  director. The register is editorial, visual, emotional. Sell the
  feeling first, then the plan.

Design Office has to serve both hats without being generic or confusing
which audience any given screen is built for.

## The six surfaces

Iteration 16 reorganises the product around the vocabulary that senior
space planners actually use:

| # | Surface     | Vocabulary       | Artefact                             |
|---|-------------|------------------|--------------------------------------|
| 1 | Brief       | Programming      | Consolidated programme (Markdown)     |
| 2 | Test Fit    | **Macro-zoning** | Three 3D variants in SketchUp         |
|   |             | **Micro-zoning** | Per-zone drill-down for the retained variant |
| 3 | Mood Board  | Curation         | A3 landscape PDF (palette, materials, furniture, planting, light) |
| 4 | Justify     | Argumentaire     | A4 PDF + 6-slide PPTX pitch deck      |
| 5 | Export      | Technical DWG    | A1 DXF with 5 Design Office layers    |

Macro-zoning decides **where** each space typology lives on the plate.
Micro-zoning decides **how** each of those zones is detailed: specific
furniture SKUs from the 41-SKU catalogue, finish picks from real
manufacturers, acoustic targets, lighting Kelvin, biophilic accents,
sight-line management.

## The top-level view toggle

A segmented pill in the top nav flips the whole product between:

- **Engineering view** — full surface list, dense layouts, numeric
  metric columns, reviewer verdicts, integration badges.
- **Client view** — reduced surface list (Brief → Mood Board → Concept →
  Story), editorial layouts, softer copy, visual hero images over
  dense tables.

The toggle is persisted in the unified project state, so every page
adapts on flip.

## Client-aware generation

Every surface that produces output takes a `client.industry` hint
(tech startup, law firm, bank & insurance, consulting, creative agency,
healthcare, public sector, other). This hint biases:

- **Brief** — flex-ratio band, individual vs collab share, closed-
  office ratio, meeting-room mix.
- **Macro-zoning** — which of the three parti-pris variants gets
  emphasised (law firm defaults prefer the villageois neighbourhood
  model for privacy; tech start-ups prefer atelier for pair
  programming).
- **Micro-zoning** — furniture palette (Walter Knoll vs Vitra Tyde),
  finish palette (wood + leather + brass vs light oak + plants +
  pop colour), acoustic target (DnT,A ≥ 40 dB for law-firm offices,
  ISO 3382-3 rD ≤ 5 m for open-plan tech).
- **Mood Board** — palette derivation (see industry table in
  `design://mood-board-method`), material catalogue slice, furniture
  catalogue subset.
- **Justify** — the rhetorical tone of the argumentaire.

The full industry matrix lives in
[`design://client-profiles`](../backend/app/data/resources/client-profiles.md).

## The chat is an assistant, not a chatbot

"Ask Design Office" is present on every page. It is allowed to:

1. **Enrich the project state from conversation.** If the user types
   "we actually have 140 staff now, not 120", a regex scan fires
   locally and Opus sees the same nuance server-side; a confirmation
   card asks "Update to 140?" and persists to the unified state.
2. **Actually run actions, not just suggest them.** The nine allowed
   action types (`start_brief`, `start_macro_zoning`,
   `start_micro_zoning`, `start_mood_board`, `start_justify`,
   `iterate_variant`, `export_dwg`, `generate_pitch_deck`,
   `update_project_field`) map to real backend endpoints; Apply
   triggers the POST, shows a "Running · …" spinner, then posts a
   success bubble and navigates to the right surface.
3. **Be bounded.** The chat assistant's system prompt forbids
   out-of-domain suggestions (electrical engineering, HVAC,
   residential, etc.) with a hard refusal list, so the "Upload plan
   de gain CTA TGBT"-style bug that triggered iteration 16 cannot
   recur.

## Design language

- **Organic Modern** palette — ivory canvas, forest accent, sand +
  sun pigments per macro-zoning variant, clay for errors.
- **Fraunces** (variable, opsz 9-144, wght 100-900, SOFT 0-100) for
  editorial headlines; **Inter** for UI; **JetBrains Mono** for
  labels and numeric metrics.
- Six mandatory editorial sections per Mood Board A3 output, per
  the method in [`design://mood-board-method`](../backend/app/data/resources/mood-board-method.md).

Full style guide in [`UI_DESIGN.md`](UI_DESIGN.md).

## What is deliberately out of scope

- **Structural / MEP engineering**: Design Office doesn't try to do
  BIM clash detection, energy modelling or loads calculation. That
  belongs to the engineering subcontractors.
- **Residential, hospitality, retail**: the product is specialised to
  **office fit-out**. Extending to other typologies would dilute the
  MCP resources (programming, acoustics, PMR, flex ratios) that make
  the output credible.
- **Bureau de contrôle certification**: Design Office outputs can be
  handed to a certification firm as a starting point, but the
  `[TO VERIFY]` discipline means no output claims certification-grade
  accuracy on its own.

See [`FUTURE_WORK.md`](FUTURE_WORK.md) for the evolutions planned
post-hackathon (Three.js 3D, Revit MCP, IFC export, HRIS occupancy
integration).
