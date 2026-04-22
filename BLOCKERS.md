# Blockers — Design Office

Items that require Saad's physical intervention. Work continues around these as much as possible.

**Legend** : 🔴 critical · 🟠 pending · 🟢 resolved · 🟡 technical

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

---

## 🟡 Technical blockers discovered during build

_Nothing open. Iter-12 fixed the SketchUp plugin double-nested layout ; iter-13 fixed the viewer overflow (P0), HMR persistence, fixture Vision default, and stale post-iterate screenshot (P1)._
