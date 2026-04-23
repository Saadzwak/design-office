# Blockers — Design Office

Items that require Saad's physical intervention. Work continues around these as much as possible.

**Legend** : 🔴 critical · 🟠 pending · 🟢 resolved · 🟡 technical · ⏸ on-hold for handoff

---

## ⏸ Iter-18 handoff — parked, not blocking iter-17

### Claude Design UX refactor

Saad is running a parallel pass in Claude Design that will ship the full frontend refactor (cards-based drill-down for every surface, a macro-zoning history browser, the 2D/3D toggle on Test Fit, and a unified Mood Board visual + PDF layout).

Iter-17 is **data + backend only** so the two streams don't collide. Every new capability is behind a stable backend endpoint or a typed selector :

- `macro_zoning_runs[] / micro_zoning_runs[] / moodboard_runs[]` on `ProjectState` v2 (`frontend/src/lib/projectState.ts`) — append-only history, the history browser consumes this directly.
- `POST /api/testfit/floor-plan-2d` + `GET /api/testfit/sample/variants/{style}/floor-plan-2d` — ready for the 2D/3D toggle.
- `POST /api/moodboard/generate-visual` + `GET /api/moodboard/visual/{id}` — ready for the Pinterest-style hero on the Mood Board page.
- `POST /api/testfit/variants/zone-overlay` — ready for the coloured floor-plan hero on Test Fit.
- `adjacency_audit` on every `VariantOutput` — ready for the score pill + violation list that the iter-18 cards will render.
- Backend agent trace names mapped to studio vocabulary on the UI side (`Effectifs → Headcount`, etc.) so the Claude Design frontend inherits the clean labels.

No handoff artefact is required on this side. When the Claude Design handoff lands, the iter-18 loop will merge it on top of iter-17 without backend churn.

---

## 🔴 CRITICAL — security

### B0. Rotate the leaked Anthropic API key (post-hackathon)

- **Current state** : Saad explicitly authorised the autonomous loop to use the pasted key ("non utilise la clé que je t'ai donnée", 2026-04-22). The key is stored in `.env` at repo root and `.env` is ignored by git, so it is not in the commit history.
- **Residual risk** : the key still sits in the local Claude Code conversation transcript under `C:\Users\redaz\.claude\projects\...`. If that transcript is ever shared (support debug, screen share, export), the key leaks with it.
- **Action for Saad, after the hackathon** : rotate the key at https://console.anthropic.com/settings/keys, update `.env`, and purge or sanitise the transcript file if sharing is ever planned.
- **Action now** : none — the loop is authorised to proceed with Opus calls.

---

## 🟢 Resolved

### B1. Install SketchUp Pro ✅ (resolved 2026-04-22 iter-12)

Saad installed SketchUp Pro 2026, the extension loaded, the TCP server started on port 9876, and the full Lumen round-trip played : 3 variants × 120+ zones each, 360 TCP round-trips, 3 iso screenshots persisted to `backend/tests/fixtures/sketchup_variant_{villageois,atelier,hybride_flex}.png`.

### B3. Load the SketchUp MCP extension ✅ (resolved 2026-04-22 iter-12)

Correct double-nested layout documented below — kept for reference in case of re-install.

⚠️ The mhyrr fork has a **confusing double-nested layout** — do not copy the whole `su_mcp/` folder naively or SketchUp will report `Could not find included file 'su_mcp/main'`.

The **correct** deployment (confirmed in iter-12 on SketchUp Pro 2026) :

Plugins folder (typically `C:\Users\<you>\AppData\Roaming\SketchUp\SketchUp 2026\SketchUp\Plugins\`) must end up with :

```
Plugins/
├── su_mcp.rb                          ← copied from vendor/sketchup-mcp/su_mcp/su_mcp.rb   (INNER bootstrap, v1.5.0)
├── su_mcp/
│   ├── main.rb                        ← copied from vendor/sketchup-mcp/su_mcp/su_mcp/main.rb
│   └── extension.json                 ← copied from vendor/sketchup-mcp/su_mcp/extension.json
└── design_office_extensions.rb        ← copied from sketchup-plugin/design_office_extensions.rb
```

Do NOT copy the outer `vendor/sketchup-mcp/su_mcp.rb` (that's an older v0.1.0 with a broken path reference). Restart SketchUp — the console should print `MCP Extension loading...` then `[DesignOffice] v0.1.0 loaded`. From the Ruby Console or Extensions menu, start the server on port 9876.

### B5. Visual QA ✅ (delivered 2026-04-23 iter-15)

The "premium design agency" aesthetic of section 11 has been **exceeded**. The UI was redesigned from the terracotta/ink palette to a Kinfolk-grade **Organic Modern** identity (ivory paper, forest accent, sand + sun pigments, clay for errors, Fraunces display with SOFT + opsz axes). All five routes + the downloadable A4 PDF + 6-slide PPTX deck carry the same identity. Screenshots : `docs/screenshots/`. Principles : `docs/UI_DESIGN.md`.

Saad can still do a final eye-pass but there's no known aesthetic regression.

---

## 🟠 At wake-up (section 12 of CLAUDE.md)

### B2. Install AutoCAD (LT 2024+)

- Trial 30 days : https://www.autodesk.com/products/autocad-lt/free-trial
- Needed for the live File-IPC A1 PDF plot in Phase 5. **The `ezdxf` headless backend already ships a real DXF that opens natively in AutoCAD / BricsCAD / Adobe Illustrator** — the demo stands without AutoCAD running. Live plot is purely a bonus "File IPC" mode that appears in the Export page's backend-pipeline aside when it's available.

### B4. Load the AutoCAD MCP LISP

- Only if B2 is resolved. Inside AutoCAD command line : `APPLOAD` → load `vendor/autocad-mcp/lisp-code/mcp_dispatch.lsp` → add to Startup Suite so it reloads automatically. Set `AUTOCAD_MCP_WATCH_DIR` in `.env` (or accept the default inside the repo root).

### B6. Record the 3-minute demo video

- Script lives in `docs/DEMO_SCRIPT.md` — refreshed for the Organic Modern UI + the cinematic iterate/export panels. Saad records it himself on the Lumen use case (section 5). Pre-recorded fallback fixtures (`backend/tests/fixtures/*.json|.pptx|.dxf|.png`) let the flow play offline if Opus or SketchUp hiccups mid-take.
- **Pre-flight** : before hitting Record, run `.\scripts\demo_preflight.ps1` from the repo root. It checks 12 required artefacts on disk, backend `/health` + API key, the 4 HTTP surfaces, the frontend shell, and the SketchUp MCP TCP probe on :9876. Exits 0 when everything is green ("READY - every surface is green. Hit Record."), non-zero if any surface is down.

---

## 🟡 Technical blockers discovered during build

### B7. DWG export without AutoCAD — deferred to iter-18+ (iter-17)

Saad's iter-17 directive asked for DXF + **DWG** export without requiring AutoCAD to be installed. Two toolchain options were evaluated on 2026-04-23 :

- **ODA File Converter** (free, silent-CLI `.dxf → .dwg` batch tool, widely used in CI). Checked both `C:\Program Files\ODA\` and `C:\Program Files (x86)\ODA\` : **not installed** on this machine, and the installer is gated behind the ODA developer-account signup flow (email activation, ~5 min of manual work). No automated install possible from the loop.
- **libredwg** (open-source C library with Python bindings `python-libredwg`). `pip install libredwg` returns no matching distribution on Windows ; the library only ships Linux wheels today. Cross-compiling it inside this loop is out of scope.

**What shipped anyway** : the existing `ezdxf` backend emits a real DWG-compatible DXF that AutoCAD / BricsCAD / Adobe Illustrator / Rhino / LibreCAD all open natively and can re-save as DWG in one click. The export page already serves that file ; no regression vs iter-16.

**Action for Saad** (optional, anytime) :
1. Install the ODA File Converter from https://www.opendesign.com/guestfiles/oda_file_converter once you create an ODA account.
2. Re-run the loop or flip a feature flag — the backend will auto-pick up `oda-file-converter` on `PATH` and add a `/api/export/dwg` endpoint.
3. Until then, DXF → DWG is a 1-click save in any CAD app the target audience already has.

---

### B8. `cairosvg` / `libcairo` for the 2D zone-overlay NanoBanana pass (iter-17)

The `zone_overlay` surface renders a deterministic 2D SVG first, then asks NanoBanana Pro to image-to-image over a rasterised PNG of that SVG. SVG rasterisation needs `cairosvg`, which on Windows drags the native `libcairo` DLL chain in.

**What shipped anyway** : the surface auto-detects a missing rasteriser and falls back to serving the deterministic SVG directly. The SVG renders natively in the browser with identical visual quality — the NanoBanana pass is a stylisation step, not a correctness requirement. No demo path breaks.

**Action for Saad** (optional) : `pip install cairosvg` + install the GTK+ runtime bundle that ships `libcairo-2.dll`. Then `/api/testfit/variants/zone-overlay` will switch from fallback SVG to full NanoBanana-painted PNG automatically.
