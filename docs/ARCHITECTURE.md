# Architecture

Deep dive on how Design Office is wired. Reads best alongside
[`BUILD_LOG.md`](../BUILD_LOG.md), which timestamps every iteration and
records live token usage, and [`CLAUDE.md`](../CLAUDE.md), which frames
the original mission.

---

## 1. System overview

```
┌─ FRONTEND ────────────────────────────────────────────────────────┐
│  Vite + React 18 + TS strict + Tailwind + Framer + react-markdown │
│  + @tailwindcss/typography                                        │
│                                                                   │
│  Routes : /           → Landing                                   │
│           /brief      → Brief synthesis + industry selector       │
│           /testfit    → Macro (3 variants) + Micro (drill-down)   │
│           /moodboard  → Client-aware A3 landscape mood board      │
│           /justify    → Sourced argumentaire + A4 PDF + PPTX      │
│           /export     → A1 DXF with Design Office layers          │
│           /chat       → Full-page Ask Design Office               │
│                                                                   │
│  Components : PlanSvg (envelope + columns + cores + variant zones)│
│               PseudoThreeDViewer (6-angle SketchUp captures)      │
│  State : unified project_state (localStorage) — brief, programme, │
│          industry, floor plan, testfit result, retained variant,  │
│          mood-board selection, view_mode (engineering|client)     │
│  Chat drawer : page-aware context, action dispatch, enrichment    │
└───────────────────────┬───────────────────────────────────────────┘
                        │ HTTP (JSON)
                        ▼
┌─ BACKEND ─────────────────────────────────────────────────────────┐
│  FastAPI + Pydantic v2                                            │
│                                                                   │
│  ┌ app/main.py                                                    │
│  │   /health, /api/brief/*, /api/testfit/*, /api/justify/*,       │
│  │   /api/export/*                                                │
│  │                                                                │
│  ├ app/agents/orchestrator.py                                     │
│  │   ThreadPoolExecutor fan-out for sub-agents                    │
│  │   run_with_consolidator pattern reused by every fan-out level  │
│  │                                                                │
│  ├ app/surfaces/                                                  │
│  │   brief.py       (Level-1 : 3 sub-agents + consolidator)       │
│  │   testfit.py     (Level-2a macro: 3 variants + reviewers ;     │
│  │                   Level-2b micro: drill-down on one variant)   │
│  │   moodboard.py   (Level-3 curator : palette + materials +      │
│  │                   furniture + planting + light ; A3 PDF)       │
│  │   justify.py     (Level-4 : 4 researchers + consolidator +     │
│  │                   A4 PDF + 6-slide PPTX pitch deck)            │
│  │   export.py      (Deterministic DXF synthesis)                 │
│  │                                                                │
│  ├ app/chat.py      (cross-page chat, page-aware context,         │
│  │                   action dispatch, project enrichment)         │
│  │                                                                │
│  ├ app/claude_client.py                                           │
│  │   Exponential jittered retries (max 4 attempts, 1.5 – 20 s)    │
│  │   Retries on 5xx / 429 / overloaded / APIConnectionError /     │
│  │   APITimeoutError / RateLimitError                             │
│  │   Every call logged to logs/api_calls.jsonl                    │
│  │                                                                │
│  ├ app/pdf/                                                       │
│  │   fixtures.py    (Lumen fictitious plan generator)             │
│  │   parser.py      (Vision HD always-on + PyMuPDF fusion)        │
│  │                                                                │
│  ├ app/mcp/                                                       │
│  │   sketchup_client.py  (JSON-RPC 2.0 over TCP + eval_ruby       │
│  │                        dispatch to DesignOffice module ;       │
│  │                        RecordingMockBackend for headless)      │
│  │   autocad_client.py   (ezdxf headless + File-IPC live)         │
│  │                                                                │
│  └ app/data/                                                      │
│      resources/   13 MCP Markdown resources (3 400 lines sourced) │
│      benchmarks/  ratios.json (machine-readable)                  │
│      furniture/   catalog.json (41 SKUs, 18 typologies)           │
│      fixtures/    Lumen fictitious plan PDF                       │
└────┬───────────────────────────────────────────────┬──────────────┘
     │                                               │
     ▼                                               ▼
┌──────────────────────┐                 ┌────────────────────────┐
│  SKETCHUP (via MCP)  │                 │  AUTOCAD (via MCP)     │
│                      │                 │                        │
│  mhyrr/sketchup-mcp  │                 │  puran-water/          │
│  fork + our          │                 │  autocad-mcp fork      │
│  design_office_      │                 │                        │
│  extensions.rb       │                 │  Design Office         │
│                      │                 │  ezdxf headless +      │
│  Real SketchUp Pro   │                 │  File-IPC live         │
└──────────────────────┘                 └────────────────────────┘
```

---

## 2. Managed-agent orchestration across six surfaces

The core claim of Design Office is that **managed agents at the right level
of abstraction** produce better design artefacts than a single monolithic
call. The orchestration fans out across four levels, serving six
surfaces :

### Level 1 — Programme synthesis (Surface I · Brief)

Input : client brief (unstructured), client name (optional),
`client_industry` (one of `tech_startup`, `law_firm`, `bank_insurance`,
`consulting`, `creative_agency`, `healthcare`, `public_sector`, `other`)
Output : sourced functional programme (Markdown, ~1 200 words)

Sub-agents run in parallel with different specialties :

| Agent | System prompt | Context |
|-------|---------------|---------|
| **Effectifs** | "Calculate the space matrix with defended ratios" | `office-programming.md`, `flex-ratios.md`, `collaboration-spaces.md`, `ratios_json` |
| **Benchmarks** | "Position the brief against Leesman / Gensler / HOK" | `office-programming.md`, `flex-ratios.md`, `neuroarchitecture.md`, `biophilic-office.md`, `ratios_json` |
| **Contraintes** | "Identify every regulatory constraint applicable" | `erp-safety.md`, `pmr-requirements.md`, `ergonomic-workstation.md`, `acoustic-standards.md` |

Consolidator merges into a single document with 7 fixed sections
(programme table, surface summary, industry positioning, regulatory
envelope, risks, next steps, sources).

### Level 2a — Macro-zoning (Surface II · Test Fit, macro tab)

Input : retained programme + parsed FloorPlan (from Vision HD) + furniture
catalogue + client industry
Output : 3 structured variants + 3 reviewer verdicts

Sub-agents :

| Variant | Design directive |
|---------|-----------------|
| **Villageois** | Central collab heart, team quartiers around, phone booths at junctions |
| **Atelier** | Workstations hug the luminous façade, consolidated collab inward |
| **Hybride flex** | Flex ratio pushed to 0.65, mobile furniture, strong brand identity |

Each variant emits a **strict JSON plan** (`{style, title, narrative, zones,
metrics}`). The Python layer replays the zones through the SketchUp facade
(mock or live) to produce a concrete scene. A Reviewer agent then grades
each variant JSON against PMR / ERP / programme coverage / column integrity,
emitting a verdict `{pmr_ok, erp_ok, programme_coverage_ok, issues,
verdict}`.

On the Lumen fixture :

- All three variants produced 112 – 130 desks
- One verdict `approved_with_notes` (atelier), two `rejected` (catching
  real issues : back-of-house missing, 300 m² open-plan désenfumage trigger)

### Level 2b — Micro-zoning (Surface II · Test Fit, micro tab)

Input : retained variant (one of the three) + programme + floor plan +
furniture catalogue + client industry
Output : a zone-by-zone Markdown drill-down, ~11 KB, covering each
zone's furniture refs, finishes (with real brand + product IDs),
acoustic targets (D2,S / DnT,A / TR60 / background dB), lighting
(lux + K), biophilic accents, sight-lines, and honest `[TO VERIFY]`
flags.

A single agent with a long system prompt that stitches together the
acoustic / material-finishes / biophilic / ergonomic / regulatory MCP
resources. On the Lumen fixture : 52 k in / 5 k out / 185 s.

### Level 3 — Mood-board curator (Surface III · Mood Board)

Input : retained variant + client industry + client name + tagline
(optional) + brief excerpt
Output : single structured JSON `{header, atmosphere, palette,
materials, furniture, planting, light}` → rendered into an A3
landscape PDF by a ReportLab pipeline

A single industry-aware curator agent. System prompt pulls in
`mood-board-method.md`, `material-finishes.md`, `client-profiles.md`,
and the relevant industry row (law firms get walnut + leather + dark
green ; tech gets oak + linen + a sun accent ; creative agencies get
plaster + raw plywood + kiln terracotta + acid yellow). Every product
cited is a real manufacturer SKU so a space planner can place the
order from the PDF.

Live three-industry proof on identical code paths, only the brief +
industry change :

| Client | Industry | Hero palette | Signature materials |
|--------|----------|--------------|---------------------|
| Lumen | `tech_startup` | Linen + Pale oak + Lumen sun | Amtico Worn Oak, Kvadrat linen, BAUX wood-wool, Framery One |
| Altamont & Rees | `law_firm` | Chambers green + Walnut leather + Aged brass | Dinesen Douglas plank, Farrow & Ball Card Room Green, Mutina Margarita, Création Baumann Hush |
| Kaito Miró | `creative_agency` | Plaster ivory + Kiln terracotta + Acid yellow | Clayworks plaster, BAUX terracotta, Woven Image EchoPanel, Bolon Artisan |

### Level 4 — Research & Cite (Surface V · Justify)

Input : retained variant + programme + floor plan + client brief
Output : single client-facing argumentaire (Markdown, ~1 500 words)

Four specialty researchers run in parallel :

| Agent | Coverage | Resources |
|-------|----------|-----------|
| **Acoustic** | NF S 31-080, NF S 31-199, ISO 3382-3, Hongisto | `acoustic-standards.md`, `collaboration-spaces.md`, `neuroarchitecture.md` |
| **Biophilic** | Browning 14, Kellert, Nieuwenhuis 2014, Ulrich, ART | `neuroarchitecture.md`, `biophilic-office.md`, `ergonomic-workstation.md` |
| **Regulatory** | ERP type W, PMR, code du travail, EN 12464-1 | `pmr-requirements.md`, `erp-safety.md`, `ergonomic-workstation.md` |
| **Programming** | Leesman multi-year, Gensler multi-year, flex industry state | `office-programming.md`, `flex-ratios.md`, `collaboration-spaces.md` |

Each emits a Markdown block matching its system-prompt template. The
Consolidator merges the four memos into one 7-section document (Le pari /
recherche / réglementation / arbitrages / KPIs / prochaines étapes /
sources). A **ReportLab** renderer ships the final argumentaire as an A4
PDF with the Design Office palette and typography.

On the Lumen fixture : 148 k in / 22 k out tokens, 229 s, 14 242-char
argumentaire, 5-page PDF.

---

## 3. Vision HD is the plan-reading brain

`backend/app/pdf/parser.py` implements a **hybrid** parser where Vision
HD and PyMuPDF cover different layers :

- **PyMuPDF** extracts the drawing primitives : lines, rectangles, quads,
  circles (via 4-bezier runs). Authoritative for **geometry** — exact
  column coordinates, envelope corners, core outlines.
- **Opus Vision HD** at 2 576 px reads the rendered PNG and returns a
  strict JSON with **semantic layers** PyMuPDF cannot see :
  - Text labels with `purpose: "room_name" | "dimension" | "scale" | "orientation" | "other"`
  - Orientation arrow (N label + from/to pixel coordinates)
  - Door swings (left / right / both)
  - Stair direction (up / down / both)
  - Window style (single / double / curtain wall)
  - Architectural symbols (WC, sink, compass rose, title block, section cut)
  - Uncertainties list

The `fuse()` step reconciles both : PyMuPDF wins on geometry, Vision overlays
facade semantics, labels, symbol recognition. When Vision returns empty or
disagrees, PyMuPDF's geometry is trusted ; Vision's semantic layer is added
as metadata on matching entities.

**Vision is always on** — even when PyMuPDF has clean vector data, Vision
contributes the facade cardinal direction (from the N-arrow), door swings,
and the room-name labels the plan may carry. This is the single most
creative use of Opus 4.7 in Design Office and drives the "Most Creative
Opus 4.7 Exploration" prize bet.

---

## 4. MCP Resources — the "Keep Thinking" layer

`backend/app/data/resources/` holds 13 Markdown files, ~3 400 lines total.
Every number cited traces back to a URL or carries `[À VÉRIFIER]`.

| Resource | Headline content |
|----------|------------------|
| `office-programming.md` | NIA / FTE ratios, programme split, meeting mix, Leesman anchor |
| `acoustic-standards.md` | NF S 31-080, NF S 31-199, ISO 3382-3, Hongisto, masking playbook |
| `pmr-requirements.md` | Arrêté 20 avril 2017, widths, adapted WC, turning circles |
| `erp-safety.md` | ERP type W, category thresholds, exits, alarm systems |
| `ergonomic-workstation.md` | NF EN 527-1, EN 12464-1, R. 4223, ventilation |
| `neuroarchitecture.md` | Browning 14, Kellert 24, Nieuwenhuis, Ulrich, Kaplan, Taylor, Heerwagen |
| `flex-ratios.md` | Leesman 2019-2024, Gensler 2020-2024, sector medians |
| `furniture-brands.md` | 41 SKUs across 18 typologies, manufacturer URLs |
| `collaboration-spaces.md` | Phone booth → town hall sizings and adjacency rules |
| `biophilic-office.md` | Density tiers, species library by light, maintenance |
| `mood-board-method.md` | Six-block mood-board structure, brand logic, fabric grammar (iter-16) |
| `material-finishes.md` | Real-brand materials for floors / walls / ceilings / textiles (iter-16) |
| `client-profiles.md` | Industry-by-industry palette + material + furniture grammar (iter-16) |

`backend/app/data/benchmarks/ratios.json` is the machine-readable companion
— agents cite specific `ratios_json.<path>` nodes in their output.

---

## 5. Claude client — retries, logs, audit trail

`backend/app/claude_client.py` wraps the Anthropic SDK with :

- **Exponential retries** up to 4 attempts, 1.5 – 20 s jittered back-off
- Retryable error classes : `APIConnectionError`, `APITimeoutError`,
  `RateLimitError`, `APIStatusError` (5xx / 429 / overloaded marker)
- **Non-retryable** errors surface immediately (invalid request, auth, etc.)
- Every call appended to `backend/logs/api_calls.jsonl` with :
  `{timestamp, model, input_tokens, output_tokens, duration_ms, tag,
   attempts, outcome, error_class, error_message}`
- Human-readable stderr logs at INFO — tail the file during demos to
  watch the agents work

The `tag` field carries the call site (`brief.synthesize:Effectifs`,
`justify.consolidate:Consolidator`, `pdf.vision`, `testfit.variant:atelier`,
etc.), so the log is a complete audit of a run.

---

## 6. SketchUp MCP integration

The vendor plugin (`mhyrr/sketchup-mcp`) speaks **JSON-RPC 2.0** on TCP
port 9876 and exposes a small set of primitive tools :
`create_component`, `delete_component`, `transform_component`,
`get_selection`, `export`, `set_material`, `boolean_operation`,
`chamfer_edges`, `fillet_edges`, `create_mortise_tenon`, `create_dovetail`,
`create_finger_joint`, **`eval_ruby`**.

Our Design Office operations (`create_workstation_cluster`,
`create_meeting_room`, `create_phone_booth`, `create_partition_wall`,
`create_collab_zone`, `apply_biophilic_zone`) are **not** in the vendor
set — they live in our own `DesignOffice` Ruby module. The module is
loaded at SketchUp startup alongside the vendor plugin (both in the
Plugins folder).

To call a high-level op from Python, `TcpJsonBackend` sends an
`eval_ruby` request :

```ruby
require 'json'
_params = JSON.parse('{"position_mm": [5000, 6000], "product_id": "framery_one_compact"}')
DesignOffice.create_phone_booth(**_params.transform_keys(&:to_sym))
'ok'
```

The DesignOffice module wraps each op in `with_operation(name)` with
commit/abort semantics so a geometry error in one zone returns
`{ok: false, error: ...}` without aborting the rest of a variant.

`get_backend()` auto-probes the port and returns `TcpJsonBackend` if
SketchUp is running, `RecordingMockBackend` otherwise. `SketchUpFacade`
is backend-agnostic so every surface works both live and headless.

---

## 7. AutoCAD MCP integration

`backend/app/mcp/autocad_client.py` has two backends implementing the
same `AutoCadBackend` protocol :

### EzdxfHeadlessBackend

- Pure Python, no AutoCAD required
- Buffers facade calls and materialises at `save()` time using `ezdxf`
- Produces a real DXF file with the five Design Office layers
  (AGENCEMENT / MOBILIER / COTATIONS / CLOISONS / CIRCULATIONS), entities
  (lines, polylines, circles, rectangles, text, dimensions), layer
  colours set to the Design Office palette
- `plot_pdf` is a no-op here (emulated, returns a note)

### FileIpcBackend

- Speaks to the in-AutoCAD LISP dispatcher via a shared watch folder
- Protocol : write `<watch_dir>/in/<uuid>.json`, poll
  `<watch_dir>/out/<uuid>.json` with a 15 s timeout
- `plot_pdf` is real — a proper A1 PDF is produced by AutoCAD

### Selection logic

`get_backend()` returns `FileIpcBackend` if the watch folder exists AND
is writable (meaning the user has set `AUTOCAD_MCP_WATCH_DIR` and the
LISP is ready), `EzdxfHeadlessBackend` otherwise.
`get_backend(force='ezdxf')` / `force='file_ipc'` overrides are exposed
for tests and surgical debugging.

---

## 8. Data contract — models.py

Every surface agrees on a small set of Pydantic models :

- `FloorPlan` — envelope, columns, cores, stairs, windows, doors,
  text_labels, source_confidence, source_notes
- `VariantStyle` enum (villageois / atelier / hybride_flex)
- `VariantMetrics` — workstation_count, meeting_room_count,
  phone_booth_count, collab_surface_m2, etc., flex_ratio_applied, notes
- `VariantOutput` — style, title, narrative, metrics, sketchup_trace,
  screenshot_paths
- `ReviewerVerdict` — style, pmr_ok, erp_ok, programme_coverage_ok,
  issues, verdict
- `TestFitResponse` — aggregates them with token totals

All coordinates are **mm**, origin bottom-left, Pydantic v2 with
immutable defaults.

---

## 9. Frontend architecture

- **Vite + React 18 + TS strict** baseline
- **React Router** with 5 routes, shared `<App>` shell (sticky nav +
  Fraunces titles + Inter body + JetBrains Mono code)
- **Framer Motion** for route-level transitions and progressive
  appearance of variant / argumentaire panels
- **react-markdown + remark-gfm + @tailwindcss/typography** for rendering
  the Markdown outputs (Brief consolidated programme, Justify
  argumentaire, per-agent trace cards)
- **PlanSvg** component renders any `FloorPlan` as SVG (envelope,
  columns, cores with labels, stairs, windows) with variant zones
  overlaid (workstation clusters, meeting rooms, phone booths, collab
  zones, biophilic zones)
- **localStorage** persists :
  - `design-office.brief` — last brief submitted
  - `design-office.programme` — last programme synthesised
  - `design-office.testfit.result` — retained 3-variant result (Justify +
    Export consume it)

Typed client in `src/lib/api.ts` covers every backend route with
strict Pydantic-matched interfaces.

---

## 10. Deployment posture

The system runs as two processes on a single machine today : uvicorn +
Vite dev server. No database — state lives in the file system (resources,
fixtures, generated PDFs / DXFs). Token budget discipline is local
(logs + BUILD_LOG summary tables).

Production path (post-hackathon) :

- Package the backend as a container ; mount `app/data/` and `app/out/`
- Serve the frontend static build via a CDN
- Move the retries / rate-limiting logic to a queue (Cloud Tasks /
  RQ / Celery) so long orchestrations don't block HTTP workers
- Put the SketchUp MCP behind a worker pool, one SketchUp process per
  variant generation for true parallelism
- AutoCAD MCP stays behind File-IPC on a Windows worker because of the
  desktop-app dependency

---

## 11. Tests

```
backend/tests/
├── test_health.py         # smoke /health
├── test_brief_manifest.py # /api/brief/manifest + 422 on short brief
├── test_testfit.py        # /api/testfit/catalog + /fixture + on-disk PDF
├── test_justify.py        # Markdown parser + PDF rendering + 404 + fixture shape
├── test_export.py         # Full DXF round-trip via ezdxf.readfile
└── test_autocad_client.py # EzdxfHeadlessBackend basic writes
```

`pytest -q` : **15 passed, 7 warnings** (warnings are ezdxf / pyparsing
deprecations in 3rd-party code). `tsc --noEmit` : **clean**.

Beyond unit tests, the `backend/scripts/` directory contains the scripts
that produced the live fixtures — any of them can be re-run to
regenerate.
