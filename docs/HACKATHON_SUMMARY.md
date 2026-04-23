# Design Office — Hackathon written summary

**Event** : Anthropic "Built with Opus 4.7" hackathon, deadline
2026-04-26 20 h EST. **License** : MIT.
**Repo** : public — see top-level README for URL.

---

## Problem

Space planners and interior architects running **office fit-outs** spend
**2 – 8 weeks** on programming and **1 – 3 weeks** per test fit — and
every week of both is repetitive, citation-starved, and error-prone.
The market is large (~7 M interior architects worldwide ; agencies like
Gensler 6 000+ staff ; brokers JLL, CBRE, Cushman running their own
test-fit teams ; furniture manufacturers Steelcase, MillerKnoll, Haworth
running space planning for clients).

Despite that, **no serious AI tool targets this workflow**. The existing
players are CAD automation (Revit / AutoCAD plug-ins) or BIM authoring
tools — they don't help a space planner translate a client brief into a
defendable programme with citations, nor do they orchestrate a 3D
test-fit in a way that respects the regulation cliff of French ERP type W.

## Solution — Design Office

Design Office augments the six surfaces where human time is spent:

1. **Brief synthesis** — client brief + industry profile (8 profiles
   from tech startup to law firm to public sector) → costed, sourced
   functional programme. Three Claude Opus 4.7 sub-agents (Effectifs /
   Benchmarks / Contraintes) run in parallel over 13 curated MCP
   Resources (3 500+ lines of sourced Markdown covering NF S 31-080,
   NF S 31-199, arrêté 20 avril 2017, Browning 14 patterns, Leesman
   multi-year, Gensler multi-year, Hongisto, Kellert, Ulrich, Taylor
   fractals, plus `design://client-profiles`, `design://material-finishes`
   and `design://mood-board-method`). A consolidator merges them into
   a client-ready programme with inline citations.
2. **Test fit — Macro-zoning** — PDF floor plan + programme → three
   contrasted 3D variants generated in parallel in SketchUp
   (Neighbourhood / Atelier / Hybrid flex). Each variant is reviewed
   in parallel by a Reviewer agent checking PMR, ERP type W,
   programme coverage, and column integrity. Natural-language
   iteration works on any variant.
3. **Test fit — Micro-zoning** — retained variant → per-zone
   drill-down brief (furniture SKUs from the 41-SKU catalogue, finish
   picks from real manufacturers, acoustic targets DnT,A / TR60,
   lighting Kelvin, biophilic accents). Paired with a pseudo-3D
   viewer that cycles through 6 SketchUp angles per variant (4 iso +
   top-down + eye-level, 1920×1280).
4. **Mood Board** — retained variant + industry → **A3 landscape
   PDF** with six mandatory sections (palette, materials, furniture,
   planting, light) curated from real products only. Layout derived
   from `design://mood-board-method`.
5. **Sourced justification** — retained variant → client-facing
   argumentaire with inline citations, rendered as both an A4 PDF
   (ReportLab, 5 pages) and a **6-slide 16:9 pitch deck** embedding
   the client's logo and a SketchUp iso render on the cover. Four
   specialty researchers (Acoustic / Biophilic & neuroarchitecture /
   Regulatory / Programming) run in parallel then consolidate.
6. **Technical DWG** — retained variant → dimensioned A1 DXF with
   Design Office layers (AGENCEMENT, MOBILIER, COTATIONS, CLOISONS,
   CIRCULATIONS) and a title-block cartouche. Ships through `ezdxf`
   headless by default, upgrades to AutoCAD File-IPC live when
   available.

End-to-end, a **cold-start Lumen walkthrough** (fictitious fintech
client, 170 FTE horizon, 2 400 m² plate) runs in **≈ 10 minutes
wall-clock** — from pasted brief to signable DXF + client-ready PDF
+ A3 mood board + PPTX pitch deck.

### Two personas, one product

A top-nav segmented toggle flips the entire product between an
**Engineering view** (dense, numeric, technical — Brief → Test Fit →
Mood Board → Justify → Export) and a **Client view** (editorial,
visual, narrative — Brief → Mood Board → Concept → Story). The
interior architect wears both hats on the same project; the product
adapts.

### Chat as a real assistant

"Ask Design Office" is present on every page. Nine allow-listed
actions (`start_brief`, `start_macro_zoning`, `start_micro_zoning`,
`start_mood_board`, `start_justify`, `iterate_variant`, `export_dwg`,
`generate_pitch_deck`, `update_project_field`) map to real backend
endpoints, dispatched from the chat drawer. Local regex enrichment
detects project-parameter updates in conversation (headcount, growth
target, flex policy, industry) and offers an inline confirmation card
to persist them — no round-trip needed.

## Creative Opus 4.7 usage

1. **Vision HD is the plan-reading brain**. Every PDF upload is
   rendered to 2 576 px PNG and passed to Opus 4.7 with a strict JSON
   schema requesting : envelope, columns, cores, stairs, windows with
   facade semantics, doors with swings, **text labels with purpose**
   (room names, dimensions, scale, orientation), **orientation
   arrow**, **architectural symbols** (WC, sink, compass rose, title
   block, section cut), and an uncertainties list. A PyMuPDF vector
   extraction runs in parallel and is fused with Vision output — vectors
   win on geometry, Vision overlays semantics. Vision is **always on**
   even when PyMuPDF has clean data, because it adds the cardinal
   direction of facades, the door swings, and the room-name text that
   vector PDFs don't carry programmatically.
2. **Three-level managed-agent orchestration**. Each level has a real
   planning intent (not cosmetic parallelism) : Level 1 programme
   synthesis (3 sub-agents × specialty), Level 2 variant generation (3
   variants × design doctrine + reviewers), Level 3 research & cite (4
   researchers × discipline). ThreadPoolExecutor fan-out, a single
   reusable `run_with_consolidator` primitive, exponential retries with
   structured JSONL audit logs. Every call is tagged (`brief.synthesize
   :Effectifs`, `justify.consolidate:Consolidator`, `pdf.vision`,
   `testfit.variant:atelier`) so a demo log reads like a transcript.
3. **MCP Resources consulted at planning time**. 10 Markdown files, 2
   700 lines, every number traceable to a URL or flagged `[À VÉRIFIER]`.
   Agents are prompted to cite `design://<name>` or
   `ratios_json.<path>` inline — the consolidated outputs have real
   footnotes, not vaporous "studies show" filler.
4. **Double MCP CAD orchestration**. SketchUp via the forked
   `mhyrr/sketchup-mcp` server + our Design Office Ruby module (8
   high-level ops). AutoCAD via the forked `puran-water/autocad-mcp`
   with two backends (ezdxf headless + File-IPC live). Both clients
   auto-probe their target app and switch between mock and live with
   no code change — the `SketchUpFacade` and `AutoCadFacade` abstract
   the wire protocol away from the 6 surfaces.

## Business impact

- **Total addressable market** : ~7 M interior architects globally,
  ~$300 B in annual office fit-out spend (Cushman Wakefield 2024
  estimate).
- **Willingness-to-pay segments** :
  - **Space-planning agencies** (Saguez, Gensler, HOK, BigBang,
    Ubiq…) would save 2 – 4 weeks per project × 50 projects / year
    per team = 100 – 200 weeks back in capacity. Target price : $500 –
    $1 500 / seat / month.
  - **Brokers** running test-fit teams (JLL, CBRE, Cushman, Savills)
    would cut test-fit delivery from 1 – 3 weeks to 3 hours. Target
    price : $5 – $15 per test fit delivered as a revenue-share or
    white-label add-on.
  - **Furniture manufacturers** (Steelcase, MillerKnoll, Vitra,
    Kinnarps, Haworth, Herman Miller) would use Design Office as a
    pre-sales accelerator. Target price : enterprise licence.
- **GTM path** : start with space-planning agencies (sharpest pain,
  fastest feedback loop, credibility dividends for the broker / manu
  sales motion).

## Technology

- **Backend** : FastAPI, Pydantic v2, pydantic-settings,
  python-dotenv, anthropic Python SDK, PyMuPDF, ezdxf, ReportLab,
  python-pptx, Pillow, pytest
- **Frontend** : Vite 5, React 18, TypeScript strict, Tailwind 3.4 +
  @tailwindcss/typography, Framer Motion 11, React Router 6,
  react-markdown + remark-gfm, Lucide React
- **MCPs** : forked `mhyrr/sketchup-mcp` (SketchUp plugin + Ruby
  module) + forked `puran-water/autocad-mcp` (LISP dispatcher + ezdxf)
- **Infra** : 2 processes on a single Windows workstation (uvicorn +
  Vite dev server)

## Visual identity

Design Office ships with an **Organic Modern** palette (ivory
`#FAF7F2` canvas, forest `#2F4A3F` accent, sand + sun for the three
variants, clay for errors). Typography is Fraunces (variable, opsz
9-144, wght 100-900, SOFT 0-100) for display + body, Inter for UI,
JetBrains Mono for labels. Aesthetic reference : Kinfolk magazine,
Saguez & Partners, MoreySmith. The downloadable A4 PDF and 6-slide
pitch deck carry the same identity — ivory page, forest eyebrows,
sand rules — so the exported artefacts read as a continuation of the
app rather than a separate template. Principles, tokens and motion
documented in [`UI_DESIGN.md`](UI_DESIGN.md) ; six page captures
in [`screenshots/`](screenshots/).

## Proof the client-aware system works

The product adapts to the client's industry — not cosmetically but at
the level of palette, materials, furniture, planting and lighting.
Three live Opus 4.7 runs on the same orchestration code, only the
industry input varies :

- **Lumen · tech startup** → Linen canvas + Pale oak + Lumen sun.
  Amtico Worn Oak LVT, Kvadrat Remix, BAUX wood-wool, Framery One
  Compact. Tagline: *"An atelier of focus on the north light, a bright
  social forge on the south."*
- **Altamont & Rees · City of London law firm** → Chambers green +
  Walnut leather + Aged brass. Dinesen Douglas plank, Farrow & Ball
  Card Room Green, Mutina Margarita terrazzo, Gustafs walnut
  bookwalls, Création Baumann Hush acoustic curtain. Tagline: *"A
  discreet enfilade of chambers — where light is filtered,
  conversations stay, and every material earns its patina."*
- **Kaito Miró · creative agency** → Plaster ivory + Kiln terracotta
  + Acid yellow. Polished concrete, Clayworks clay plaster, BAUX
  terracotta tiles, Woven Image EchoPanel in acid yellow, Bolon
  Artisan. Tagline: *"A loud, plaster-white gallery where every wall
  is a weekly exhibition."*

Every product is a real SKU from a real manufacturer, cited inline so
a space planner can place the order from the PDF. Each mood board is
committed as a fixture with its full `selection.json` audit file.

## Artefacts to inspect

Everything is in the public repo :

- [`backend/tests/fixtures/generate_output_sample.json`](../backend/tests/fixtures/generate_output_sample.json)
  — live Test Fit 3-variant + 3-reviewer output on Lumen, 133 KB
- [`backend/tests/fixtures/justify_output_sample.json`](../backend/tests/fixtures/justify_output_sample.json)
  — live Justify consolidated argumentaire + 4 agent traces, 65 KB
- [`backend/tests/fixtures/lumen_justify_pitch_deck.pptx`](../backend/tests/fixtures/lumen_justify_pitch_deck.pptx)
  — 6-slide pitch deck from the argumentaire, 39 KB
- [`backend/tests/fixtures/lumen_export_atelier.dxf`](../backend/tests/fixtures/lumen_export_atelier.dxf)
  — live A1 DXF at 1:100, all 5 Design Office layers populated, title
  block cartouche, 168 KB
- [`backend/tests/fixtures/lumen_microzoning_atelier.md`](../backend/tests/fixtures/lumen_microzoning_atelier.md)
  — zone-by-zone drill-down on the Atelier variant, 11 KB
- [`backend/tests/fixtures/lumen_moodboard.pdf`](../backend/tests/fixtures/lumen_moodboard.pdf),
  [`altamont_moodboard.pdf`](../backend/tests/fixtures/altamont_moodboard.pdf),
  [`kaito_moodboard.pdf`](../backend/tests/fixtures/kaito_moodboard.pdf)
  — three A3-landscape mood boards, one per industry, all Opus-curated
- [`backend/tests/fixtures/sketchup_variant_*_*.png`](../backend/tests/fixtures/)
  — 21 SketchUp iso captures (3 variants × 6 angles + 3 back-compat
  aliases) with realistic textures, shadows at 14:00
- [`backend/logs/api_calls.jsonl`](../backend/logs/api_calls.jsonl) —
  complete audit log of every Opus call ; each line has tag, tokens,
  attempts, outcome

## What stands on day-0 of the judging window

- **Six surfaces live** — Brief, Test Fit (macro + micro), Mood Board,
  Justify, Export. Every one exercised end-to-end on the Lumen
  fixture with real Opus 4.7 calls.
- **18 SketchUp PNGs on disk** — 3 variants × 6 angles (iso NE / NW /
  SE / SW + top-down + eye-level) at 1920×1280, with realistic
  materials (Light Wood, White Laminate, Felt Grey, Carpet Olive,
  Fabric Charcoal, Moss Green) applied via
  `DesignOffice.capture_multi_angle_renders` running against the
  live SU_MCP v1.5.0 + DesignOffice Ruby module.
- **Pseudo-3D viewer** powers the Micro-zoning tab: Framer-Motion
  parallax + angle dock + orbit slider + top-down / eye-level
  toggles.
- **Active chat** with 9 allow-listed actions dispatched to real
  endpoints. Enrichment detection persists mid-conversation
  corrections to the unified project state.
- **38 pytest tests pass** (health, brief manifest — 13 MCP
  resources, test-fit fixture + sample, justify markdown / PDF /
  PPTX / 404, export round-trip + layer presence, AutoCAD ezdxf,
  iterate, mood-board PDF round-trip + 404 + streaming).
- **Frontend tsc strict clean** across 7 routes (landing + 6
  surfaces + chat) and all components.
- **Engineering/Client view toggle** flips the full product between
  two personas.
- **Pre-flight check** (`scripts/demo_preflight.ps1`) verifies 27
  things before recording: artefacts, backend health, 5 HTTP
  surfaces, frontend shell, SketchUp MCP probe.
- **Only waiting on** : AutoCAD install for live File-IPC A1 plot
  (headless ezdxf already ships a real DXF), and the demo video
  recording.

## Future work (post-hackathon)

- **Revit MCP** for a design-development surface after test fit
- **IFC export** from the variant layout (BIM exchange with engineering
  consultants)
- **Scheduled re-budgeting** against Cushman / CBRE cost indices
- **Occupancy-analytics integration** (Teem, Robin, OfficeSpace) to
  feed real utilisation back into the flex-ratio target
- **Multi-plate layouts** for multi-tenant buildings
- **Custom-brand resource packs** — a client uploads its own design
  standards, Design Office cites them alongside the public ones

## Acknowledgements

To the mhyrr and puran-water teams for the MCP servers that unlocked
the two CAD integrations ; to the researchers whose work is cited in
every argumentaire (Browning, Kellert, Heerwagen, Nieuwenhuis, Ulrich,
Kaplan, Taylor, Hongisto, Haapakangas) ; to AFNOR, ISO, the IWBI and
Légifrance for the standards work that makes the regulatory agent
defensible ; to Leesman and Gensler for the multi-year benchmark data
that anchors every programming choice ; to the Anthropic team for the
hackathon and for shipping a model that can do all six surfaces in a
single product.

Built with Opus 4.7.
