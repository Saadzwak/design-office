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

## What's still missing (to do in Stage 2 / 3)

1. **PDF embedding** — `_render_moodboard_pdf` still produces 0
   images. The rerender endpoint already accepts
   `gallery_tile_paths` for the 4 hero tiles; it needs a parallel
   `item_tile_paths: dict[str, str]` keyed by `item_key`, and the
   layout needs to embed real product thumbnails next to each
   material / furniture / plant / fixture entry.
2. **3 variants** — currently the curator emits one direction per
   project. The Pinterest references showed how three named
   directions (e.g. "Scandinavian craft", "Tokyo workshop",
   "Parisian atelier") give the architect choice. Implementation:
   either (a) run the curator three times with different
   `parti_pris` system-prompt seeds, or (b) extend the schema to
   emit three sibling selections in a single call. (b) is faster
   to ship; (a) gives more divergent results.
3. **Visual quality iteration** — initial NanoBanana outputs
   should be A/B'd against the Pinterest references. Likely
   prompt tweaks: stronger "no rendering" cue (some outputs
   still leak a CGI sheen on metals), explicit "shot on Mamiya
   RZ67 medium-format" or "Hasselblad" anchor for the editorial
   feel, named photographer references where appropriate.
4. **Per-item dimension labels in the collage** — currently shows
   only the item name. Editorial mood boards typically annotate
   each tile with a 1-2-line caption (brand, product reference,
   application). Easy add once the schema/render layer settles.

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
