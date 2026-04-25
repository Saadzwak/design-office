# Mood Board Refonte — iter-30B

## Context

The Pinterest references Saad shared (executive board with curated
material samples; computer-lab board with named palette + real
furniture photos) set the editorial bar. The pre-iter-30B
implementation showed:

- 4 NanoBanana hero collage tiles (atmosphere / materials /
  furniture / biophilic) — those already worked.
- 8–14 hatched `<Placeholder tag="MATERIAL"/"PIECE">` swatches as
  the rest of the collage — the visual gap.
- A3 PDF with **0 embedded images** (verified by `pymupdf`
  on the cached `05689ace14cc2c52.pdf`: 420×297 mm mediabox,
  zero raster objects).

Saad's complaint about the PDF "not being real A3" was incorrect
(the page IS proper A3 landscape, 420×297 mm, computed via
`landscape(A3)` from ReportLab). The actual gap was image
embedding density, not page size.

## Decisions

### Library strategy: Option C-pragmatic (NanoBanana per-item)

The advisor offered three options:

- **A** Curated local image library (~50 hand-picked manufacturer
  URLs).
- **B** Unsplash / Pexels API.
- **C** Hybrid (small hardcoded URL map + API fallback).

We chose a fourth option not on the original list: **per-item
NanoBanana with editorial prompts**. Rationale:

1. `FAL_KEY` was already set; Unsplash / Pexels keys were not, and
   the keyless `source.unsplash.com` URL was deprecated in 2024.
2. NanoBanana caches by `sha256(model + prompt + aspect_ratio)`,
   so the same selection costs nothing on rerun.
3. Tightly-scoped editorial prompts (one subject only, neutral
   studio backdrop, 50mm lens, project palette in ambient cast)
   counter the "AI-looking" critique by enforcing the magazine
   aesthetic. Compare against the Pinterest references on the
   same dimensions: lighting, framing, texture truth.
4. Manufacturer hot-link URLs are unstable enough that a hackathon
   demo can't depend on them; NanoBanana cache is permanent.

Library JSON (`backend/app/data/catalog/...`) was prepared but not
shipped — the per-item NanoBanana path made it unnecessary for
Stage 1.

### Schema policy

`MoodBoardLLMOutput` (the `tool_use` contract Claude sees) was NOT
extended with `image_url` fields. The LLM stays focused on
selecting *what* belongs in the mood board; image resolution is a
pure server-side enrichment step.

The runtime `VisualMoodBoardItemTilesResponse` carries the per-item
images, keyed by a stable `item_key` slug computed from the
selection (`mat:european-oak:oiled`, `fur:vitra-eames-aluminum-group`,
etc.). Frontend recomputes the same key in `slugifyItemKey()` and
uses it to look up the resolved image.

The frontend slug helper and the backend `_slug()` MUST stay in
lock-step — divergence silently breaks the lookup.

### Layout: keep the existing Pinterest column-count collage

The existing 3-column CSS-columns masonry with `±0.4°` rotation
already evokes the architect's-pinboard aesthetic. We did not
redesign the layout; we only swapped the `<Placeholder>` tiles
for `<img>` when an item-tile resolved.

A `fade-rise` animation on the `<img>` covers the moment of
arrival. Unresolved tiles dim to `opacity: 0.55` while NanoBanana
is still composing, so the user sees a clear progressive-reveal
rather than a static placeholder forever.

## Architecture summary

```
MoodBoard.tsx
  ├─ loads selection (curator response or lumen_atelier.json fixture)
  ├─ fires generateMoodBoardGallery(selection) → 4 hero tiles (3:2)
  ├─ fires generateMoodBoardItemTiles(selection) in parallel
  │     → one editorial product photo per item (4:3)
  │     → keyed by stable slug matching backend _slug()
  ├─ buildTiles(selection) emits CollageTile[] with itemKey
  └─ Pinterest collage renders <img> when itemTiles[itemKey] resolves,
     <Placeholder> as fallback
```

## Stage 2 — three direction tabs (shipped, commit `11d4d61`)

Architecture decision (advisor-validated): **palette overlay only**,
not re-curation, not schema v2. Same curator selection rendered
through three named directions per industry. Same Vitra chair
photographed under three ambient palettes ⇒ three visually
distinct mood boards, three distinct A3 PDFs, three editorial
taglines.

### Direction definitions live in JSON

`backend/app/data/moodboard/directions.json` — keyed
`industry → [{slug, name, tagline, parti_pris,
palette_overlay, atmosphere_cue, lighting_cue}, ...]`. Code reads
JSON; iteration on naming/palette doesn't require a code change.
Three entries per industry; `tech_startup`, `law_firm` and
`creative_agency` tuned, others fall back to the generic
`_DEFAULT_DIRECTIONS` set in `app.surfaces.visual_moodboard`.

Precedence rule (documented in the JSON contract): the
direction's palette **REPLACES** the curator's atmosphere palette;
the curator still picks materials/furniture/plants/lights, the
direction picks the colour DNA + parti-pris. No blending.

### What changed

- `VisualMoodBoardRequest.direction: str | None` — pass the slug
  to `generate-gallery`, `generate-item-tiles`, or
  `rerender-pdf`. Cache keys naturally split per direction
  because every per-item / gallery / atmosphere prompt now bakes
  in the direction's palette + atmosphere_cue + lighting_cue.
- `MoodBoardRerenderRequest.direction` — flows through to
  `_render_moodboard_pdf`, which mutates a defensive copy of the
  selection so the printed PALETTE strip + tagline match the
  active direction. The `pdf_id` hash includes the slug so each
  direction produces a distinct PDF on disk.
- `GET /api/moodboard/directions?industry=…` — exposes the 3
  directions for a project's industry to the frontend.
- `MoodBoard.tsx` tab bar — three pills above the hero, each
  with a dot in the direction's accent colour, keyed lazy state
  (`galleryByDir`, `itemTilesByDir`, `pdfIdByDir`). Switching
  tabs is instant once a tab is loaded; never-clicked tabs cost
  zero. Active-direction palette REPLACES the curator's in the
  visible swatch strip; tagline pulls from the direction.
- "Generate A3 PDF" download CTA pulls from `pdfIdByDir[active]`
  so each tab downloads its own A3.

### Cost notes

A fully fresh project (cold cache for all 3 directions) burns:

```
3 directions × (4 hero gallery + ~14 item tiles) ≈ 54 calls
54 × ~$0.04 (Pro tier) = ~$2.16 first time
```

After cache warms, every subsequent view of the same selection
costs $0. The Lumen fixture had 21 cached tiles from Stage 1
which are reused by directions whose palettes match closely;
distinct-palette directions generate fresh photographs.

## Stage 3 — visual prompt iteration (next)

Hard cap: **3 iteration cycles or $3**, whichever first. After
each cycle: render all 3 directions for Lumen via
`scripts/moodboard_three_dir_preview.py`, compare against the
Pinterest references, commit if better, document what changed.

Likely first-cycle targets:

1. Stronger "no CGI sheen" cue — current outputs occasionally
   leak a renderer-glossy look on brass / stone. Worth probing
   "shot on Mamiya RZ67 medium-format film, Portra 400" or
   "Hasselblad H6D" as a film-stock anchor.
2. Slug-direction-specific lighting: the JSON already carries
   `lighting_cue` per direction; check whether NanoBanana picks
   up Tokyo's "washi diffusion" vs Paris's "tungsten library
   lamps" in the resulting tiles. If not, lift the lighting cue
   earlier in the prompt where attention is highest.
3. Furniture silhouette accuracy — `_furniture_prompt` already
   says "Material truth: faithful to the real {head}". Some
   outputs still drift toward generic chairs. Probe whether
   NanoBanana respects named-product cues vs benefits from
   image-to-image with a reference photo (out of scope unless
   Stage 2 visual gap clearly demands it).
4. **Per-item dimension labels** in the collage — currently
   shows only the item name. Editorial mood boards typically
   annotate each tile with a 1–2-line caption (brand, product
   reference, application). Quick frontend-only add.

## Verified

- Backend pytest 171/171 ✓
- Frontend `tsc --noEmit` clean ✓
- End-to-end smoke test: 18 images render on `/moodboard?fixture=lumen`,
  0 broken — 4 hero gallery + 14 per-item editorial product photos.
- NanoBanana cache hits across 4 / 14 of the item tiles on first run
  (atmosphere + biophilic shared structure across runs); the rest
  rendered fresh.

## Process notes

The dev server was previously started from `cd backend && uvicorn
…`, which made the relative `NANOBANANA_CACHE_DIR=backend/app/data/
generated_images` resolve to a doubled `<repo>/backend/backend/app/
data/generated_images/`. The `/api/generated-images/{id}` endpoint
looks at the absolute (correct) path, so files written under the
doubled path 404'd.

Fix: start uvicorn from repo root with
`--app-dir backend` and an absolute `NANOBANANA_CACHE_DIR`. All 25
existing cache files copied into the canonical location.
