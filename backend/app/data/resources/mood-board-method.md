# design://mood-board-method

How to assemble a credible interior-architecture mood board for an office
fit-out client. The output of Design Office's Mood Board surface is a
**single A3-landscape PDF** the space planner can walk into a room with.

---

## Goals of a good mood board

1. **Communicate the atmosphere before the plan**. A mood board is read
   in 30 seconds. It sets tone, not details. If the client "gets the
   feeling", the test-fit plan lands. If not, even a perfect plan
   fails.
2. **Anchor every design decision in something tangible**. Every
   swatch / image should be the crystallisation of a programming bias
   already justified in the argumentaire. It is a *visual index* of the
   reasoning.
3. **Be adapted to the client profile** (see `design://client-profiles`).
   A bank's mood board and a tech startup's mood board should never
   look interchangeable.
4. **Include the maker / source / provenance of every item**. Clients
   respect real products from real manufacturers ; stock photos of
   imaginary materials are a trust killer.

---

## Six mandatory sections

The A3 output lays out six sections. Each is required:

### 1. Header

- Client name (large, editorial serif)
- Industry (small mono-caps eyebrow)
- Tagline — one sentence that captures the spatial idea
  (e.g. *"A quiet courtyard of focus between two bright edges."*)
- Date + Design Office logotype

### 2. Atmosphere

- One hero image : a photograph of a built interior that captures the
  spatial idea. Unsplash / Pinterest is acceptable if the image
  licence allows editorial reuse ; prefer black-and-white if the
  client profile is professional services, full colour if tech /
  creative.
- Five palette swatches (hex codes + names), arranged horizontally.
  Derive from :
  - Two hero colours (from the client's brand or from the programming
    bias)
  - Two neutrals (a warm and a cool)
  - One accent

### 3. Materials

- 6-8 square swatches with :
  - Name (e.g. "Brushed Oak Veneer")
  - Manufacturer + product reference (e.g. "Dinesen Douglas Plank")
  - Application zone (e.g. "Reception floor, collab heart")
  - Sustainability marker when applicable (FSC, Cradle-to-Cradle…)
- Layout : 2 rows × 3-4 columns ; swatches 70×70 mm
- Sources from `design://material-finishes`

### 4. Furniture

- 4-6 signature pieces with :
  - Product photo
  - Brand + model (e.g. "Vitra ID Chair")
  - Application zone
  - Dimensions (W × D × H in mm) — helps the client read scale
- Layout : 2 rows × 2-3 columns
- Sources from `backend/app/data/furniture/catalog.json`

### 5. Planting

- 1 biophilic strategy line (e.g. "South façade = dense canopy ;
  north courtyard façade = low-light tolerant anchors")
- 3-4 plant pictograms / photos with species name and care level
  (Ficus Lyrata, Kentia, Monstera, ZZ, Sansevieria, etc.)
- Sources from `design://biophilic-office`

### 6. Light

- 1 strategy line ("3000 K warm in lounge, 3500 K task desks,
  statement pendants over town hall")
- 2-3 fixture photos with make/model
- Sources from `design://material-finishes` (Lighting section)

---

## Layout constraints — A3 landscape (420 × 297 mm)

- Outer margin 16 mm on all sides
- Gutter 10 mm between sections
- 12-column underlying grid
- Section allocation :
  - Header : full width, 35 mm tall
  - Atmosphere : 7 columns left (hero image + tagline) + 5 columns
    right (palette swatches)
  - Materials : 6 columns left, height ~95 mm
  - Furniture : 6 columns right, height ~95 mm
  - Planting + Light : stacked 6 columns at the bottom, 50 mm each
- Footer : *"Curated by Design Office for [Client Name]"* in mono-caps
  at 8 pt

---

## Palette derivation

If the client didn't supply brand hex codes, derive them from the
industry profile (see `design://client-profiles`) :

| Industry          | Hero                | Secondary     | Accent        |
|-------------------|---------------------|---------------|---------------|
| Tech startup      | Warm off-white      | Light oak     | Lumen yellow / sun |
| Law firm          | Deep green (#2F4A3F)| Leather tan   | Brass (#B08D57)|
| Bank & insurance  | Graphite (#34332F)  | Putty stone   | Brass (#B08D57)|
| Consulting        | Paper white         | Warm grey     | Dark charcoal  |
| Creative agency   | Plaster ivory       | Terracotta    | Acid yellow    |
| Healthcare        | Sage green          | Warm oak      | Sky blue       |
| Public sector     | Stone grey          | Medium wood   | Muted green    |

These are starting points. The agent can tune +/- within the family
for the specific project.

---

## Photography and imagery rules

- **Real spaces only**. Not renders unless they are the client's own.
- **Consistent treatment** (all B&W, or all colour ; don't mix).
- **One focal image per section** — avoid mood boards that read as
  Pinterest dumps.
- **No watermarks** visible.
- Prefer references to built work of :
  - Agencies in the `design://client-profiles` benchmarks
  - Studios noted in the international press
  - The client's own existing office if photos are available

---

## What NOT to do

- Don't show 20 furniture pieces "to give options" — it dilutes the
  voice. Curate to 4-6.
- Don't include a floor plan on the mood board — that's the Test Fit's
  job.
- Don't invent manufacturers or product references.
- Don't use purple-gradient / AI-slop imagery.
- Don't label swatches with Pantone numbers only — clients can't read
  them ; use human-readable names + hex codes.

---

## Delivery

The PDF is generated from :

- `client.name`, `client.industry`, `client.tagline` (or derived from
  the retained variant narrative)
- `retained_variant` (drives the space-typology focus of the materials
  and furniture sections)
- A JSON spec of the curated selection : `{ palette:[], materials:[],
  furniture:[], planting:[], light:[] }` that the curator agent emits
- The actual renderer lives in `backend/app/surfaces/moodboard.py` and
  produces A3-landscape PDF via ReportLab
