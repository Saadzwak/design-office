# Flow walkthrough — iter-20 Nordlight Studio dry-run

**As of** : iter-20f (2026-04-23). Supersedes `FLOW_WALKTHROUGH_v3.md`.

Saad's directive (iter-20, 28 feedback points) made three rules explicit :

1. **No Lumen fixtures leak into non-Lumen projects.** Every surface
   now gates its sample data on `project_id.startsWith("lumen")` or
   `client.name === "Lumen"`.
2. **Everything must be robust.** No silent fallbacks that hide
   missing data; empty states are explicit Generate CTAs.
3. **The client-facing artefacts must be beautiful.** 12-slide PPT,
   NanoBanana-lit A3 PDF, forest-green palette, no raw markdown bleed.

This walkthrough follows a **fresh project** — *Nordlight Studio*, a
fictional 42-person Oslo architecture studio — through the six
surfaces end-to-end, one feature per commit and what the judge / Saad
would actually see on screen.

---

## 0. Boot — `/`

Landing unchanged from v3 : italic Fraunces hero, 4-col metric strip,
6-surface asymmetric grid, Kinfolk pull quote, sources marquee. Click
**Start a project**.

---

## 1. Dashboard — `/project`

Projects list. Four seeded fixtures (Lumen, Altamont & Rees, Kaito,
Meridian). Click **+ New project** top-right.

### New project modal — iter-20b (Saad #1)

The modal now accepts :

- **Client name** (free text, auto-titlecased).
- **Industry** (8 options — tech startup, law firm, bank, consulting,
  creative agency, healthcare, public sector, other).
- **Logo** (PNG/JPG/SVG, stored as data URL).
- **Plan** — drop a PDF *or* a raster image (PNG / JPG / WEBP). PDFs
  go through the hybrid Vision + PyMuPDF parser ; images bypass
  parsing and land in `project.uploads.plan_image_data_url` for the
  Brief agents to see.
- **Site-visit photos** — multi-upload, grid thumbnails with per-image
  remove button. Stored in `project.uploads.visit_photos[]`.

Type `Nordlight Studio`, industry `creative_agency`, skip the logo,
drop a single-page office-plan PDF (we don't need a real one — the
parser falls back gracefully on missing vectors via Vision HD), add
three site-visit photos.

Click **Create**. The modal closes, the dashboard hydrates, the new
row reads `NORDLIGHT STUDIO · Creative agency · Brief`.

---

## 2. Brief — `/brief`

### Empty state — iter-20a, iter-20c (Saad #2, #3, #4)

Because Nordlight Studio isn't Lumen, **none of the Lumen fixtures
preload**. The programme, test-fit, mood board and justify drawers
are all empty.

Paste the Nordlight brief (300–400 words about a studio migrating
from a shared coworking to a 1 200 m² loft in Oslo — focus on 18 open
desks + 4 private offices + a crit pit + a library of material
samples). Click **Synthesize programme**.

### Agents at work — iter-20c (Saad #2)

Three live agent pills appear :

> Studio Effectifs — Benchmarks — Regulatory

Each pill pulses on a staggered 7-second heartbeat so the user sees
there's life. The old "idle SaaS skeleton" is gone.

After ~60 s the programme lands. The card stack renders :

- Section 1 **TL;DR** — plain ink text, no `**stars**`, no raw
  markdown (iter-20c `stripInlineMarkdown`).
- Section 2 **Programme table** — rendered via `remark-gfm` so the
  markdown pipes are real `<table>` rows, not raw `|` characters.
  Columns overflow horizontally on narrow screens.
- Sections 3–8 alternate serif headers + drawer-opening chevrons.

Token counts stay in the **Engineering** view toggle ; the **Client**
view strips them completely (iter-20c Saad #17).

---

## 3. Test Fit — `/testfit`

### Empty state — iter-20a (Saad #6, #7, #8, #12)

Because no floor plan exists yet, the drawer reads :

> No macro zoning yet. Drop a plan to see the three variants.

A single CTA : **Launch macro zoning →**. No ghost Villageois /
Atelier / Hybride flex cards appear. (Previous bug: Lumen variants
leaked into every project.)

Click the CTA. Three variants generate (~2 min). The Test Fit drawer
fills with :

- Variant cards with **agent-authored titles** (iter-20a
  `variantAdapter` — preferred over the hardcoded STYLE_NAME when the
  agent provides one). Nordlight example : "North-facing ateliers",
  "Central crit pit", "Flex-first library".
- Each card carries a verdict pill (PASS / WARN / FAIL) with a dot
  coloured per the verdict, plus a metrics strip (desks · flex ·
  m² programmed).
- Retained style highlight sits on the forest-green accent.

### 2D viewer — iter-20f (Saad #13)

Open any variant. The right pane offers **3D ↔ 2D** toggle.

Flip to 2D. The plan loads inside the new `PanZoom` wrapper :

- **Mouse-wheel** → zooms, cursor-anchored so the point under the
  pointer stays put. No more page-scroll hijack.
- **Click + drag** → pans ; cursor becomes `grabbing`.
- **Ctrl + wheel** (or trackpad pinch) → same zoom path.
- Corner toolbar **−  100 %  +** for explicit reset.

The 3D iso render is wrapped too — architects can zoom into any zone
of the SketchUp capture.

### Iterate — iter-20a (Saad #7)

Chat input under the viewer. Type *"Move the crit pit to the north
facade"*. Press Enter. Iterate runs, the 2D plan re-renders with the
new zone, a live SketchUp screenshot overlays the 3D tab, and the
Engineering-view audit drawer logs the tool call.

---

## 4. Mood Board — `/moodboard`

### Empty state — iter-20a, iter-20d (Saad #9, #26)

Because Nordlight isn't Lumen, the fixture **doesn't** preload. The
page shows a Generate CTA ("Curate the mood board") with a one-line
explanation of what will be produced. No ghost Chambers / Canvas /
Parchment cards.

Click. The curator runs (~80 s), the Selection JSON lands, and the
NanoBanana gallery fires automatically (iter-20d).

### Gallery auto-fire — iter-20d

Four NanoBanana tiles generate in parallel — atmosphere, materials,
furniture, biophilic. Each tile is prompted from the full selection
JSON (tagline, palette, materials, furniture, planting, light), not
just a stock industry prompt.

The Pinterest collage on the left replaces its tinted-hatch
Placeholders with the real tiles as they arrive (cached per sha256 on
the backend, so a refresh is instant).

### A3 PDF re-render — iter-20e.4 (Saad #10)

Once the 4 tiles are cached, the frontend fires
`POST /api/moodboard/rerender-pdf` (fire-and-forget). The backend
resolves the cache ids to absolute paths and re-renders the A3 with
the **atmosphere photograph** embedded as the hero block. A dual
scrim (top 55 % alpha, bottom 45 %) keeps the eyebrow + tagline +
industry note legible on any image luminance.

The new `pdf_id` replaces the old one in project state. Click
**Download A3 PDF** — the downloaded file has a real office photo
where the flat palette rectangle used to be.

Note : the old pdf_id stays valid too (PDFs are content-addressed),
so a stale tab can still serve its copy.

---

## 5. Justify — `/justify`

### Inverted empty state — iter-20a (Saad #15, #16)

Before generating : a **single Generate CTA**. No 7 ghost cards
(previous bug: ghost cards appeared BEFORE generation and disappeared
AFTER). The page is deliberately quiet until there's real content.

Click **Generate argumentaire**. Four research agents run in parallel
(Acoustic · Biophilic · Regulatory · Programming) + a Consolidator
(~90 s). Run-time status bar : *"Synthesizing 4 research agents in
parallel…"* with a pulsing dot — no SaaS skeleton.

### Language forced to English

The Justify request now passes `language: "en"` unconditionally
(iter-20a). Section headings render "The bet", "What the research
says", "What the regulation says", etc. — no mixed French / English.

### Card layout — iter-20a

7 cards land. Each has a 200 px min-height and `!pl-6 !pr-6 !pt-6
!pb-14` padding so the citation footer never clips the body text
(previous visual bug). Padding and citation dots sit on the
warm-hairline scale.

Click any card → drawer opens with the expanded section. The drawer
now **scrolls** (iter-20c — `Drawer` aside gets `min-h-0`, drawer
content wrappers use `flex flex-1 min-h-0 overflow-y-auto`). The old
"content clipped, nothing scrolls" bug is dead on all drawers.

### Pitch deck — iter-20e (Saad #19 – #22)

Button **Compose pitch deck (PPTX)**. During the 90 s run, the icon
is replaced by a 6 px pulsing dot (iter-20f, Saad #15) + aria-busy.

When the deck lands (click to download) it's **12 editorial slides**:

1. **Cover** — client name + variant quote, optional SketchUp iso
   right-column, optional logo top-left.
2. **Vision** (NEW) — italic pull quote from the mood-board tagline,
   palette strip underneath.
3. **Programme** (NEW) — 6-card grid, one per programme section,
   eyebrow + 180-char snippet.
4. **Three variants** (NEW) — strip of all three variants, retained
   one labelled `RETAINED` in forest, others `EXPLORED` in muted
   grey ; per-variant 3D iso thumbnail or ivory placeholder.
5. **Retained variant** (NEW) — full-bleed iso, PARTI / FLEX RATIO
   / TOTAL PROGRAMMED in the right column.
6. **The bet** — consolidated "why this variant".
7. **Retained programme** — 6-metric card grid.
8. **Atmosphere** (NEW) — two large NanoBanana tiles (atmosphere +
   biophilic) with the tagline caption and palette strip.
9. **Materials & furniture** (NEW) — split mood + caption block, no
   prices / no SKUs (client-facing).
10. **What the research says** — consolidator section 2, footnote.
11. **What the regulation says** — consolidator section 3, footnote.
12. **Next steps & KPIs** — 2-column layout, client logo footer.

Each slide is 13.333 × 7.5 in (16:9), Fraunces / Courier New /
Calibri, ink-on-ivory with forest accents.

---

## 6. Export — `/export`

### DXF guard — iter-20b (Saad #23)

Two buttons : **Generate DXF** (primary) + **Generate PPTX** (ghost).

Before iter-20b, Generate DXF did nothing on non-Lumen projects. Now:

- If the project has no floor plan OR no retained variant, the button
  renders a clay-coloured error :
  > Generate DXF needs a retained macro-zoning variant. Run Test fit
  > first.
- Otherwise the DXF generates and a Download button appears.

---

## 7. Chat — everywhere

### Multi-conversation — iter-20b (Saad #24)

Chat drawer bottom-right. Previously a single conversation shared
across the whole app. Now :

- **Conversation list** panel (left) with timestamps + previews.
- **+ New conversation** button creates an empty convo ; click the
  row to switch (ChatPanel remounts via `key={activeId}`, previous
  state never bleeds).
- Delete pill on hover removes a convo (confirmation modal first).
- Storage keys v2 — legacy single-key
  `design-office.chat.messages` gets migrated on first load into
  `design-office.chat.convos.v1`.

---

## 8. Regression matrix

| Feedback # | Fix | Commit |
|------------|-----|--------|
| #1 image upload + multi-photo | NewProjectModal accepts PDF/PNG/JPG/WEBP + multi-photo grid | iter-20b |
| #2 live agent states | 7 s staggered pulse | iter-20c |
| #3 `**stars**` visible | `stripInlineMarkdown` | iter-20c |
| #4 programme table raw | `remark-gfm` + overflow-x | iter-20c |
| #5, #18 drawer scroll | `min-h-0` + flex overflow-y-auto | iter-20c |
| #6, #8, #12 mock leakage | `isLumen` gate | iter-20a |
| #7 iterate input / macro CTA | empty-state CTA + border fix | iter-20a |
| #9, #10, #26, #27 gallery + A3 hero | NanoBanana auto-fire + re-render endpoint | iter-20d + iter-20e.4 |
| #11 micro-zoning loader | (inherited from iter-19) | iter-19 |
| #13 2D pan/zoom | `PanZoom` wrapper | iter-20f |
| #14 continue to mood-board CTA | `ContinueChain` card | iter-20a |
| #15, #16 inverted cards / French / loader | `hasRealCards`, `language:"en"`, pulsing dot | iter-20a + iter-20f |
| #17 token visible to client | Engineering-view-only | iter-20c |
| #19 – #22 ugly / short PPT | 12-slide magazine deck | iter-20e |
| #23 Export DXF inert | Guard + error | iter-20b |
| #24 chat convos inert | Multi-convo store | iter-20b |
| #25 everything robust | Root-cause-grouped commits | all of iter-20 |

---

## 9. Commands to reproduce locally

```powershell
# one terminal
cd backend
.\.venv\Scripts\activate
uvicorn app.main:app --reload

# another terminal
cd frontend
npm run dev
```

Open `http://localhost:5173`, go to `/project`, create a Nordlight
Studio project, follow sections 2 – 7 above. Expected round-trip :
~10 min end-to-end with NanoBanana cache cold, ~2 min warm.

Backend tests : `cd backend; pytest -q` — 101 green.
Frontend typecheck : `cd frontend; npx tsc --noEmit` — clean.
