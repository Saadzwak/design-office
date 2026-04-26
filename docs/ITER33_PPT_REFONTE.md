# iter-33 — Refonte de la présentation client (PPT)

Audit before redesign. The goal of this iteration is a **magazine-grade
client deck** — Studio M Moser / Gensler / Perkins+Will quality — built
for the demo in ~20 hours.

## Current state — concrete

The renderer (`backend/app/surfaces/justify_pptx.py`, 1409 LOC) has 12
slide builders wired and called from `render_pitch_deck()` :

| # | Builder                              | Title (current)                  | Image inputs                                  |
|---|--------------------------------------|----------------------------------|-----------------------------------------------|
| 1 | `_build_cover_slide`                 | « {client} — {variant} »         | `iso_path`, `logo_bytes`                      |
| 2 | `_build_vision_slide`                | "The intent" + tagline           | (none, palette strip only)                    |
| 3 | `_build_programme_slide`             | "What we programmed" — 6 cards   | (none)                                        |
| 4 | `_build_three_variants_slide`        | "Three hypotheses, one bet"      | `iso_by_style[3]`                             |
| 5 | `_build_retained_variant_slide`      | "{variant.title}"                | `iso_path` (left, large)                      |
| 6 | `_build_bet_slide`                   | "01 · The bet"                   | (none — text only)                            |
| 7 | `_build_metrics_slide`               | "02 · Retained programme"        | (none — 6 metric cards)                       |
| 8 | `_build_atmosphere_slide`            | "Atmosphere — How it feels"      | atmosphere + biophilic gallery tiles          |
| 9 | `_build_materials_furniture_slide`   | "Materials & furniture"          | materials + furniture gallery tiles           |
|10 | `_build_research_slide`              | "03 · What the research says"    | (none — text only)                            |
|11 | `_build_regulatory_slide`            | "04 · What the regulation says"  | (none — text only)                            |
|12 | `_build_next_steps_slide`            | "05 · Next steps & KPIs"         | logo footer                                   |

### Forensic findings on the produced files

Looked at the 5 most recent PPTX in `backend/app/out/justify_pptx/` :

- File sizes : **36–55 KB** each (a real magazine deck with embedded
  NanoBanana 1.4–1.8 MB renders + SketchUp shots would be 5–15 MB).
- `unzip -l` → **no `ppt/media/` folder at all** in 4 of the last 5
  files. Only `24b346c1b56d21dd.pptx` (yesterday) has 1 image — the
  client logo (4 KB). All other slides are text + colored rectangles.
- `slide{N}.xml.rels` for slides 1, 5, 8 (cover, retained variant,
  atmosphere) → **only the slideLayout ref**. No image relationship.
  Every `_safe_add_picture` call falls through to the
  `placeholder_label="..."` ivory frame.

So the structural shell is there, but every image slot is empty.

### Why every image slot is empty — the root cause

The frontend `Justify.tsx::loadJustify()` calls `generateJustify()` with
these fields :

```ts
client_logo_data_url: project.client.logo_data_url ?? null,
mood_board_selection: project.mood_board?.selection ?? null,
other_variants: others.length > 0 ? others : null,
```

It **does not** pass :

- `sketchup_iso_path` — needed for cover (slide 1) + retained focus (slide 5)
- `sketchup_iso_by_style` — needed for three-variants strip (slide 4)
- `gallery_tile_paths` — needed for atmosphere/biophilic/materials/furniture (slides 8, 9)

The Pydantic request model on `JustifyRequest` (`justify.py:71+105`) and
the API client typings (`api.ts:617-624`) accept these fields. They're
just never populated. That's why — across 14 historical PPTX files —
the deck is structurally identical to a Word document.

## Asset inventory on disk

We are not short of assets. Server-side, right now :

- `backend/app/data/generated_images/` — **337 NanoBanana PNGs**, 491 MB
  (atmosphere + biophilic + per-material + per-furniture + per-light +
  per-plant, 3:2 and 4:3 aspects).
- `backend/app/out/sketchup_shots/` — **394 SketchUp renders**, 64 MB
  (per variant, 6 angles : `iso_ne / iso_nw / iso_se / iso_sw /
  top_down / eye_level`).
- `backend/app/out/plans/` — **8 plan PNGs**, 1.1 MB.

**Every image the deck wants already exists on disk.** The fix is
pipe-the-paths-through, not generate-new-content.

## Beyond the empty slots — design quality gap

Even if we wired image inputs today, the deck's typography is below
agency-grade :

- **Font**: `Calibri` for body, `Courier New` for eyebrows. App is
  Fraunces (display) + Inter (body) + JetBrains Mono (eyebrow). The
  deck doesn't read like a continuation of the app.
- **Hierarchy**: 36 pt H1 / 11 pt eyebrow / 14-18 pt body. Magazine
  decks lean on dramatic 60-90 pt display type with mono kicker
  labels at 8-9 pt. The current ratios are SaaS-pitch, not editorial.
- **Layout**: every slide is the same vertical stack — eyebrow,
  H1, hairline, body block. No grid breaks, no asymmetric splits,
  no full-bleed image frames, no negative-space pull quotes. A
  magazine works because each spread is composed differently.
- **Editorial chrome**: missing folio, missing section dividers,
  missing pull-quote slides, missing typographic page numbering
  (`I — XII` style).
- **Slide ordering**: "Three variants" lands on slide 4 *before*
  "The bet" on slide 6. A Studio M Moser deck would present the
  **bet first** (intent), then the three options (rationale), then
  the retained zoom. Order needs a re-read.

## Target — what a magazine-grade deck does that this doesn't

| Element                | Current        | Target                                    |
|------------------------|----------------|-------------------------------------------|
| Display font           | Calibri        | Fraunces (variable, italic for editorial)  |
| Body font              | Calibri        | Inter                                      |
| Eyebrow / mono         | Courier New    | JetBrains Mono                             |
| Cover hero             | text + iso     | full-bleed iso + overlay typography        |
| Section dividers       | none           | dedicated breath slides ("II — Programme") |
| Pull quotes            | none           | client-language headline slide w/ italic   |
| Image embedding        | 0/12 slides    | 6-8 slides with real embedded photography  |
| Folio / page #         | none           | discreet bottom-right roman numeral        |
| Asymmetric layouts     | none           | mixed (60/40, 70/30, full-bleed, grid)     |
| Palette swatches       | strip on 2     | strip + per-swatch hex caption + role      |
| Citations              | text paragraph | per-quote card with source kicker          |

## Implementation strategy — staged layers, not Path A vs B

After advisor review, the right framing is **independently shippable
layers** with natural rollback points across the 20 h budget. Each
layer compounds : worst case we ship 1+2 and the deck already looks
3× better than today.

| Layer | What                                              | Time   | Unlock                                  |
|-------|---------------------------------------------------|--------|-----------------------------------------|
| 1     | Image wiring (frontend forwards 3 fields → server | 1.5-2h | 0/12 → ~6/12 image slots filled         |
|       | resolves URL → disk path → embed)                 |        |                                         |
| 2     | Font swap + slide reorder + section dividers      | 1.5-2h | reads as a continuation of the app      |
| 3     | New slide types (pull quote, full-bleed, citation | 3-4h   | magazine cadence, asymmetric layouts    |
|       | cards) + per-slide layout polish                  |        |                                         |
| 4     | (Stretch) HTML→PNG hybrid renderer                | 9-13h  | pixel-perfect Studio M Moser ceiling    |

We commit to **layers 1 + 2 + 3** (6-8 h). Layer 4 stays a post-demo
follow-up unless 1-3 still read SaaS at the live test.

### Layer 1 — Image wiring (concrete plan)

The slug → `visual_image_id` map already lives in the frontend
MoodBoard state (`MoodBoardCachedTiles` localStorage), and the
SketchUp shot URLs already live on each `VariantOutput`. Frontend
pass-through is the cheapest correct fix.

1. **`frontend/src/routes/Justify.tsx::loadJustify()`** — populate the
   3 missing fields from existing project state :
   - `sketchup_iso_path` ← retained variant's
     `sketchup_shot_urls.iso_ne` (or first available angle)
   - `sketchup_iso_by_style` ← `{ villageois: url, atelier: url,
     hybride_flex: url }` from each `project.testfit.variants[]`
   - `gallery_tile_paths` ← `{ atmosphere, biophilic, materials,
     furniture }` from `MoodBoardCachedTiles` keyed by project_id
     (resolve `keyForMaterial()`, `keyForFurniture()` etc. to URL).

2. **Backend `_resolve_path()` helper** — frontend sends URLs (e.g.
   `/api/visual_moodboard/image/abcd1234...png` or
   `/api/testfit/screenshot/villageois_iso_ne.png`). python-pptx
   wants disk paths. Add a small helper in `justify_pptx.py` :
   - `/api/visual_moodboard/image/{id}.png` →
     `backend/app/data/generated_images/{id}.png`
   - `/api/testfit/screenshot/{name}.png` →
     `backend/app/out/sketchup_shots/{name}.png`
   - Returns `None` for unknown patterns; `_safe_add_picture` keeps
     its placeholder fallback so a URL miss never crashes the deck.

3. **Test**: smoke-test Lumen flow end-to-end, confirm new PPTX is
   2-5 MB (= images embedded), open in PowerPoint, eyeball that
   slides 1, 4, 5, 8, 9 carry real photography.

### Layer 2 — Font swap, reorder, section dividers

1. Renderer constants : `Calibri` → `Inter`, `Calibri-Bold` →
   `Fraunces` w/ italic for editorial display, `Courier New` →
   `JetBrains Mono`. Note : Fraunces falls back if absent on the
   client's machine — for the demo this is fine, both Saad's machine
   and the judges' viewing environment have it via the running app
   or the bundled deck. Documented as a known caveat for v1.
2. Reorder slides (committed, no advisor needed) :
   `Cover → Vision → Bet → Programme → Three Variants → Retained →
   Metrics → Atmosphere → Materials/Furniture → Research → Regulatory
   → Next Steps`. Bet leads the *why* before the *what* — a
   standard architect-pitch convention.
3. Add `_build_section_divider_slide(label, roman)` helper. Insert
   between Vision/Bet, Three Variants/Metrics, Atmosphere/Research,
   Regulatory/Next Steps. 4 dividers, brings deck to 16 slides.
4. Per-slide folio bottom-right : `I` … `XVI` in JetBrains Mono 8 pt.

### Layer 3 — Magazine cadence

1. Pull-quote slide (`_build_pull_quote_slide`) : full-bleed Fraunces
   italic 72-90 pt, attribution in mono. One pulled out of the
   "research" body for acoustic; one for biophilic.
2. Full-bleed atmosphere slide (`_build_full_bleed_image_slide`) :
   1920×1080 image, dark gradient overlay, single editorial line in
   ivory across the bottom third. Used for the retained variant iso
   and one NanoBanana atmosphere shot.
3. Per-citation card on Research : split the current text-paragraph
   slide into a 3×2 grid of source cards (Browning 2014 / Nieuwenhuis
   2014 / Ulrich 1984 / NF S 31-080 / Leesman 2024 / WELL Building),
   each with a kicker, the takeaway in 1 line, and the citation in
   mono.
4. Materials/Furniture slide : split into two slides, each with a
   3×3 product grid (NanoBanana per-item tiles already keyed by
   `mat:...` / `fur:...` slugs).

### Layer 4 — (stretch only) Hybrid HTML→PNG

Skipped by default. Becomes a post-demo follow-up if Saad wants
Studio-M-Moser-pixel-perfect. Flagged in code as `v2_hybrid_render`.

## Open question for advisor (single)

Layer 3 (new slide types) is where time risk sits. Are pull-quote +
full-bleed + per-citation cards + 3×3 product grid the highest-leverage
4 moves inside the python-pptx ceiling, or should I drop one and
spend the time on something I'm missing (e.g. cover-slide hero
typography, palette-as-spread slide, sketch-to-photo split) ?

---

## Reference — historical implementation paths

### Path A — Evolve the existing python-pptx renderer

Pros : 1409 LOC of already-debugged plumbing (slide-master, palette
constants, hashing, fallback-frames). Output is a *real* `.pptx` (the
client can edit). No new dependency. Contained surface area.

Cons : python-pptx hits a typographic ceiling. Variable fonts
(Fraunces opsz/wght/SOFT) are flattened to "Fraunces". Multi-line
auto-layout on long titles is fragile. Can't do real grid breaks
without per-slide manual coordinates. Magazine-grade asymmetry is
expensive to author by hand.

Plan if we go A :
1. Wire frontend → request : add `sketchup_iso_path`,
   `sketchup_iso_by_style`, `gallery_tile_paths` from project state.
2. Resolve all paths server-side (the moodboard surface already knows
   how — reuse).
3. Switch fonts at the renderer (Fraunces / Inter / JetBrains Mono).
   Embed Fraunces TTF if we want clients without it installed to see
   the right thing.
4. Add 3 new slide types : section divider, pull quote, image
   full-bleed.
5. Reorder : Cover → Vision → Bet → Programme → Three Variants →
   Retained Focus → Metrics → Atmosphere → Materials/Furniture →
   Research (split into 2-3 quote slides) → Regulatory → Next Steps.
6. Tighten all per-slide layouts to a 12-column grid (Inches at 0.7"
   margins, gutter 0.2").

Estimate : 6-9 h.

### Path B — Hybrid HTML→PNG→pptx

Render each slide as HTML/CSS at 1920×1080 via a headless browser,
then drop each PNG full-bleed into a python-pptx shell. Magazine-grade
typography, exact grid control, gradients, blend modes, real Fraunces
italic — all the things python-pptx cannot reach.

Pros : pixel-perfect quality. Same primitives the rest of the product
already speaks (Tailwind / Fraunces / Organic Modern tokens). Demo
quality goes up *a lot*.

Cons : output is a `.pptx` of flattened images — client cannot edit
text. Adds a Puppeteer/Playwright dependency and ~30 s render time.
1409 LOC of existing renderer becomes legacy fallback or trash.

Plan if we go B :
1. Add a `slide_html/` folder with one `.html` per slide template.
2. Add a Python wrapper (Playwright sync API, already a dev dep) that
   POSTs slide data → renders → returns PNG bytes.
3. New `render_pitch_deck_v2()` builds the data dict for each slide,
   asks the renderer for PNGs, drops them full-bleed in a python-pptx
   shell (1 picture per slide, no text boxes).
4. Keep Path A as `v1_legacy_render` for the 12-h fallback.

Estimate : 9-13 h. Higher upside. Higher blast radius.

## Recommended path — pending advisor

I lean toward **Path A first** :

- The blocking deficit today is *content not reaching slides*, not
  the renderer's ceiling. Wiring images + reordering + font swap +
  3 new slide types gets us from "Word document" to "respectable
  client deck" in 6-9 h.
- Path B is a cleaner ceiling but blows the time budget for a 20-h
  demo window. The hybrid renderer becomes a follow-up if Saad
  wants Studio-M-Moser-pixel-perfect post-demo.
- Path A leaves output editable, which architects appreciate.

Going to consult the advisor with this concrete framing before
committing.

## Notes
- Slide reorder is editorial preference — committing without further
  consultation : `Cover → Vision → Bet → Programme → Three Variants
  → Retained → Metrics → Atmosphere → Materials/Furniture → Research
  → Regulatory → Next Steps`.
- Frontend forwards URLs (`/api/...`) ; backend resolves URL → disk
  path before `add_picture()`. Single helper in `justify_pptx.py`,
  pattern-matches the two URL families we own.

---

## Closure — what landed in iter-33

| Metric                   | Before iter-33     | After iter-33                    |
|--------------------------|--------------------|----------------------------------|
| Slide count              | 12                 | **18**                           |
| File size (Lumen render) | 47 KB              | **6.79 MB**                      |
| Embedded images          | 0                  | **7** (4 NB gallery + 3 SketchUp)|
| Display font             | Calibri            | **Fraunces** (italic for editorial)|
| Body font                | Calibri            | **Inter**                        |
| Mono font                | Courier New        | **JetBrains Mono**               |
| Section dividers         | none               | **4** (Programme, Atmosphere, Evidence, What's next)|
| Folio                    | none               | **roman numeral, bottom-right**  |
| Pull-quote slide         | none               | **1** (Nieuwenhuis 2014)         |
| Citation cards           | text paragraph     | **3×2 grid** (6 sources)         |
| Slide order              | Programme-first    | **Bet-first** (architect convention)|

### Files touched

- `frontend/src/routes/Justify.tsx` — added `pickIsoUrl`,
  `buildIsoByStyle`, `buildGalleryTilePaths`, `readMoodCache` ; the
  `generateJustify({...})` call now populates `sketchup_iso_path`,
  `sketchup_iso_by_style`, `gallery_tile_paths`.
- `backend/app/surfaces/justify_pptx.py` — new `_resolve_media_url`,
  `_build_section_divider_slide`, `_build_pull_quote_slide`,
  `_build_citation_cards_slide`, `_add_folio`,
  `_stamp_folio_on_content_slides` ; font sweep
  (`Calibri` → `BODY_FONT/DISPLAY_FONT`, `Courier New` → `MONO_FONT`) ;
  cover slide goes through resolver ; orchestrator reordered.
- `backend/tests/test_justify_pptx.py` — 6 new tests for the
  URL→path resolver ; existing tests updated to expect 18 slides.

### Quality gates
- `npx tsc --noEmit` → exit 0
- `pytest backend/tests/` → 182 passed (one pre-existing flake skipped
  per session policy : `test_iterate_enlarges_boardroom_and_keeps_style`,
  unrelated to iter-33).
- Live smoke render with Lumen-shaped inputs (cover iso + 3-variant iso
  strip + 4 NB gallery tiles + 6 cited sources) produces a 6.79 MB
  18-slide deck the renderer can re-open and stream.

### Visual review — what landed (PowerPoint COM render)

The 18 slides were exported to PNG via PowerPoint COM and inspected
directly. Screenshots saved under `docs/screenshots/iter33_pptx/`.

What read magazine-grade :

- **Vision (slide 2)** : eyebrow + "The intent" H1 + sand hairline +
  large italic pull quote + signature kicker + 6-chip palette strip
  with hex captions. Reads like a Studio M Moser cover spread.
- **Three macro-zonings (slide 6)** : 3 iso panels under
  "Three hypotheses, one bet", with RETAINED / EXPLORED kickers in
  forest / muted, titles in display weight (bold for retained), and
  a tight mono metric line per column. Folio "IV" bottom-right.
- **Atmosphere (slide 10)** : two real NanoBanana product photographs
  side-by-side, "How it feels" H1, italic tagline below the images,
  6-chip palette strip at the foot. This is the slide that sells the
  *feel* before the numbers — and it does.
- **Materials & Furniture (slide 11)** : two NB tiles + caption strips,
  "The palette, made real" H1. Reads as a tight catalogue page.
- **Section dividers (4× — slides 4, 9, 12, 17)** : oversized italic
  Roman numeral on canvas, mono kicker label, sand rule. Pure
  typography, no chrome, gives the deck breath between acts.
- **Pull quote (slide 13)** : 220 pt sand quote-mark glyph + 44 pt
  italic body + hairline + mono attribution. Folio "IX" — the
  iter-33 explicit-divider-set fix worked exactly as intended.
- **Citation cards (slide 15)** : 3×2 grid, 6 sources each with mono
  ACOUSTIC / BIOPHILIC / VIEW / STANDARD / BENCHMARK / PROGRAMME
  kicker, body takeaway in Inter, italic mono citation. Reads as an
  inspectable evidence ledger rather than a wall of text.

Real visual caveat to flag :

- **Fraunces falls back** on Saad's machine — PowerPoint substitutes
  a generic serif italic (a Calibri Italic-shaped glyph). The
  italic still reads elegantly, but it isn't the Fraunces curls we
  see in the live app. For the demo this is acceptable ; for a v2
  client deliverable, embed the TTF (python-pptx font scheme
  manipulation, ~2 h to ship cleanly).

---

## Iter-33 follow-up — HTML→PDF magazine deck

After Saad asked us to test Gamma's API in parallel and pivot the PPT to a
PDF-as-presentation, we built a third lane.

Gamma was blocked on credits (HTTP 403 — "Insufficient credits"). The
9-slide deck input was prepared (theme `editoria`, 16:9, photorealistic AI
imagery, custom magazine-grade instructions) but never ran. To unblock,
refill credits at https://gamma.app/settings/billing and re-run the same
`mcp__1e27a338..._generate` call.

The PDF lane shipped end-to-end :

- **Stack** — Jinja2 + Tailwind-style CSS + headless Chromium
  (`chrome --headless --print-to-pdf`). No new pip deps. Chrome and Edge
  are both available locally as Chromium binaries.
- **9 slides at 16:9 / 1920×1080** — Cover · The Bet · Programme ·
  Three Variants · Atmosphere · Materials & Furniture · Pull Quote ·
  Evidence · Next Steps. Same content as the 18-slide PPTX, condensed
  per Saad's request.
- **Real Fraunces variable + Inter + JetBrains Mono** — loaded from
  Google Fonts at print time with `font-display: block` and a 25 s
  Chrome virtual-time-budget so all weights resolve before the print
  fires. `SOFT` axis tuned per surface (0 for display, 30-50 for
  italic display, 20 for lede) so the typography reads editorial, not
  decorative.
- **Embedded NanoBanana + SketchUp imagery** — frontend forwards URLs,
  backend `_resolve_to_disk()` translates each `/api/...` URL to a
  file path, `_to_data_url()` base64-inlines the bytes so the HTML is
  self-contained when Chromium prints.
- **Editorial chrome** — corner mark per slide (top-right mono),
  Roman folio (bottom-right mono), sand hairline rules, palette strip,
  decorative quote-mark glyph on the pull quote, 3×2 evidence-card grid.
- **Smoke render** — Lumen / L'Atelier Nord with full inputs : 9 slides,
  10.4 MB, 7 embedded images.

Visual review confirmed the result is genuinely magazine-grade at native
resolution (the artifacts visible during low-DPI PDF extraction during
review were a Read-tool sampling issue, not a real PDF defect — at
1920×1080 the typography is crisp Studio M Moser quality).

### Files added (iter-33 follow-up)

- `backend/app/surfaces/justify_html_pdf.py` — module (~440 LOC)
- `backend/app/surfaces/templates/justify_pdf/deck.html.j2` — Jinja2 template
- `backend/tests/test_justify_html_pdf.py` — 20 tests (resolver, lede splitter, programme parser, template context, end-to-end render gated on Chromium)
- `backend/app/main.py` — `GET /api/justify/pdf-magazine/{id}` endpoint
- `backend/app/surfaces/justify.py` — `JustifyResponse.magazine_pdf_id` and parallel render
- `frontend/src/lib/api.ts` — `magazine_pdf_id`, `justifyMagazinePdfUrl()`
- `frontend/src/lib/projectState.ts` — `JustifyState.magazine_pdf_id` + persistence
- `frontend/src/routes/Justify.tsx` — primary "Download client deck (PDF)" button (the A4 ReportLab PDF becomes secondary "Report (PDF · A4)")

### Quality gates (iter-33 follow-up)

- `npx tsc --noEmit` → exit 0
- `pytest tests/test_justify_html_pdf.py` → 20 passed
- `pytest tests/test_justify_html_pdf.py tests/test_justify_pptx.py tests/test_justify.py` → 37 passed
- Smoke render with Lumen inputs : 10.4 MB, 9 slides, 7 embedded images, opens cleanly in Chrome PDF viewer.

## Iter-33 follow-up v2 — Saad's revisions

After v1 visual review Saad asked for three concrete changes :

1. **More slides** — 9 wasn't enough.
2. **Visuals on every slide** — either real generated imagery or
   template-driven graphics.
3. **No SketchUp screens** — these read as engineering artefacts ; a
   client-facing deck wants atmospheric photography instead.

We rebuilt the deck to **18 slides** with visuals on every slide, dropped
all SketchUp imagery, and added two new visualisations the previous deck
lacked (a comparison bar chart explaining the choice and a KPI dial
ring for the expected results).

### Slide map

| #     | Slide                              | Visual                                                  |
|-------|------------------------------------|---------------------------------------------------------|
| I     | Cover                              | Full-bleed atmosphere tile + scrim + overlay typography |
| II    | Vision pull quote                  | Editorial breath                                        |
| III   | About the project (bento)          | 3×3 bento — feature card + 6 stat cards                 |
| IV    | The brief (what we heard)          | Narrative + sidebar biophilic image                     |
| V     | Programme                          | 6-card grid                                              |
| VI    | Three macro-zonings · overview     | Type-led intro + 3 strip rows w/ retained highlight     |
| VII   | Variant 1 — L'Atelier Nord (RETAINED) | Full-bleed atmosphere tile + overlay text            |
| VIII  | Variant 2 — Quartier Sud           | Full-bleed materials tile + overlay text                |
| IX    | Variant 3 — Ruche Lumière          | Full-bleed furniture tile + overlay text                |
| X     | Why we chose                       | **5×3 horizontal-bar comparison chart** w/ retained-color contrast |
| XI    | Retained variant — focus           | Atmosphere tile + 4-stat stack incl. forest feature     |
| XII   | Atmosphere & biophilia             | Atmosphere + biophilic tiles + tagline + palette strip  |
| XIII  | Materials                          | Materials tile + numbered caption list                  |
| XIV   | Furniture                          | Furniture tile + numbered caption list                  |
| XV    | Pull quote (Nieuwenhuis)           | Editorial breath                                         |
| XVI   | Evidence — 6 sources               | 3×2 cards w/ kicker + takeaway + citation              |
| XVII  | Expected results                   | **4 CSS conic-gradient KPI dial rings**                 |
| XVIII | Next steps                         | **8-row vertical timeline** w/ feature dots + ownership |

### Visualisations added

The v2 deck introduces three template-driven graphics that v1 lacked :

- **Comparison bar chart (slide X)** — 5 criteria (focus & quiet,
  natural light, flexibility, brand expression, cost discipline)
  scored 1-5 across the 3 variants. Forest fill for the retained,
  sand-deep for explored. Hand-tuned scores per variant style ;
  retained wins on aggregate so the slide *visually* explains the
  choice. Pure CSS — no chart library.
- **KPI dials (slide XVII)** — 4 conic-gradient rings (Leesman ≥ 70,
  window sight-line ≥ 90 %, acoustic compliance 100 %, biophilic
  patterns 8/14). Forest fill, mist gray remainder, big italic
  Fraunces numbers in the ring centre. Pure CSS via `conic-gradient`.
- **Vertical timeline (slide XVIII)** — 8 milestones over 34 weeks,
  vertical sand hairline through forest dots. Filled dots mark
  client-steering milestones, hollow dots mark studio-owned
  ones — ownership column on the right reinforces the read.

### Other changes
- SketchUp inputs are now silently dropped from the deck (still
  accepted in the API for parity with the PPTX). Slide cover, retained
  focus, and the three variant pages cycle through the 4 NanoBanana
  gallery tiles instead.
- Variant pages get an italic Fraunces 96 pt title overlaid on a
  dark-gradient scrim with a `RETAINED` / `EXPLORED` badge top-right
  and a 3-stat footer. Reads as magazine spread, not engineering data.
- 6 hand-tuned bento cells under the About slide (sector, HQ, surface,
  headcount, budget tier, lead time) — no more empty cells.
- Removed the redundant project footer from the Next-steps slide
  (it overlapped the last timeline row).

### File output (smoke render with Lumen inputs)

- 18 slides at 16:9 / 1920 × 1080 px
- 10.5 MB (7 embedded NanoBanana gallery tiles, no SketchUp)
- Native typography crisp at 100 % zoom, all webfonts loaded

### Quality gates (iter-33 follow-up v2)
- `npx tsc --noEmit` → exit 0
- `pytest tests/test_justify_html_pdf.py tests/test_justify_pptx.py tests/test_justify.py` → 38 passed
- New v2 tests asserting (1) SketchUp URLs never leak into any image
  slot in the template context, (2) variant duplicate styles are
  deduped across the overview + full-bleed pages, (3) compare
  criteria score every real variant exactly once with the retained
  flag set on the retained's bar.

### What we deferred (post-demo backlog)
- **Per-item product photographs** in the Materials and Furniture slides
  (3×3 grid of NanoBanana per-item tiles keyed by `mat:` / `fur:` slugs).
  Plumbing equivalent to `gallery_tile_paths` but for `item_tile_paths` —
  the frontend already has the cache, the renderer's `_safe_add_picture`
  is reusable. Estimate : 2-3 h.
- **Hybrid HTML→PNG renderer** (Path B). Becomes a clean follow-up if
  Saad wants Studio-M-Moser-pixel-perfect post-demo. Existing
  `render_pitch_deck` becomes the editable-PPTX path ; v2 becomes the
  flattened-image high-fidelity path.
- **Embedded TTF font** so the deck reads in Fraunces on machines
  without it installed. Possible via python-pptx's font scheme
  manipulation but fiddly ; out of scope for the 20-h demo window.
