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

- **Visual** : Landing page, serif hero, Fraunces title, terracotta
  accent. Slow scroll to the 4-step timeline. Light piano music.
- **Cut** at 00:12 to the Brief page — text editor full of the Lumen
  brief.

## 00:15 – 00:35 Surface 1 — Brief

> *"Lumen, a fintech startup, needs 2 400 m² over two floors. I paste
> the brief."*

- **Click** "Generate program". The 3-agent status dots pulse : 01
  Effectifs ochre pulse → done ; 02 Benchmarks ochre → done ; 03
  Contraintes ochre → done ; Consolidator ochre → done.
- **Cut** to the terminal on the side : `brief.synthesize:Effectifs
  attempts=1 outcome=success` lines scroll.
- **Back** to the UI : the programme fades in — table with 130 postes,
  14 phone booths, total 2 091 m², split 30/26/25/19 %, sources in
  footer with `design://` URIs.
- 3 agents × ~70 s each in parallel + consolidator — total ~90 s. In the
  final cut we compress to 20 s of accelerated footage.

## 00:35 – 01:15 Surface 2 — Test Fit

> *"Now I upload the plan. Opus Vision reads it at 2 576 px, then three
> agents each draft a variant — in parallel."*

- **Click** into /testfit. Fixture shows the 60×40 m Lumen plate —
  envelope, 54 columns, 2 cores, stair, 12 windows.
- **Brief notes** on the left sidebar : manifest shows `54 columns
  conf=0.9 Vision HD + PyMuPDF fusion`.
- **Click** "Generate 3 variants". Status dots pulse.
- **Cut** to SketchUp window (or to the recorded screen capture of the
  SketchUp viewport). Three scene switches play in quick succession :
  Villageois, Atelier, Hybride flex — each showing the plate with desks
  in place and phone booths scattered.
- **Back** to /testfit : the 3 tabs populate with reviewer dots (green /
  ochre / red). Narrative text of the retained variant (Atelier Nord —
  Fabrique Lumineuse) fades in.
- Reviewer issues are visible — "back-of-house missing", "café + town
  hall > 300 m² triggers désenfumage", "column collision to spot-check".
- ~40 s of demo time.

## 01:15 – 01:45 Natural-language iteration

> *"Agrandis la boardroom, pousse les postes vers la façade sud."*

- **Switch** to the Test Fit chat input (or the iterate endpoint in the
  terminal — depending on UI state at demo time). Type the instruction.
- **Cut** to SketchUp : the boardroom grows, the postes migrate.
- If iterate isn't shipped in time for the demo, replace this beat with
  a walkthrough of one variant's SketchUp scene — zoom in on the
  neighbourhood colour-coding, the phone booths clustered at
  junctions, the biophilic anchors.
- ~30 s.

## 01:45 – 02:15 Surface 3 — Justify

> *"Now defend every choice. Four research agents in parallel cite
> acoustic norms, biophilic research, PMR regulation, and programming
> benchmarks."*

- **Click** into /justify. Retained variant already selected (atelier).
- **Click** "Generate sourced argumentaire". Status pulses on 4 dots
  (Acoustic / Biophilic / Regulatory / Programming) + Consolidator.
- **Cut** to terminal tail : `justify.research:Acoustic`, `:Biophilic`,
  `:Regulatory`, `:Programming` running in parallel, then
  `justify.consolidate:Consolidator`.
- **Back** to UI : the consolidated argumentaire fades in — "Lumen —
  Pourquoi cette variante", 7 sections, inline citations (Nieuwenhuis
  2014, Ulrich 1984, Hongisto 2005, NF S 31-080, arrêté 20 avril 2017).
- **Click** "Download client PDF" — the 5-page A4 with the Design Office
  palette opens in a new tab.
- ~30 s.

## 02:15 – 02:45 Surface 4 — Export

> *"And here's the dimensioned A1 DXF, with the five Design Office
> layers — AGENCEMENT, MOBILIER, COTATIONS, CLOISONS, CIRCULATIONS."*

- **Click** into /export. Atelier variant preselected.
- **Click** "Generate technical DXF". Status → done, ~2 s.
- **Click** "Download lumen_export_atelier.dxf".
- **Cut** to AutoCAD window with the DXF already loaded (or prompt the
  loading if AutoCAD is live). Layer panel on the right shows the five
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

## Recording notes

- Resolution : 2 560 × 1 440, 60 fps
- Audio : bake a dry VO at −16 LUFS, add a soft piano bed at −32 LUFS
- Cuts : keep each surface transition under 500 ms with a subtle
  terracotta colour wipe

## Written submission checklist

When exporting the final video, also submit :
- The GitHub repo URL (public)
- `docs/HACKATHON_SUMMARY.md` (the written summary)
- One link to each of the three live fixtures
  (`generate_output_sample.json`, `justify_output_sample.json`,
  `lumen_export_atelier.dxf`) so the judges can inspect output quality
  without running the stack.
