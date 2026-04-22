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

**Status** : queued (entered in next `/loop` iteration)
**Target duration** : 3 h

### Planned order (section 13.2)

1. `backend/app/claude_client.py` — hook up real wrapper (already stubbed) + wire token budget guardrails.
2. `backend/app/data/resources/` — 10 MCP Resources Markdown, each 50–200 lines with real sources. Local-only, **no Opus calls needed**.
3. `backend/app/data/benchmarks/` — JSON ratios (Leesman, Gensler, HOK).
4. `backend/app/agents/orchestrator.py` — `run_parallel_agents(agents, context)` helper.
5. Three sub-agents (Effectifs, Benchmarks, Contraintes) + consolidateur — real Opus calls. **Gated on Saad rotating the leaked API key (BLOCKERS.md B0).** Until rotation is confirmed, work will pause on this step and move to Phase 3 step 1 (pipeline PDF scaffolding, still Opus-free) to avoid idle time.
6. `POST /api/brief/synthesize` endpoint.
7. `frontend/src/routes/Brief.tsx` — wire to endpoint, stream sub-agent trace.
