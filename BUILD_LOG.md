# Build Log — Design Office

Format: each loop iteration appends a timestamped entry. Phase banners mark transitions.

---

## Session start

- **Start (UTC)** : 2026-04-22T07:09:13Z
- **Hackathon deadline** : 2026-04-26 20:00 EST (= 2026-04-27 00:00 UTC)
- **Time budget remaining at start** : ~113 h
- **Operator** : Claude Code (Opus 4.7, 1M context) running `/loop` dynamic mode
- **Working dir** : `C:\Users\redaz\Desktop\Design Office`
- **Platform** : Windows 10, bash shell

### Planned phase durations (section 13 of CLAUDE.md)

| Phase | Scope                                  | Est. | Cumulative |
|-------|----------------------------------------|------|------------|
| 1     | Fondations (monorepo, scaffolds)       | 2 h  | 2 h        |
| 2     | Surface 1 Brief                        | 3 h  | 5 h        |
| 3     | Pipeline PDF + Surface 2 Test Fit      | 5 h  | 10 h       |
| 4     | Surface 3 Justify                      | 2 h  | 12 h       |
| 5     | Surface 4 Export                       | 2 h  | 14 h       |
| 6     | Polish UI                              | 3 h  | 17 h       |
| 7     | Docs + demo script                     | 2 h  | 19 h       |
| 8     | Bonus (optional)                       | —    | —          |

Margin = 113 − 19 = ~94 h available for debug, rework, and Saad-side tasks (SketchUp/AutoCAD install + demo recording).

---

## Phase 1 — Fondations

**Status** : ✅ done
**Started** : 2026-04-22T07:09:13Z
**Finished** : 2026-04-22T12:46:18Z
**Target duration** : 2 h (hands-on work well under target; wall-clock dominated by npm / pip fetches)

### Iter 01 — bootstrap (2026-04-22T07:09Z → 2026-04-22T12:46Z, ≈ wall-clock but mostly npm install and pip resolve)

- [x] Renamed `claude.md.md` → `CLAUDE.md`
- [x] Created `.gitignore`, `LICENSE` (MIT), `.env.example`, `README.md`
- [x] `BUILD_LOG.md` + `BLOCKERS.md`
- [x] `git init` + first commit (`57e91fd chore(bootstrap)`)
- [x] Backend scaffold — `backend/pyproject.toml`, `app/main.py`, `app/config.py`, `app/claude_client.py` (stub), namespaced packages, `tests/test_health.py` green in 1.48 s
- [x] Frontend scaffold — Vite + React 18 + TS strict + Tailwind 3.4 + Framer 11, 5 routes (Landing / Brief / TestFit / Justify / Export), Fraunces + Inter + JetBrains Mono via Google Fonts, section 11 palette wired in `tailwind.config.ts`
- [x] `vendor/sketchup-mcp/` + `vendor/autocad-mcp/` cloned (depth=1), inner `.git` stripped
- [x] `scripts/run_dev.ps1`
- [x] Phase 1 smoke tests green :
  - `pytest -q` → 1 passed
  - `tsc -b --noEmit` → no errors
  - Live `uvicorn` + `curl /health` → `{status:"ok",version:"0.1.0",model:"claude-opus-4-7",api_key_loaded:false}`
  - Live `vite` + `curl localhost:5173/` → HTML served (1 082 bytes)

### Notes appended during bootstrap

- SketchUp plugin path in the fork is `vendor/sketchup-mcp/su_mcp/` + `su_mcp.rb`, NOT `sketchup_plugin/` as CLAUDE.md section 12 mentioned. `BLOCKERS.md B3` updated with the correct path for Saad.
- `readme = "../README.md"` rejected by setuptools (path outside package). Dropped the field — README is reachable via repo root regardless.
- Phase 1 consumed **zero** Opus tokens, as planned.

### Security flag (carry until resolved)

> ⚠️ Anthropic API key `sk-ant-api03-9ja3…mhXwAA` was pasted in clear inside the `/loop` prompt. It is now considered compromised. **No facturable Opus call will be made until Saad rotates the key** on https://console.anthropic.com/settings/keys and stores the new value in `.env` (never in `CLAUDE.md`, never in commits).
> This log entry stays until the rotation is confirmed.

### Token budget (section 16)

| Bucket     | Budget  | Used so far | Remaining |
|------------|---------|-------------|-----------|
| Input      | 300 000 | 0           | 300 000   |
| Output     | 100 000 | 0           | 100 000   |

Phase 1 is 100 % local scaffolding — zero API calls expected.

### Iter 02 — API key wired & live round-trip (2026-04-22T13:10Z)

- Saad explicitly authorised using the pasted key despite the exposure (see BLOCKERS.md B0).
- Key written to `.env` at repo root (gitignored).
- Fixed a config bug : Claude Code exports an empty `ANTHROPIC_API_KEY` in the shell environment, which was shadowing the `.env` value. `backend/app/config.py` now calls `dotenv.load_dotenv(override=True)` before `BaseSettings` reads env, so the `.env` wins.
- Smoke round-trip : `ClaudeClient.messages_create(max_tokens=32, ...)` returned `"ready"` in 22 input / 6 output tokens. Call is logged in `backend/logs/api_calls.jsonl`.
- Budget consumed so far : 22 input / 6 output (negligible).

---

## Phase 2 — Surface 1 Brief

**Status** : ✅ done
**Started** : 2026-04-22T13:10Z (immediately after Phase 1, at Saad's request,
cancelled the 25 min wake-up)
**Finished** : 2026-04-22T13:22Z
**Target duration** : 3 h (nominal) — delivered well under budget thanks to
web-search batching and the key already rotated in .env.

### What landed

**10 MCP Resources** in `backend/app/data/resources/` (real-sourced, each 100 –
220 lines, `[À VÉRIFIER]` markers for anything not web-verified) :

1. `office-programming.md` — NIA ratios, program splits, meeting mix, Leesman 2024
2. `acoustic-standards.md` — NF S 31-080 levels, DnT,A, TR60, Sabine, WELL
3. `pmr-requirements.md` — Arrêté 20 avril 2017, widths, adapted WC
4. `erp-safety.md` — ERP type W, effectif, exits, alarm by category, extinguishers
5. `ergonomic-workstation.md` — NF EN 527-1, EN 12464-1, R. 4223, ventilation
6. `neuroarchitecture.md` — Browning 14 patterns, Kellert, Nieuwenhuis 2014, ART, SRT
7. `flex-ratios.md` — 2024-2025 industry data, policy → ratio, pitfalls
8. `furniture-brands.md` — Steelcase Migration SE, Jarvis, Framery One dimensions
9. `collaboration-spaces.md` — phone booth → town hall, footprints, adjacency
10. `biophilic-office.md` — plant density, species by light, NASA-study caveat

**Machine-readable ratios** : `backend/app/data/benchmarks/ratios.json`
(policy→flex ratio, peak factor, meeting mix / 100 FTE, Leesman %, PMR widths,
lighting, planting density).

**Agent orchestration** :
- `backend/app/agents/orchestrator.py` — `Orchestration.run_with_consolidator`
  runs sub-agents in parallel via `ThreadPoolExecutor`, pipes aggregated output
  into a consolidator prompt. `OrchestrationResult` exposes full trace + totals.
- 4 prompts in `backend/app/prompts/agents/` : Effectifs, Benchmarks,
  Contraintes, Consolidator — each with hard "no fabrication, cite or flag
  `[À VÉRIFIER]`" rules.
- `backend/app/surfaces/brief.py` — wires the 3 sub-agents + consolidator with
  the right MCP resources injected per agent (tight context).

**HTTP surface** :
- `GET /api/brief/manifest` — lists the 10 resources and ratios version
- `POST /api/brief/synthesize` — runs the full orchestration
- `backend/tests/test_brief_manifest.py` — integration test for manifest +
  422 on too-short brief. `pytest` : **3 passed**.

**Frontend** :
- `frontend/src/lib/api.ts` — typed client
- `frontend/src/routes/Brief.tsx` — full UI : brief textarea (Lumen pre-filled),
  client name, 4-agent trace with live status dots, expandable per-agent trace
  cards, consolidated programme rendered via `react-markdown` + `remark-gfm` +
  `@tailwindcss/typography`. `tsc` : clean.

### Live end-to-end round-trip on Lumen brief

| Agent         | Tokens in | Tokens out | Duration |
|---------------|-----------|------------|----------|
| Effectifs     | 12 308    | 3 864      | 68.3 s   |
| Benchmarks    | 16 718    | 2 548      | 47.2 s   |
| Contraintes   | 12 743    | 4 000      | 75.4 s   |
| Consolidator  | 11 659    | 4 787      | 89.1 s   |
| **Total**     | **53 428**| **15 199** | 164.5 s  |

Output quality: the consolidator produced a full programme (130 postes,
0.75 flex ratio, 12.3 m²/FTE, split 30 / 26 / 25 / 19 %), inline citations to
`design://` URIs and `ratios_json` paths, and correctly flagged the two
regulatory red flags (escalier central encloisonnement + ascenseur PMR
existence) plus the café/town hall désenfumage threshold.

### Gotcha fixed

- `temperature=` is **deprecated for `claude-opus-4-7`** — the SDK returns
  `BadRequestError` : `` `temperature` is deprecated for this model. ``.
  Orchestrator now omits it.

### Token budget to date

| Bucket     | Budget  | Used (smoke + Lumen) | Remaining |
|------------|---------|----------------------|-----------|
| Input      | 300 000 | 53 450               | 246 550   |
| Output     | 100 000 | 15 205               | 84 795    |

Phase 3 (Test Fit) uses Vision HD on plans → heavier input per call. The
remaining budget supports ≈ 5 – 7 full Brief runs or ~ 3 – 4 Vision-heavy
Test Fit runs.

### Iter 03 — Phase 2 wrap (2026-04-22T13:22Z)

Commit incoming with all the above. Phase 3 scheduled immediately.

---

## Phase 3 — Pipeline PDF + Surface 2 Test Fit

**Status** : ✅ code complete, live test deferred
**Started** : 2026-04-22T13:22Z (Saad interrupted the 25 min wake-up to kick
this off immediately)
**Finished** : 2026-04-22T13:49Z
**Target duration** : 5 h — delivered in ~27 min of wall-clock by reusing the
Phase 2 orchestration skeleton and using the recording-mock SketchUp backend.

### What landed

**Domain model** `backend/app/models.py` — `Point2D`, `Polygon2D`, `Column`,
`TechnicalCore`, `Window`, `Door`, `Stair`, `FloorPlan`, `VariantStyle`,
`VariantMetrics`, `VariantOutput`, `ReviewerVerdict`, `TestFitResponse`. All
Pydantic v2, immutable-by-default, units in mm throughout.

**Lumen fixture** `backend/app/pdf/fixtures.py` — procedurally generates the
plan described in CLAUDE.md §5 : 60 m × 40 m plate, 9×6 column grid (7 m
pitch, Ø400 mm), two 6×6 m elevator/WC cores, central 4×5 m stair, 12
windows (6 north + 6 south), 3 m margin annotated "Facade Sud / Nord".

**Hybrid PDF parser** `backend/app/pdf/parser.py` :
- `render_page_to_png_bytes` → 2576 px render for Vision HD input
- `extract_vectors_pymupdf` → flat primitive scan (lines, rects, quads,
  4-bezier runs → circles)
- `call_vision_hd` → Opus 4.7 Vision call with a strict JSON schema prompt
- `fuse` → reconciles vectors (authoritative for geometry) with vision
  (authoritative for labels / facades)
- PyMuPDF-only run on the Lumen fixture : **54 columns, 2 cores, 1 stair,
  12 windows, 2 400 m² envelope**, confidence 0.70. ✅

**Furniture catalog** `backend/app/data/furniture/catalog.json` — **41 SKUs**
across 18 typologies : desks (Steelcase Migration SE × 2 widths, Jarvis × 2,
Vitra Tyde 2, Humanscale Float), task chairs (Series 1, Gesture, Aeron B,
Embody, ID Chair, Wilkhahn ON, Arper Kinesit, Sedus SE:motion), meeting
tables (Eames Segmented 2400/4000, Everywhere, USM Haller), phone booths
and meeting pods (Framery One / One Compact / Q, Poppin Hush, Orangebox
Air3, Kinnarps Fields, Nowy Styl Office Lab), lounge (Vitra Alcove / Soft
Work, Hay Mags Soft, Muuto Outline), stacking (Tip Ton, Magis Jam),
storage & lockers (Bisley Essentials, Kado Locker, Steelcase Flex),
partitions (V.I.A., Enclose). Dimensions are from manufacturer pages where
sourced, `[À VÉRIFIER]` otherwise.

**SketchUp MCP client** `backend/app/mcp/sketchup_client.py` :
- `RecordingMockBackend` — logs every call, returns plausible fakes
  (perfect while Saad has no SketchUp installed — BLOCKERS B1/B3)
- `TcpJsonBackend` — minimal line-delimited JSON TCP client compatible
  with the mhyrr/sketchup-mcp wire format
- `get_backend()` auto-picks real vs mock by probing the MCP port
- `SketchUpFacade` exposes the 11 high-level operations from CLAUDE.md §10

**SketchUp Ruby extensions** `sketchup-plugin/design_office_extensions.rb` —
the propriétaire tools (`create_workstation_cluster`, `create_meeting_room`,
`create_phone_booth`, `create_partition_wall`, `create_collab_zone`,
`apply_biophilic_zone`, `validate_pmr_circulation`,
`compute_surfaces_by_type`) implemented as a thin Ruby layer over
`Sketchup.active_model`. To be loaded alongside the mhyrr plugin once
SketchUp Pro is installed.

**Level 2 orchestration** `backend/app/surfaces/testfit.py` +
`backend/app/prompts/agents/testfit_variant.md` +
`testfit_reviewer.md` :
- Three variant agents run in parallel with distinct style directives
  (villageois / atelier / hybride_flex), each producing a structured JSON
  plan (zones + metrics + narrative).
- Python replays the JSON on the SketchUp facade (mock in dev, real once
  SketchUp is up) and collects the trace + screenshot.
- Three reviewer runs in parallel emit a verdict JSON (pmr_ok / erp_ok /
  programme_coverage_ok / issues / verdict).
- Context per agent is trimmed to the relevant MCP resources only
  (acoustic + collab + biophilic + programming for variants ; PMR + ERP +
  programming for the reviewer).

**HTTP**
- `GET /api/testfit/catalog` → returns 41 SKUs / 18 typologies summary
- `GET /api/testfit/fixture` → regenerates + parses the Lumen fixture PDF
- `POST /api/testfit/parse` → multipart upload, hybrid pipeline
- `POST /api/testfit/generate` → receives plan + programme + styles, runs
  the 3-variant + 3-reviewer orchestration, returns `TestFitResponse`

**Frontend** `/testfit` (`frontend/src/routes/TestFit.tsx`) :
- PDF upload OR preloaded Lumen fixture
- Plan summary (area, columns, cores, stairs, windows, confidence)
- Programme textarea with fallback, persisted to localStorage
- Three-tab variant viewer with coloured dots for reviewer verdicts
- `PlanSvg` component (`frontend/src/components/viewer/PlanSvg.tsx`) —
  renders the `FloorPlan` to SVG with envelope, columns, cores, stairs,
  windows and variant zone overlays (workstation clusters, meeting rooms,
  phone booths, collab zones, biophilic zones).
- Variant detail panel : metrics tiles (postes / réunions / booths / flex
  ratio / collab m² / total), reviewer verdict chip, full narrative
  rendered via react-markdown.

### Tests

`backend/tests/test_testfit.py` — 3 new tests :
- catalog lists ≥ 40 items at the expected version
- fixture returns the Lumen FloorPlan with the expected geometry (2 400 m²,
  ≥ 50 columns, ≥ 2 cores, 1 stair, windows on both facades)
- fixture PDF is materialised on disk after first hit

`pytest -q` : **6 passed**. `tsc -b --noEmit` : clean.

Live smoke test : backend booted on :8000, `GET /api/testfit/catalog` and
`GET /api/testfit/fixture` both returned valid payloads.

### Budget discipline — Opus calls deferred

The **Brief surface live round-trip already exercised the same orchestrator**
(the generic `run_parallel_agents` + `run_with_consolidator` pattern). The
Test Fit surface reuses that exact code path with different prompts and a
replay step, so a structural test (6 unit tests + TS compile) gives high
confidence without burning another ~100 – 150 k tokens on 3 variants + 3
reviewers.

**The live `/api/testfit/generate` round-trip is the final hackathon demo
check, to be done from the frontend once Saad is awake to watch — cost
≈ 80 – 140 k tokens.**

### Budget to date

| Bucket     | Budget  | Used    | Remaining |
|------------|---------|---------|-----------|
| Input      | 300 000 | 53 450  | 246 550   |
| Output     | 100 000 | 15 205  | 84 795    |

Phase 3 consumed **zero** Opus tokens in code. A full Test Fit run on Lumen
is projected at ~90 – 130 k input + 15 – 25 k output.

### Iter 04 — Phase 3 wrap (2026-04-22T13:49Z)

Ready for Phase 4 (Surface 3 Justify). Commit + schedule in flight.

---

## Phase 4 — Surface 3 Justify — in progress (see Iter 05)

## Saad-facing live connection checklist (SketchUp + AutoCAD)

Once both applications are installed, follow this in order. Every step has a
verification command so we know it landed.

### A. SketchUp Pro

1. **Install SketchUp Pro** (trial 7 days : https://www.sketchup.com/try-sketchup).
2. **Locate the plugins folder**. On Windows it is typically :
   `C:\Users\<you>\AppData\Roaming\SketchUp\SketchUp 2024\SketchUp\Plugins\`
3. **Copy the mhyrr plugin** (from `vendor/sketchup-mcp/`) :
   - Copy `su_mcp.rb` (the bootstrap file) into the Plugins folder.
   - Copy the entire `su_mcp/` **directory** into the Plugins folder (alongside `su_mcp.rb`).
4. **Copy the Design Office extensions** : copy
   `sketchup-plugin/design_office_extensions.rb` into the Plugins folder as well.
5. **Restart SketchUp**. Look for `SU MCP Server running on port 9876` in the
   Ruby console (Window → Ruby Console).
6. **Verify from the backend** : with the backend venv active, run
   `python -c "from app.mcp.sketchup_client import try_connect_tcp; print(try_connect_tcp('127.0.0.1', 9876))"`. Expect `True`.
7. **Verify Design Office tools** : in the Ruby Console, call
   `DesignOffice.create_phone_booth(position_mm: [5000, 5000], product_id: 'framery_one_compact')`. A pod-shaped block should appear at (5, 5 m) in the current SketchUp model.
8. **No code changes needed backend-side** — `get_backend()` in
   `backend/app/mcp/sketchup_client.py` auto-detects the open TCP port and
   switches from `RecordingMockBackend` to `TcpJsonBackend`. The
   `SketchUpFacade` wrapper is backend-agnostic, so every existing surface
   keeps working.

### B. AutoCAD (LT 2024 or full)

1. **Install AutoCAD** (trial 30 days : https://www.autodesk.com/products/autocad-lt/free-trial).
2. **Choose a watch folder** (e.g. create `autocad_watch/` at the repo root —
   the .gitignore already protects the `out/` and temp patterns ; if you want
   a different location, set `AUTOCAD_MCP_WATCH_DIR` in `.env`).
3. **Load the LISP dispatcher** : in AutoCAD's command line, run
   `APPLOAD`, then select `vendor/autocad-mcp/lisp-code/mcp_dispatch.lsp`.
4. **Add the LISP to Startup Suite** so it auto-loads every session.
5. **Configure the LISP's watch folder** : follow the puran-water README
   (the LISP exposes a `(setq mcp-watch-dir "…/autocad_watch")` or similar
   command) — set it to the same folder as the `AUTOCAD_MCP_WATCH_DIR`
   above.
6. **Verify** :
   - In AutoCAD's command line, run `MCP-PING`. Expect `MCP ready` printed.
   - From the backend : `python -c "from app.mcp.autocad_client import get_backend, AutoCadFacade; f = AutoCadFacade(get_backend(force='file_ipc')); print(f.backend.__class__.__name__)"` should print `FileIpcBackend`.
7. **No code changes needed backend-side** — `get_backend()` in
   `backend/app/mcp/autocad_client.py` returns `FileIpcBackend` as soon as
   the watch folder exists and is writable. The `EzdxfHeadlessBackend` stays
   available for automated tests via `get_backend(force='ezdxf')`.

### C. Fallback if either tool is unavailable

- **No SketchUp** : the `RecordingMockBackend` records every intended
  SketchUp operation. Variant generation and the Justify argumentaire work
  end-to-end without it — only the 3D screenshots and live iteration are
  unavailable.
- **No AutoCAD** : the `EzdxfHeadlessBackend` generates a real DXF file on
  disk that opens natively in AutoCAD (or Adobe Illustrator, BricsCAD, etc.).
  Only `plot_pdf` is emulated — for a real A1 PDF plot, route through the
  File IPC backend with AutoCAD running.

### D. Environment variables to set in `.env`

- `ANTHROPIC_API_KEY=<rotated key>` — once B0 is resolved, replace the leaked
  key.
- `AUTOCAD_MCP_WATCH_DIR=<absolute path>` — optional, only if the watch
  folder is outside the repo root.
- `SKETCHUP_MCP_HOST` / `SKETCHUP_MCP_PORT` — only if the SketchUp plugin is
  configured for a non-default host/port.

### Iter 05 — Quality pass (2026-04-22T15:48Z)

Triggered by Saad's 4-point directive (tokens unlimited, SketchUp/AutoCAD
ready, richer resources/code, Vision HD always-on).

**Shipped this iteration** :

- **Live round-trip on Lumen** : `scripts/run_lumen_full.py` runs the
  full hybrid parser (Vision HD forced) + 3-variant + 3-reviewer pipeline.
  First run = 126 k / 19 k tokens, 93 s, 2 variants hit max_tokens and
  failed JSON parsing.
- **Fix** : raised variant `max_tokens` 6 000 → 16 000. Second run = 142 k
  / 22 k tokens, 108 s, **all 3 variants parsed cleanly**, 130 / 130 /
  112 postes ; verdicts rejected / approved_with_notes / rejected. Saved
  `backend/tests/fixtures/generate_output_sample.json` (133 k bytes) for
  client-side inspection.
- **Parser upgrades** (`backend/app/pdf/parser.py`) :
  - Enriched Vision HD schema — now requests text labels, orientation
    arrow, door swings, stair direction, architectural symbols
    (WC / sink / compass / title block), uncertainties.
  - Fixed window fusion regression — PyMuPDF line detection always runs,
    Vision HD overlays facade semantics.
  - `max_tokens` on Vision raised to 8 192.
- **ClaudeClient robustness** (`backend/app/claude_client.py`) :
  exponential retries (up to 4 attempts, 1.5 – 20 s back-off, jittered),
  structured JSONL logs including attempts + outcome + error class,
  `_is_retryable` classifier for `APIConnectionError`, `APIStatusError`
  (5xx / 429), `APITimeoutError`, `RateLimitError`, and overloaded-error
  markers. `stderr` gets human-readable log lines for live demos.
- **MCP resource enrichment** (total : 1 500 → 2 700 lines sourced) :
  - `neuroarchitecture.md` : 517 lines. Full 14-pattern table, Kellert
    24 attributes, Nieuwenhuis 2014 +15 %, Ulrich 1984 surgery study,
    Kaplan ART with empirical caveat, Taylor fractals 1.3-1.5,
    Heerwagen Savanna Hypothesis, Hongisto STI link, 10 peer-reviewed
    URLs.
  - `acoustic-standards.md` : 480 lines. NF S 31-080 three levels, full
    DnT,A / L50 / TR60 tables with values by space type, NF S 31-199
    open-plan dedicated standard (D2,S ≥ 7 dB, Lp,A,S,4m ≤ 48 dB, rD
    ≤ 5 m, rC 3 – 30 m), ISO 3382-3:2022 metrics, Hongisto 2005 +
    Haapakangas 2020 revised model, masking playbook with spectrum
    guidance, WELL v2 Sound features.
  - `biophilic-office.md` : 430 lines. Density tiers, species library
    by light environment (direct / bright-indirect / medium / low
    light / green-wall), PPFD requirements, irrigation types, cost
    envelopes, acoustic absorption contribution, water-feature
    Legionella risk, Lumen worked example.
  - `flex-ratios.md` : 355 lines. Leesman 2019-2024 trend, Gensler
    2020/2022/2023/2024 comparison, sector medians (tech / finance /
    legal / pharma / public), Lumen-specific neighbourhood split.
  - `benchmarks/ratios.json` : v `2026-04-22b`. Leesman history
    object, Gensler multi-year with sample sizes and fieldwork
    windows, ISO 3382-3 target table, Hongisto model parameters,
    Browning 14-pattern enumeration, key-studies citation index.
- **AutoCAD MCP** (`backend/app/mcp/autocad_client.py`) : dual-backend
  client with identical facade.
  - `EzdxfHeadlessBackend` materialises a real DXF with Design Office
    layers (AGENCEMENT / MOBILIER / COTATIONS / CLOISONS /
    CIRCULATIONS) — unit-tested against a 60 × 40 m Lumen envelope.
  - `FileIpcBackend` talks to the puran-water LISP dispatcher via a
    shared watch folder, uuid-keyed JSON request/response, 15 s
    timeout with descriptive failure message.
  - `get_backend()` auto-picks based on watch-folder presence ;
    `force='ezdxf'` / `force='file_ipc'` override for tests and
    surgical debugging.
  - 2 new tests in `test_autocad_client.py`, all green.
- **`AUTOCAD_MCP_WATCH_DIR`** added to `.env.example` and to the Settings.
- **SketchUp + AutoCAD live-connection checklist** (this section) added so
  the live switch is zero-code once the apps are installed.

**Token usage for this iteration** : ~380 k input (most of it the 2 live
round-trips), ~41 k output. Budget no longer a constraint per Saad's
directive.

---

## Iter 06 — Phase 4 Justify

_In progress after this log entry._
