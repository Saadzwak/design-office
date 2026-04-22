# Blockers — Design Office

Items that require Saad's physical intervention. Work continues around these as much as possible.

---

## 🔴 CRITICAL — security

### B0. Rotate the leaked Anthropic API key (post-hackathon)

- **Current state** : Saad explicitly authorised the autonomous loop to use the pasted key ("non utilise la clé que je t'ai donnée", 2026-04-22). The key is stored in `.env` at repo root and `.env` is ignored by git, so it is not in the commit history.
- **Residual risk** : the key still sits in the local Claude Code conversation transcript under `C:\Users\redaz\.claude\projects\...`. If that transcript is ever shared (support debug, screen share, export), the key leaks with it.
- **Action for Saad, after the hackathon** : rotate the key at https://console.anthropic.com/settings/keys, update `.env`, and purge or sanitise the transcript file if sharing is ever planned.
- **Action now** : none — the loop is authorised to proceed with Opus calls.

---

## 🟠 At wake-up (section 12 of CLAUDE.md)

### B1. Install SketchUp Pro
- Trial 7 days : https://www.sketchup.com/try-sketchup
- Needed for Phase 3+ (test fit 3D variants).

### B2. Install AutoCAD (LT 2024+)
- Trial 30 days : https://www.autodesk.com/products/autocad-lt/free-trial
- Needed for Phase 5 (DWG export via File IPC). Phase 5 also supports an `ezdxf`-only backend that runs headless, so partial demo stays possible without AutoCAD.

### B3. Load the SketchUp MCP extension
- ⚠️ The fork has a **confusing double-nested layout** — do not copy the whole `su_mcp/` folder naively or SketchUp will report "Could not find included file 'su_mcp/main'".
- The **correct** deployment (confirmed in iter-12 on SketchUp Pro 2026) :

  Plugins folder (typically `C:\Users\<you>\AppData\Roaming\SketchUp\SketchUp 2026\SketchUp\Plugins\`) must end up with :

  ```
  Plugins/
  ├── su_mcp.rb                          ← copied from vendor/sketchup-mcp/su_mcp/su_mcp.rb   (INNER bootstrap, v1.5.0)
  ├── su_mcp/
  │   ├── main.rb                        ← copied from vendor/sketchup-mcp/su_mcp/su_mcp/main.rb
  │   └── extension.json                 ← copied from vendor/sketchup-mcp/su_mcp/extension.json
  └── design_office_extensions.rb        ← copied from sketchup-plugin/design_office_extensions.rb
  ```

  Do NOT copy the outer `vendor/sketchup-mcp/su_mcp.rb` (that's an older v0.1.0 with a broken path reference).

- Restart SketchUp. Console should print `MCP Extension loading...` then `[DesignOffice] v0.1.0 loaded`.
- Go to **Extensions → MCP Server → Start Server**. Console should print `Server started and listening`.
- MCP server listens on port 9876.

### B4. Load the AutoCAD MCP LISP
- Inside AutoCAD command line : `APPLOAD` → load `vendor/autocad-mcp/lisp-code/mcp_dispatch.lsp` → add to Startup Suite so it reloads automatically.

### B5. Visual QA
- Launch `.\scripts\run_dev.ps1` and confirm the 4 screens (Brief, Test Fit, Justify, Export) look production-grade. Flag any regression that breaks the "premium design agency" aesthetic (section 11).

### B6. Record the 3-minute demo video
- Script lives in `docs/DEMO_SCRIPT.md`. Saad records it himself on the Lumen use case (section 5).

---

## 🟡 Technical blockers discovered during build

_Nothing yet. Appended below as they come up, with context and a proposed fallback._
