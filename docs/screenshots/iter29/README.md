# iter-29 — Realistic Furniture A/B screenshots

Captured 2026-04-25 by `backend/scripts/iter29_furniture_smoke.py`
on a 30 × 20 m demo plate populated with one entity of every kind
the variant agent emits (workstation cluster of 6, meeting room 8p,
boardroom 12p, phone booth, the four collab-zone styles, biophilic
zone, partition wall, place_human, place_plant, place_hero).

Same coordinates, same agent calls — only the
`DESIGN_OFFICE_REALISTIC_FURNITURE` flag differs.

| File                              | Mode      | Notes                                                                                         |
|-----------------------------------|-----------|-----------------------------------------------------------------------------------------------|
| `realistic_off_top_down.png`      | flag=false | Pre-iter-29 baseline : 6 white desk cubes in a row, generic boxes for rooms, single green cylinder for biophilic, dark cuboids for phone booths. |
| `realistic_on_top_down.png`       | flag=true  | Post-iter-29 : 6 oak desks each paired with a task chair, glass-walled meeting/boardroom showing inner table + 8/12 chairs, café with bistro tables + bar stools + counter, lounge with sofa + 3 cushions + coffee table + 2 armchairs, huddle round-table + 4 chairs, townhall tiered banquettes, 4 distinct plants (Monstera / Ficus / Fern / tall_potted) with terracotta pots, phone booths showing roof + interior stool. |
| `realistic_off_iso_nw.png`        | flag=false | Iso angle : flat boxes scattered across the plate.                                            |
| `realistic_on_iso_nw.png`         | flag=true  | Iso angle : recognizable office fit-out — bench desks + chairs + humans + glass-walled rooms with tables + plants. |
| `realistic_on_iso_sw.png`         | flag=true  | Side angle showing realistic seating (task chairs with armrests + 5-star bases + wheels), sofa cushions, banquette tiers. |

**Geometry counts** (from `iter29_reversibility_test.py`) :

```
Realistic OFF (legacy)     :   92 faces,  1 group,  z ∈ [0, 2700] mm
Realistic ON  (iter-29)    : 7230 faces, 65 groups, z ∈ [0, 2700] mm
```

The 78× face-count multiplier reflects the move from single extruded
volume per zone (one cube per workstation slot) to multi-piece detail
(desk top + 2 legs + cable tray + chair seat + back + 5 wheels +
pedestal + 2 armrests = ~16 faces per workstation, × 6 = 96 faces
just for one cluster — vs. 6 faces in legacy mode).

**Reversibility guarantee** : flipping the flag back to `false` (or
calling `DesignOffice.set_realistic_furniture(false)` from a Ruby
console / `eval_ruby` MCP call) returns the renderer to the legacy
single-extrusion path. The face count, group count, and z-range all
match pre-iter-29 byte-for-byte. No agent / validator / prompt /
Pydantic schema / TypeScript type was modified — only the SketchUp
plugin's render layer.
