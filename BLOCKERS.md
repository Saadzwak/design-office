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
- The actual plugin layout in the fork is `vendor/sketchup-mcp/su_mcp/` (files `extension.json`, `package.rb`, `su_mcp/`, `su_mcp.rb`), not `sketchup_plugin/` as referenced in CLAUDE.md.
- Copy both `su_mcp.rb` and the `su_mcp/` subfolder from `vendor/sketchup-mcp/` into the SketchUp `Plugins/` folder (typically `C:\Users\<you>\AppData\Roaming\SketchUp\SketchUp 2024\SketchUp\Plugins\`).
- Restart SketchUp. The MCP server should listen on port 9876.

### B4. Load the AutoCAD MCP LISP
- Inside AutoCAD command line : `APPLOAD` → load `vendor/autocad-mcp/lisp-code/mcp_dispatch.lsp` → add to Startup Suite so it reloads automatically.

### B5. Visual QA
- Launch `.\scripts\run_dev.ps1` and confirm the 4 screens (Brief, Test Fit, Justify, Export) look production-grade. Flag any regression that breaks the "premium design agency" aesthetic (section 11).

### B6. Record the 3-minute demo video
- Script lives in `docs/DEMO_SCRIPT.md`. Saad records it himself on the Lumen use case (section 5).

---

## 🟡 Technical blockers discovered during build

_Nothing yet. Appended below as they come up, with context and a proposed fallback._
