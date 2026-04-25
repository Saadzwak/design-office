# SketchUp components — local cache

This folder is the drop-zone for `.skp` component files (real
3D Warehouse models, vendor mock-ups, custom-built assets) that the
SketchUp plugin can load via `Sketchup::Definitions.load(path)`.

## iter-29 status — empty by design

Iter-29 ships **programmatic Ruby builders** that draw realistic
furniture from primitives (extruded faces, cylinders, panels) inside
the plugin itself. No external `.skp` files are required for the
default render — see `docs/CONFIGURATION.md` for the
`DESIGN_OFFICE_REALISTIC_FURNITURE` toggle. This folder is therefore
intentionally empty in the iter-29 baseline.

## Future use — switching to Option A (.skp components)

If the programmatic builders prove visually insufficient for a future
demo (iter-30+ scope), this folder is the local cache for swapping in
real 3D models from Trimble's 3D Warehouse or vendor catalogues. The
plugin already has the loader plumbing :

- `DesignOffice::HERO_CACHE_DIR` (in `design_office_extensions.rb`)
  points at `%APPDATA%/DesignOffice/sketchup_models/` on Windows.
- `DesignOffice._hero_path(slug)` resolves a slug ("chair_aeron",
  "table_eames_segmented_4000") to a full path under that cache.
- `DesignOffice._place_model(...)` calls `Sketchup::Definitions.load`
  on the resolved path, falls back to the Ruby primitive builder on
  miss, falls back to a labelled box on builder miss.

To use this folder instead of `%APPDATA%`, point a SketchUp env var
at it (e.g. `DESIGN_OFFICE_HERO_CACHE_DIR=<repo>/backend/app/data/sketchup_components`)
and drop `.skp` files matching the slug-to-filename map in
`design_office_extensions.rb::HERO_SLUG_MAP`.

## File naming convention (when populated)

```
chair_aeron.skp
chair_eames.skp
desk_bench_1600.skp
table_eames_segmented_4000.skp
framery_one_compact.skp
sofa_hay_mags.skp
plant_ficus_lyrata.skp
plant_monstera.skp
plant_pothos.skp
plant_dracaena.skp
human_standing.skp
human_seated.skp
human_walking.skp
human_standing_female.skp
```

Each `.skp` should be **origin-anchored at the floor center** of the
component (so the loader places it at the requested xy with no
manual centering) and use SketchUp's metric template (1 unit = 1 mm).

## Licensing reminder

Anything dropped here must be under a permissive licence (Trimble
3D Warehouse: ✓, vendor product catalogues: usually ✗, manufacturer
press kits: case-by-case). Iter-29 sidesteps this by drawing
everything programmatically — no third-party assets at all.
