# 3-minute demo script

Shot-by-shot for the hackathon video. Run `scripts/run_dev.ps1` before
recording. SketchUp Pro open with the MCP server started (Extensions →
MCP Server → Start Server) recommended for the live 3D demo, otherwise
the screenshots pane will show the PlanSvg overlay instead.

---

## Props to have ready

- Browser at `http://localhost:5173/` (Landing)
- Second browser tab at `http://localhost:5173/brief` (pre-filled with
  the Lumen brief)
- Third tab at `http://localhost:5173/testfit` (with a cached result in
  localStorage — run once before the demo to pre-populate)
- SketchUp Pro window visible (for the live iteration moment)
- AutoCAD window open (optional — the `lumen_export_atelier.dxf` file
  pre-loaded is enough)
- Terminal tail on `backend/logs/api_calls.jsonl` visible on a side
  monitor (for the "live agents working" cutaway)

---

## 00:00 – 00:15 Hook

> *"A space planner spends 3 weeks doing a test fit. With Design Office,
> it's 3 minutes."*

- **Visual** : Landing page. Editorial magazine hero — *"A quiet
  co-architect for office interiors."* in Fraunces display with
  *co-architect* in italic, black-and-white corridor photograph on
  the right, forest-dot logo top-left, ivory canvas. Slow scroll to
  the metric strip (10 min / 2 700 lines / 3×3 agents / 41 SKUs) and
  the Roman-numeral surface index. Light piano music.
- **Cut** at 00:12 to the Brief page — blank-page serif editor full
  of the Lumen brief.

## 00:15 – 00:35 Surface 1 — Brief

> *"Lumen, a fintech startup, needs 2 400 m² over two floors. I paste
> the brief."*

- **Click** "Generate programme". The 4-agent editorial list pulses :
  each row's forest dot switches to the `running` tone with dot-pulse,
  and below every name a typewriter reveals the live task —
  *"Counting desks, meeting rooms, support spaces…"*,
  *"Cross-referencing Leesman 2023 and Gensler Workplace Survey…"*,
  *"Reading arrêté 25 juin 1980 and NF EN 527…"*,
  *"Folding the three voices into a single document…"*. Above them,
  the "Synthesizing programme…" panel lists the backend trace
  (loading 10 MCP resources, fanning out to three sub-agents…)
  character by character.
- **Cut** to the terminal on the side : `brief.synthesize:Effectifs
  attempts=1 outcome=success` lines scroll.
- **Back** to the UI : the programme fades in — Fraunces-headed
  prose document with 130 postes, 14 phone booths, total 2 091 m²,
  split 30/26/25/19 %, inline citations to `design://` URIs.
- 3 agents × ~70 s each in parallel + consolidator — total ~90 s. In the
  final cut we compress to 20 s of accelerated footage.

## 00:35 – 01:15 Surface 2 — Test Fit

> *"Now I upload the plan. Opus Vision reads it at 2 576 px, then three
> agents each draft a variant — in parallel."*

- **Click** into /testfit. Viewer fills 65 % of the screen — the
  60×40 m Lumen plate renders on ivory paper : ink envelope, sand
  columns, ink cores, forest-stroked windows on the north and south
  façades. Left rail reads like an index : `I. Villageois`,
  `II. Atelier`, `III. Hybride flex` in Fraunces with pigment dots
  (forest / sand / sun).
- **Plan source block** on the left : `area 2 400 m² · columns 54 ·
  cores 2 · windows 12 · confidence 0.90`.
- **Click** "Generate 3 variants". The pigment dots switch to
  dot-pulse in parallel, and a forest `Opus 4.7 · parallel` panel
  types *"Three sub-agents are drafting variants in parallel…"*.
- **Cut** to SketchUp window (or to the recorded iso render). Three
  scene switches play in quick succession : Villageois, Atelier,
  Hybride flex — each showing the plate with desks in place and
  phone booths scattered.
- **Back** to /testfit : the left rail populates with variant
  metrics (`130 postes · 16 rooms · 14 booths`) and reviewer
  verdicts coloured forest / sand-deep / clay. Click Atelier — the
  active row slides forward, the viewer refreshes, the right column
  reveals the variant title ("Atelier Nord — Fabrique Lumineuse"),
  editorial metrics in Fraunces (Postes · Rooms · Booths · Flex ·
  Collab m² · Total m²), reviewer verdict with forest dot, and the
  agent's narrative rendered as prose.
- Reviewer issues are visible on the verdict list — "back-of-house
  missing", "café + town hall > 300 m² triggers désenfumage",
  "column collision to spot-check".
- ~40 s of demo time.

## 01:15 – 01:45 Natural-language iteration

> *"Agrandis la boardroom, pousse les postes vers la façade sud."*

- **Switch** focus to the *Iterate in natural language* block under
  the Atelier narrative. Type the instruction in the underline-style
  input.
- **Hit Apply**. A new *Opus 4.7 · iterating* panel appears below the
  input : a Fraunces caret headline ("Rewriting the Atelier
  variant…") and 5 staged mono-caps lines that type themselves in
  sequence with staggered dot-pulse — *"Reading the current atelier
  variant…" → "Interpreting …" → "Generating the modified structured
  plan…" → "Replaying against the SketchUp MCP backend…" →
  "Re-validating PMR circulations and programme coverage…"*.
- **Cut** to SketchUp : the boardroom grows, the postes migrate to
  the south façade. Back in the app, the 3D viewer refreshes with the
  fresh iso screenshot captured after the iteration, and the history
  line logs the instruction + tokens + duration.
- ~30 s.

## 01:45 – 02:15 Surface 3 — Justify

> *"Now defend every choice. Four research agents in parallel cite
> acoustic norms, biophilic research, PMR regulation, and programming
> benchmarks."*

- **Click** into /justify. Retained variant already selected (Atelier)
  — the viewer fills the top of the spread, the metrics sit in a
  Fraunces-editorial right column.
- **Click** "Generate argumentaire". A forest *Opus 4.7 · parallel
  research* panel appears : Fraunces headline ("Four researchers,
  one voice…") and a two-column grid where each researcher (Acoustic
  / Biophilic / Regulatory / Programming) types its own live task in
  forest-mono-caps (*"Reading NF S 31-080 and open-office absorption
  studies…"*, etc.) with staggered dot-pulse.
- **Cut** to terminal tail : `justify.research:Acoustic`, `:Biophilic`,
  `:Regulatory`, `:Programming` running in parallel, then
  `justify.consolidate:Consolidator`.
- **Back** to UI : the consolidated argumentaire fades in as a Kinfolk
  editorial spread — "Lumen — Pourquoi cette variante", 7 sections,
  forest pull-quote blocks, inline citations (Nieuwenhuis 2014, Ulrich
  1984, Hongisto 2005, NF S 31-080, arrêté 20 avril 2017). A
  research-trace aside on the right lists each sub-agent with tokens
  + duration, expandable on click.
- **Click** "Client PDF ↗" — the re-paletted 5-page A4 (forest
  eyebrow, sand rules, ink body) opens in a new tab. Flash "Pitch
  deck PPTX ↗" button to show the 6-slide alternative.
- ~30 s.

## 02:15 – 02:45 Surface 4 — Export

> *"And here's the dimensioned A1 DXF, with the five Design Office
> layers — AGENCEMENT, MOBILIER, COTATIONS, CLOISONS, CIRCULATIONS."*

- **Click** into /export. A 4:3 viewer on the left, a Fraunces hero
  on the right — "Atelier Nord — Fabrique Lumineuse" above the
  single green CTA, reviewer badge below in forest.
- **Click** "Generate technical DXF". The *ezdxf · writing* panel
  appears : Fraunces headline ("Composing the atelier DXF…") and 6
  staged status lines that type themselves — *"Opening the A1 sheet
  at 1:100…" → "Drawing the envelope, columns, cores, stairs…" →
  "Replaying the variant trace…" → "Placing dimensions on the
  COTATIONS layer…" → "Composing the title-block cartouche…" →
  "Saving DXF + manifest to disk…"*. ~2 s wall-clock.
- **Download card appears** : filename in Fraunces, size / sheet / scale
  / ops count in mono-caps, layer chips for the 5 Design Office
  layers, and a right aside listing the backend pipeline (ezdxf
  headless + File IPC live + manifest).
- **Click** "Download ↗" — the DXF lands on disk. **Cut** to
  AutoCAD window with the DXF already loaded (or prompt the loading
  if AutoCAD is live). Layer panel on the right shows the five
  Design Office layers in their palette colours. Zoom to the title
  block in the bottom-right — client, variant, scale 1:100, date,
  "Design Office — Built with Opus 4.7".
- ~30 s.

## 02:45 – 03:00 Outro

> *"Three levels of managed agents. Opus 4.7 Vision HD on the plans.
> Two MCPs, SketchUp and AutoCAD, orchestrated in parallel. Built from
> scratch during the Built with Opus 4.7 hackathon. MIT licensed."*

- **Visual** : back to Landing hero, overlay with :
  - Repo URL
  - `designoffice.so` or the submission link
  - Stack logos : Claude Opus 4.7 · FastAPI · React · SketchUp ·
    AutoCAD
  - License badge : MIT
- Fade to black with the Anthropic logo and "Built with Opus 4.7".

---

## If something breaks mid-take

- **Token error / API 5xx** : the retry logic kicks in silently. If it
  exhausts 4 attempts, pre-recorded fallback fixtures
  (`backend/tests/fixtures/generate_output_sample.json`,
  `justify_output_sample.json`) let us keep the flow.
- **SketchUp not responsive** : the `RecordingMockBackend` keeps
  everything else working. Swap the SketchUp cutaway for the PlanSvg +
  variant zones overlay from the frontend.
- **AutoCAD not installed** : `EzdxfHeadlessBackend` produces the same
  DXF. Open it in Adobe Illustrator or BricsCAD instead — both read DXF
  natively.

## Before hitting Record

Run the pre-flight check from the repo root **while both dev servers are
running** :

```powershell
.\scripts\demo_preflight.ps1
```

It verifies, in order : the 12 required fixtures + screenshots are on
disk, the backend `/health` endpoint returns `status=ok` with the API
key loaded, the four HTTP surfaces (`integrations/status`,
`brief/manifest`, `testfit/catalog`, `testfit/fixture`) respond with
sane data, the frontend shell is reachable, and the SketchUp MCP TCP
socket on `127.0.0.1:9876` answers.

Expected last line : `READY - every surface is green. Hit Record.`
If a warning appears (e.g. SketchUp MCP not started), the demo still
plays on the bundled iso screenshots — acceptable fallback. Any
`FAIL` means stop and investigate before recording.

## Recording notes

- Resolution : 2 560 × 1 440, 60 fps
- Audio : bake a dry VO at −16 LUFS, add a soft piano bed at −32 LUFS
- Cuts : keep each surface transition under 500 ms with a subtle
  forest colour wipe (`#2F4A3F`) matching the app's primary accent.

## Written submission checklist

When exporting the final video, also submit :
- The GitHub repo URL (public)
- `docs/HACKATHON_SUMMARY.md` (the written summary)
- One link to each of the three live fixtures
  (`generate_output_sample.json`, `justify_output_sample.json`,
  `lumen_export_atelier.dxf`) so the judges can inspect output quality
  without running the stack.
