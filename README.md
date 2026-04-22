# Design Office

> AI co-architect for office interior design. Built with Claude Opus 4.7 for the Anthropic "Built with Opus 4.7" hackathon (deadline 2026-04-26).

Design Office is a copilot for space planners and interior architects working on office fit-outs. It covers four functional surfaces:

1. **Smart brief** — turn a client brief into a costed, sourced functional program.
2. **3D test fit** — read a PDF floor plan + program → three 3D variants generated in SketchUp, iterable in natural language.
3. **Sourced design justification** — client-facing argument with citations (acoustics, ergonomics, neuroarchitecture, accessibility / ERP regulations).
4. **Technical export** — A1 dimensioned DWG with title block via AutoCAD MCP.

## Status

🚧 **In active build** (hackathon window). See `BUILD_LOG.md` for current phase and `BLOCKERS.md` for outstanding items requiring human action.

## Architecture

```
React/TS/Tailwind  ⇄  FastAPI + Opus 4.7 orchestrator  ⇄  { SketchUp MCP, AutoCAD MCP }
                                  │
                                  └── MCP Resources (metier knowledge) + furniture catalog
```

Full architecture diagram in [`CLAUDE.md`](CLAUDE.md) section 3 and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Quick start (once Phase 1 is done)

```powershell
# 1. Rotate and set the Anthropic API key
cp .env.example .env
# edit .env — put a FRESH key (never commit)

# 2. Backend
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e .

# 3. Frontend
cd ..\frontend
npm install

# 4. Launch everything
cd ..
.\scripts\run_dev.ps1
```

## License

MIT — see [`LICENSE`](LICENSE).

## Built with

- Claude Opus 4.7 (`claude-opus-4-7`) — orchestration, Vision HD plan parsing, managed agents
- FastAPI, React, Vite, Tailwind, Framer Motion
- `mhyrr/sketchup-mcp` (forked) + custom Ruby extensions
- `puran-water/autocad-mcp` (forked) — ezdxf + File IPC backends
