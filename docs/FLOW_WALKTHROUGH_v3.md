# Flow walkthrough — iter-18 UI refresh

**As of** : iter-18n (2026-04-23). Supersedes `FLOW_WALKTHROUGH.md`.

This document walks through the six surfaces + dashboard + chat in the
order a judge would see them in the 3-minute demo. The visual language
is the Claude Design handoff — integrated per the iter-18 refactor
plan and backed by the adapters documented in
`docs/CLAUDE_DESIGN_HANDOFF_REPORT.md`.

---

## 0. Boot — `/` (Landing)

Editorial marketing hero : italic Fraunces "Archoff." at
`clamp(52px, 9vw, 112px)`, "Augment your test-fit, mood board, and
client presentation." subhead at display-350 weight, 4:5 placeholder
of an "architectural corridor" tinted forest, floating LUMEN · PARIS
caption. Below : a 4-column metric strip (10× faster · 3 industries
proven · 6 editorial surfaces · 0 engineering rewrite), an asymmetric
12-column surfaces grid (I–VI each on its own row with variable
offset), a Kinfolk-scale pull quote on canvas-alt, and a sources
marquee (Leesman · Gensler · Steelcase · Herman Miller · Vitra ·
Framery · Kvadrat).

Two CTAs : **Start a project** goes to `/brief`, **Watch the demo**
+ **Sign in** both land on `/project`.

Landing **bypasses** the product GlobalNav — the sticky nav seen on
the 6 inner surfaces is hidden here ; the landing runs its own
marketing-style nav with anchor links (Surfaces / Method / Journal).

---

## 1. Dashboard — `/project`

**Projects list first.** Four real-fixture projects seeded in
`lib/adapters/projectsIndex.ts` :

| Card | Industry | FTE | Surface | Location | Ref | Stage |
|------|----------|-----|---------|----------|-----|-------|
| Lumen | Tech startup | 120 → 170 | 2 400 m² | Paris 9ᵉ | LUM-2026-041 | Test fit |
| Altamont & Rees | Law firm | 68 → 92 | 1 650 m² | City of London | ALT-2026-028 | Justify |
| Kaito Studio | Creative agency | 42 → 60 | 980 m² | Lisbon Marvila | KAI-2026-019 | Brief |
| Meridian | Bank & insurance | 340 → 380 | 6 200 m² | La Défense | MER-2026-007 | Export |

Lumen / Altamont / Kaito map to the three industries we proved live
(iter-17 regression tests) ; Meridian is the bank-sector synthetic
slot for grid variety.

Each card shows : project-tinted banner + ref + stage pill, name +
industry + FTE delta + surface, tint progress bar, 5-dot surface
summary (forest / mint / sun / mist), "UPDATED" byline, "Open →"
cue.

Filter bar : search box (name / industry / client) + stage pills
(All / Brief / Test fit / Justify / Export).

Clicking a card flips to the **ProjectDetail** : hero band with
project-tinted gradient, italic Fraunces title "Lumen · Tech
startup", metric pills (staff / surface / location / stage),
view-mode PillToggle and tint-coloured progress % on the right, then
a 5-card Surface grid. Each surface opens its route. Pending
surfaces render at 0.6 opacity. Recent-activity log below.

Tapping a project also flips the active-project flag in
`projectsIndex`, so the GlobalNav byline updates immediately.

---

## 2. Brief — `/brief` (I)

Editorial textarea-first : "Tell us about the project." 72 px italic
Fraunces, underline-only `textarea` in display 22 px / weight 320 —
no box, no placeholder ghost-UI. Industry pill row drives
`project.client.industry` live. Sidebar shows "ASSETS" dropzones
(client logo + floor-plan PDF) and a "DEFAULTS DETECTED" panel
reading FTE / industry / policy / MCP-resource count from project
state.

Click **Synthesize programme**. Four voices animate in the
AgentTrace (studio vocab from iter-17 E) :

- **I. Headcount** — parses the 120 → 170 trajectory
- **II. Benchmarks** — pulls Leesman 2024 + Gensler EU 2024
- **III. Compliance** — reads arrêté 25 juin 1980 and NF EN 527
- **IV. Editor** — weaves the three voices into the programme

When the Opus call resolves (6-10 s for Lumen), the page animates
into the 8-card programme grid. Each card has a heuristically-picked
Lucide icon (Users for headcount, MessagesSquare for collaboration,
ShieldCheck for compliance…), the section title in Fraunces 20 px,
the first sentence as tldr, and "READ MORE →" in mono forest.

Clicking a card opens a right-drawer (560 px) with icon + italic
title + display tldr + full markdown body via `react-markdown`.
Footer : "SOURCES" in mono with the three mandatory citations.

**Next** : "Continue to test fit →" persists the programme via
`setProgramme` and navigates to `/testfit`.

---

## 3. Test fit macro — `/testfit?tab=macro` (II)

"Three variants, one plan." (Client view : "Three concepts, one
space."). The PillToggle sits top-right ; Macro / Micro.

Three pigmented cards side by side (villageois = forest, atelier =
sand, hybride_flex = mint). Each renders :

- Pigment diamond + italic Fraunces name.
- Card-level 2D / 3D toggle (3D wire-up scheduled for the next
  iteration ; 2D is the truth today).
- One-liner pitch.
- Inline `FloorPlan2D` in normalised 88 × 62 space — plan envelope
  in warm grey, column-grid hairlines, 5-category zone fills.
- MetricBadge row : Desks · m²/FTE · Flex · Adjacency %.
- Clay-border warning block when the `adjacency_audit` flags
  anything.
- "Drill into micro-zoning →" on the active card.

Click any variant → it becomes the active card (forest border, 1.015
scale, lift shadow) and retained_style persists into the v2 state.

Below : zone legend, then "AGENTS AT WORK · MACRO RUN #1" running
the 4-agent trace (Programme Reader / Adjacency Solver / Density
Validator / Reviewer). Done-state pulls real numbers : "3 variants
· avg. 82 %", "Within the 14-17 m²/FTE window", "3/3 approved".

Iterate bar at the bottom : corner-down-right glyph + underline
input + forest Generate button. Type "enlarge the boardroom", hit
Enter — calls `POST /api/testfit/iterate`, swaps the active variant
in place, persists the iteration via `upsertVariant` + `setLiveScreenshot`.

---

## 4. Test fit micro — `/testfit?tab=micro` (II — drill)

"Drill into the chosen concept." The drilling-into pill at the top
echoes the active variant (italic Fraunces name in forest-ghost).

For Lumen atelier, the fixture
`/microzoning-fixtures/atelier.json` (committed from a live run,
14 zones, 61 k / 12 k tokens, 165 s) loads on mount — zero token
cost for the demo. Any other project / variant shows a "Run
micro-zoning" primary CTA that calls the new
**POST /api/testfit/microzoning/structured** endpoint (iter-18i
backend).

Layout : 1.6 / 1 split.

Left : `FloorPlan2D` numbered — 14 zones, each with a numbered
circle at its centre. Click a number or a zone card on the right to
open the zoom drawer.

Right : scrollable list of 14 zone cards (number · icon · name ·
surface · status dot). Clicking opens the drawer.

Drawer (560 px) : icon tile + italic Fraunces name + "m² · VARIANT"
byline, one-paragraph narrative in display 17 px, 16:9 zoom
placeholder, FURNITURE table (brand · name · count · dimensions),
ACOUSTIC block with Rw / DnT,A / TR60 targets + NF source,
MATERIALS list grouped by surface, ADJACENCY CHECK block — mint on
pass, sun on warn, cited rule_ids from `design://adjacency-rules`.

---

## 5. Mood board — `/moodboard` (III)

"An atelier of focus on the north light, a bright social forge on
the south." (the Lumen atelier tagline, pulled verbatim from the
`/moodboard-fixtures/lumen_atelier.json` fixture).

Layout : 1.4 / 1.

Left : Pinterest-style collage, 3 CSS columns, each tile slightly
rotated ±0.4° with `Placeholder` + the material's `swatch_hex` as
tint. Each column breaks inside → tiles flow organically.

Right : six drill topic cards (Atmosphere · Materials · Furniture
· Planting · Light · Sources), each with a forest-ghost icon tile,
Fraunces title, and a one-line summary derived from the selection.

Bottom : palette strip, 6 pigments side by side with auto-
contrasting foreground via Rec 601 luma.

CTAs : **Download A3 PDF** (live : `/api/moodboard/generate` +
`/api/moodboard/pdf/{id}`), **Add to client deck** → `/justify`.

Each topic card opens the right-drawer :

- Atmosphere — hero-image-theme prose + palette grid
- Materials — 2-col grid of tile + name + source
- Furniture — product cards (brand / name / dimensions)
- Planting — mint-accented italic list
- Light — Kelvin temperature + fixture list
- Sources — mono citation list

For live generation on any other project, the "Run mood board" CTA
calls POST /api/moodboard/generate and the NanoBanana visual (iter-17
C) bolts onto the hero when the fal.ai key is present.

---

## 6. Justify — `/justify` (IV)

**View-mode aware** : Engineering vs Client swap headline and layout.

Engineering : eyebrow "IV · JUSTIFY", "A sourced argumentaire, in
the client's language.", 1 / 280 px grid with the research-trace
aside on the right.

Client : eyebrow "IV · STORY", "The story behind this space.",
single-column layout, research trace hidden.

Three metric pills under the h1 : retained variant (forest, sand
diamond) · `{n} desks` · `{m²/FTE}`.

Seven cards in an auto-fill grid. Each card :

- 36 px italic Fraunces roman numeral in sand (I. II. III. …)
- 24 px display title
- 14 px mist-600 tldr
- Bottom-right : "N CITATIONS" mono-forest + chevron.

Adapter (`lib/adapters/justifySections.ts`) parses the
`argumentaire` markdown into these cards ; counts citations from
`design://` refs + bracketed markers + named sources (Leesman,
Gensler, WELL, BREEAM, NF S 31-080, Hongisto, Banbury, Haapakangas…).
Falls back to a 7-card static palette for fresh projects so the
page is never empty.

Aside (Engineering only) : live token breakdown per agent (Acoustic
· Biophilic · Ergonomics · Compliance) or an estimated total,
with a "Compose live" CTA when no response has landed yet.

Clicking a card opens the drawer : 56 px sand roman numeral, 36 px
display title, 20 px display tldr, full markdown body, a 3-px
forest pull quote ("Office workers in acoustically-treated
environments report 23 % fewer distractions…"), then the CITATIONS
mono-list.

CTAs at the bottom : **Compose client deck (PPTX)** → `/export`,
**Download report (PDF)** / **Download pitch deck (PPTX)** appear
once the backend run lands.

---

## 7. Export — `/export` (V)

"Hand off to engineering." italic 64 px. Subhead "Five named layers.
Zero rewrite. Open directly in AutoCAD, Revit or Vectorworks."

Hero panel (raised cream, 18 px radius, soft shadow) :

- Retained-variant pill top-left (sand diamond + "{variant} · {n}
  desks").
- Scale PillToggle top-right (1:50 / 1:100 / 1:200).
- Project reference underline-input + "UNITS · MM · DIN 919"
  byline.
- Twin CTAs : **Generate DXF** (live — calls POST `/api/export/dwg`,
  which emits DXF under iter-17) and **Generate DWG** (disabled with
  a clay "ODA PENDING" pill — blocker B7 in BLOCKERS.md).
- Hairline caption : "DWG blocked on ODA File Converter install ·
  DXF opens in every major CAD app (1-click save-as DWG)."

Three-step pipeline row : SketchUp model → ezdxf headless → DXF / DWG
(with DO_WALLS · DO_ZONES · DO_FURN · DO_ACOUSTIC · DO_GRID). Each
step in a canvas-alt card, arrows between.

On Generate : 3-row AgentTrace (Model Reader / ezdxf Translator /
Packager), pending → active → done. On completion : mint shield-
check result card with the filename, byte size, layers, sheet,
scale, and the Download button.

---

## 8. Chat — drawer (any route) + `/chat` fullpage (VI)

Floating trigger : 56 px circular forest button bottom-right on every
route except `/chat`, with the soft-breathe animation. App.tsx owns
the open state ; the ChatDrawer panel is controlled from there.

Drawer (460 px right-edge, backdrop-blur, body-scroll lock) shows
the ChatPanel in drawer mode. Header : "Ask Archoff" display
15 / page context · Opus 4.7 mono / maximize + clear + close icons.
Context strip below with "● WORKING ON · LUMEN · TECH · 120 STAFF"
line synthesized from project state + active project.

Messages : user bubble mist-100 with sharp bottom-right corner ;
assistant bubble canvas with 2 px forest left-border and sharp
top-left corner. Markdown rendered via react-markdown.

Enrichment detection (iter-17 live) — user types "we're actually
120 people now" and a sand-bordered card lights up : "Project
update detected. Update headcount to 120?" with two actions. Same
flow for flex_policy / growth_target / industry.

Action allow-list : when the chat proposes one of the 9 allowed
actions (start_brief, start_testfit, retain_variant, iterate_variant,
start_mood_board, start_justify, generate_pitch_deck, export_dwg,
update_project_field), a forest-bordered card surfaces with an
"Apply" + "Cancel" pair. Out-of-domain requests ("compute the TGBT
wattage") get a polite refusal — locked by regression fixture.

Composer : underline textarea + forest 36 px circular send button.
Enter sends, Shift+Enter newline.

**Fullpage `/chat`** : bypasses the GlobalNav. 300 px canvas-alt
sidebar on the left — "Back to dashboard" link, CONVERSATIONS
eyebrow, "+ New conversation" primary, 5 sample convo rows (active
row has the forest border), active-project card at the bottom.
Right side embeds the same ChatPanel in `fullpage` mode.

---

## End-to-end token spend (live Lumen, observed)

| Surface | Endpoint | Tokens (in + out) | Wall-clock |
|---------|----------|-------------------|-----------|
| Brief | `/api/brief/synthesize` | ~10 k + 3 k | 6-10 s |
| Test fit | `/api/testfit/generate` | 240 k + 26 k (3 variants × 4 agents) | 155 s |
| Micro-zoning | `/api/testfit/microzoning/structured` | 61 k + 12 k | 165 s |
| Mood board (curator) | `/api/moodboard/generate` | ~22 k + 5 k | 35 s |
| Mood board (visual, NanoBanana) | `/api/moodboard/generate-visual` | n/a — $0.05 single fal.ai call | 47 s |
| Justify | `/api/justify/generate` | ~50 k + 15 k (4 research agents) | ~75 s |
| Export | `/api/export/dwg` | 0 (ezdxf headless, no LLM) | <1 s |

Grand total for an end-to-end Lumen demo : ~380 k / 60 k tokens,
plus ~$0.10 in fal.ai. Cache hits on subsequent runs drop to
virtually nothing.

---

## Visual quality gates

Every screen is verified at **1440 × 900** with `0 px` horizontal
overflow (tested via preview-browser DOM walker in each commit). The
body has `overflow-x: clip` to neutralise fixed-position off-screen
drawers contributing scroll-width (iter-18g fix).
