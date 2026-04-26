# Archoff — Runtime configuration

All Archoff configuration lives in environment variables, loaded
by the backend at startup (see `.env.example` for the canonical list).
Most settings are wired through `app.config.get_settings()` and read
per-request ; a few — like the SketchUp plugin's furniture toggle — are
read once when SketchUp launches and the Ruby plugin loads.

This document covers the settings you're likely to flip during a demo,
not the full surface (Anthropic key, MCP ports, Nano Banana cache
directory — those live in `.env.example`).

---

## Realistic furniture toggle (iter-29)

**Variable** : `DESIGN_OFFICE_REALISTIC_FURNITURE`
**Default** : `true`
**Read at** : SketchUp plugin load (`design_office_extensions.rb`)
**Hot-toggle** : yes — see "Live toggle" below

### What it does

Iter-29 introduced realistic-furniture builders for the SketchUp
high-level zone helpers. When the flag is **on** (default), every
zone the variant agents emit renders as detailed multi-piece
geometry :

| Zone kind                    | Realistic rendering                                                 |
|------------------------------|---------------------------------------------------------------------|
| `workstation_cluster`        | bench desks paired with task chairs (seat + back + 5-star wheel base) ; one standing human per ~3 clusters for scale |
| `meeting_room` (≤ 8 capacity) | oval / rectangular table + chairs around its perimeter             |
| `meeting_room` (≥ 10 capacity) → boardroom | large rectangular table + 10–12 directorial chairs + wall-mounted TV screen |
| `phone_booth`                | tall narrow cabin with a glazed front door and a low stool inside  |
| `collab_zone`, style=`cafe`  | bistro tables, bar stools, and a kitchen counter on big zones       |
| `collab_zone`, style=`lounge` | sofa(s) + armchairs + coffee table                                 |
| `collab_zone`, style=`huddle_cluster` | small round table + 4 light chairs                          |
| `collab_zone`, style=`townhall` | tiered banquettes facing a large screen                          |
| `apply_biophilic_zone`       | varied plants (Monstera, Ficus, fern, tall potted) clustered for jungle effect |
| `partition_wall`             | acoustic panel volume with felt-style material                      |
| `place_human`                | one of three distinct human silhouettes (not all clones)            |
| `place_hero`                 | enriched chair / desk / table / phone-booth primitives              |

When the flag is **off**, every builder falls back to its pre-iter-29
implementation — a single extruded volume per zone, the cubes / cylinders
that the agent prompts and validators were calibrated against.

### Why a toggle and not a hard switch

The realistic builders only change *how* the SketchUp scene looks ;
they do **not** change :

- the agents that emit zones,
- the validators that sanity-check coordinates (iter-26 / 27 / 28),
- the Pydantic schemas or the JSON shape on the wire,
- the frontend or any export (DXF / DWG / PDF / PPTX),
- the screenshot URLs returned by `/api/testfit/generate`.

Because the underlying coordinates and zone counts are identical, a
demo run with the flag off is byte-identical to a pre-iter-29 run.
You can A/B the same generation in two clicks if a render misbehaves
on stage.

### Setting the value

**Persistent (per-machine) — `.env` or shell env :**

```dotenv
# .env
DESIGN_OFFICE_REALISTIC_FURNITURE=true   # or false
```

```powershell
# PowerShell (current session)
$env:DESIGN_OFFICE_REALISTIC_FURNITURE = "false"
```

```bash
# bash
export DESIGN_OFFICE_REALISTIC_FURNITURE=false
```

The Ruby plugin reads this once when SketchUp launches the plugin —
typically the first time you click *Extensions → MCP Server → Start
Server* after a SketchUp restart. Restart SketchUp after changing the
env var if you want a clean reload.

**Live toggle (no SketchUp restart) :**

From a Ruby Console inside SketchUp, or via the `eval_ruby` MCP tool :

```ruby
DesignOffice.realistic_furniture?              # => true
DesignOffice.set_realistic_furniture(false)    # => {realistic_furniture: false}
DesignOffice.realistic_furniture?              # => false
```

The flag's state persists for the lifetime of the SketchUp process.
The next macro-zoning generate call uses whatever state the flag was
in when `_replay_zones` ran.

### When to disable

- **A/B test on stage** : show the architect a "before" run with the
  flag off, then re-run the same variant with the flag on so they see
  the visual upgrade against an identical layout.
- **Render perf debugging** : the legacy builders create fewer faces
  (each zone is one cube vs. ~20 pieces of furniture), so if SketchUp
  is choking on a very dense plate, flipping the flag halves the
  geometry count.
- **Regression triage** : if a variant looks wrong, disabling the flag
  isolates whether the issue is in the realistic builders (iter-29) or
  in the agent / validator layer (iter-27 / 28).

The realistic builders are not asset-dependent — they're 100 % Ruby
primitive geometry. There's no `.skp` cache to populate ; flipping
the flag never fails for missing files.
