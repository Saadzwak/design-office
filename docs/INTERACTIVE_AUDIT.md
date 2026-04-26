# Interactive elements audit — iter-19 Phase A

**Method** : each route walked in preview browser at 1440 × 900, every
`<button>` / `<a>` / `[role="button"]` / `[role="radio"]` inventoried,
expected behaviour cross-referenced with the source. Source of truth
for "expected" is the Claude Design bundle when the element came from
the iter-18 port, plus Saad's iter-19 directive.

**Status legend** :

| Symbol | Meaning |
|--------|---------|
| ✅ | Works as expected |
| ⚠ | Partial — wires to something but the UX is incomplete / wrong |
| ❌ | Broken — click does nothing or routes to the wrong place |
| 🚧 | Not implemented yet (placeholder) |

**Priority** :

- **P0** : blocks a core flow (dashboard, brief, test fit, demo).
- **P1** : important but the flow survives without it for 3 minutes.
- **P2** : nice-to-have / cosmetic.

---

## Landing — `/`

| # | Element | Expected | Actual | Status | Priority |
|---|---------|----------|--------|--------|----------|
| L1 | "Sign in" (top-right) | Sign-in / onboarding modal → Dashboard | Navigates to `/project` (no auth step) | ⚠ — acceptable for the hackathon but semantically wrong | P2 |
| L2 | "Start a project" CTA | Start a fresh project flow (Dashboard → New) | Navigates to `/brief` which already has the default Lumen seed — does NOT start a new project | ❌ | **P0** |
| L3 | "Watch the demo" CTA | Play a video / scrollytelling | Navigates to `/project` | 🚧 | P1 |
| L4 | "GITHUB" link (footer) | Opens github repo | `href="/"` with `preventDefault` — dead link | ❌ | P2 |
| L5 | "JOURNAL" footer text | link | not an anchor — static span | 🚧 | P2 |
| L6 | "BUILT WITH OPUS 4.7" footer | Badge | static span | — | n/a |
| L7 | "Surfaces" / "Method" / "Journal" nav items | Anchor links to sections | Static spans, no scroll behaviour | ❌ | P2 |
| L8 | Floating chat button | Opens drawer | Works | ✅ | — |

---

## Dashboard (projects list) — `/project`

| # | Element | Expected | Actual | Status | Priority |
|---|---------|----------|--------|--------|----------|
| D1 | GlobalNav logo "Archoff" | Back to landing | Works | ✅ | — |
| D2 | GlobalNav items (HOME / I / II / III / IV / V / VI) | Route to each surface | Works | ✅ | — |
| D3 | Engineering / Client PillToggle (nav) | Switch view_mode globally | Works | ✅ | — |
| D4 | Integration status badge | Opens integration-status popover | Works | ✅ | — |
| D5 | "New project" CTA | Opens a create-project modal → upload floor plan → redirect | **Does NOTHING — no click handler** | ❌ | **P0** |
| D6 | Search input (projects) | Filter by name / industry / client | Works | ✅ | — |
| D7 | Stage-filter pills (All / Brief / Test fit / Justify / Export) | Filter by project stage | Works | ✅ | — |
| D8 | Project cards (4, click entire card) | Open project detail | Works — click flips `openId` + `setActiveProject` | ✅ | — |

---

## Project detail — `/project/:id` (via card click)

| # | Element | Expected | Actual | Status | Priority |
|---|---------|----------|--------|--------|----------|
| PD1 | "All projects" back arrow | Return to list | Works | ✅ | — |
| PD2 | Engineering / Client PillToggle (in-page) | Switch view_mode | Duplicates the nav toggle ; both work but visually redundant | ⚠ | P2 |
| PD3 | Overall progress % display | Read-only | Works | ✅ | — |
| PD4 | "New run" button (top-right of Surfaces section) | Trigger a run ; ambiguous | **Does NOTHING — no click handler** | ❌ | P1 |
| PD5 | 5 Surface cards | Navigate to each surface route | Works | ✅ | — |
| PD6 | Recent activity log rows | Click to expand / filter | Just decorative rows, no click | 🚧 | P2 |

---

## Brief — `/brief`

| # | Element | Expected | Actual | Status | Priority |
|---|---------|----------|--------|--------|----------|
| B1 | Industry pills (8) | Set `project.client.industry` | Works | ✅ | — |
| B2 | Brief textarea | Edit draft + persist | Works (persists via `setBrief` on run) | ✅ | — |
| B3 | "Synthesize programme" CTA | Call `/api/brief/synthesize` + show trace + cards | Only visible in `phase === "idle"`. Because the default project seeds `programme.markdown` with a 4-bullet text that has NO H2 headings, the useEffect force-sets phase to `"done"` on mount — **the button never appears**, and `parseProgrammeSections(DEFAULT_PROGRAMME)` returns 0 cards. Result : dead page on a fresh load. | ❌ | **P0** |
| B4 | Programme cards drill-down (8) | Open drawer | Works *when* a real argumentaire is loaded — but fresh Lumen has 0 cards due to the bug above | ⚠ | **P0** |
| B5 | Asset dropzones (logo + floor plan) | Upload client logo + plan PDF | **Pure placeholders, no input / handler** | 🚧 | P1 |
| B6 | "Continue to test fit" CTA | Navigate | Visible only when done-phase has sections — today it's hidden because B3 is blocked | ⚠ | P0 (downstream of B3) |
| B7 | Drawer close × | Close drawer | Works | ✅ | — |

---

## Test Fit macro — `/testfit?tab=macro`

| # | Element | Expected | Actual | Status | Priority |
|---|---------|----------|--------|--------|----------|
| TF1 | Macro / Micro PillToggle | Switch tab | Works | ✅ | — |
| TF2 | 3 variant cards | Select variant + retain | Works (forest border + setTestFitRetained + setActive) | ✅ | — |
| TF3 | 2D / 3D PillToggle inside each variant card | Swap the preview | **`onChange` is a no-op stub** — the toggle never actually switches views | ❌ | **P0** (Saad flagged) |
| TF4 | "Drill into micro-zoning" (on active card) | Flip tab to micro | Works | ✅ | — |
| TF5 | 2D FloorPlan2D inside variant cards | Render zones | **SEVERE OVERLAP** — zones collide, labels clipped. Saad's screenshot shows the issue. | ❌ | **P0** |
| TF6 | Iterate bar input + "Generate" | POST `/api/testfit/iterate` + update variant | Works (live endpoint, upserts variant + screenshot) | ✅ | — |
| TF7 | "Generate 3 variants" primary (plan_ready phase) | POST `/api/testfit/generate` | Works | ✅ | — |

---

## Test Fit micro — `/testfit?tab=micro`

| # | Element | Expected | Actual | Status | Priority |
|---|---------|----------|--------|--------|----------|
| TFM1 | Variant pills (3) | Re-target the drill-down | Works | ✅ | — |
| TFM2 | "Run micro-zoning" CTA (idle) | POST structured endpoint | Works | ✅ | — |
| TFM3 | "Re-run" link (done) | Re-POST | Works | ✅ | — |
| TFM4 | 14 zone cards (click) | Open zone drawer | Works | ✅ | — |
| TFM5 | Numbered FloorPlan2D zone circles (click) | Open drawer for that zone | Works | ✅ | — |
| TFM6 | Drawer close × | Close | Works | ✅ | — |

---

## Mood Board — `/moodboard`

| # | Element | Expected | Actual | Status | Priority |
|---|---------|----------|--------|--------|----------|
| MB1 | 6 drill-topic cards (atmosphere/materials/furniture/planting/light/sources) | Open drawer | Works | ✅ | — |
| MB2 | Drawer content | Render per topic | Works | ✅ — except the Planting summary shows "undefined species" when the live Lumen selection nests objects the adapter's `length` miscounts | ⚠ | P2 |
| MB3 | Palette strip | Hover / copy | Read-only | ✅ (as intended) | — |
| MB4 | "Generate A3 PDF" / "Download A3 PDF" CTA | Generate or serve the PDF | Button nests an `<a>` when pdf_id is set — hydration warning (nested interactive elements). Otherwise works. | ⚠ | P1 |
| MB5 | **"Add to client deck"** CTA | Compose + download PPTX (per Saad's directive) | Navigates to `/justify` only — does NOT generate a deck | ❌ | **P0** (Saad flagged) |

---

## Justify — `/justify` (engineering)

| # | Element | Expected | Actual | Status | Priority |
|---|---------|----------|--------|--------|----------|
| J1 | 7 argumentaire cards | Open drawer | Works | ✅ | — |
| J2 | Drawer with pull quote + citations | Render | Works | ✅ | — |
| J3 | Research-trace aside (engineering only) | Live token count | Works ; falls back to estimated values when no run | ✅ | — |
| J4 | "Compose live" (aside, idle) | Call `/api/justify/generate` | Works | ✅ | — |
| J5 | "Compose client deck (PPTX)" CTA | → /export or → generate PPTX | Navigates to /export. **Does NOT compose a PPTX directly.** Needs to either start the PPTX generation flow OR be renamed to "Open export." | ⚠ | P1 |
| J6 | "Download report (PDF)" / "Download pitch deck (PPTX)" | Download | Visible only when response has ids — works | ✅ | — |

## Justify — `/justify` (client)

| # | Element | Expected | Actual | Status | Priority |
|---|---------|----------|--------|--------|----------|
| JC1 | Eyebrow "IV · STORY" + h1 "The story behind…" | Swap copy | Works | ✅ | — |
| JC2 | Research-trace aside | Hidden | Hidden correctly | ✅ | — |
| JC3 | 7 cards drawer | Open | Works | ✅ | — |

---

## Export — `/export`

| # | Element | Expected | Actual | Status | Priority |
|---|---------|----------|--------|--------|----------|
| E1 | Scale PillToggle (1:50 / 100 / 200) | Drive scale param | Works (state only ; parsed on generate) | ✅ | — |
| E2 | Project reference input | Write project_ref | Works | ✅ | — |
| E3 | "Generate DXF" primary | POST `/api/export/dwg` (emits DXF) | Works | ✅ | — |
| E4 | "Generate DWG" disabled + ODA PENDING pill | Blocked per BLOCKERS.md B7 | Works as documented | ✅ | — |
| E5 | Result-card "Download" anchor | Serve DXF | Works (`/api/export/dxf/{id}`) | ✅ | — |

---

## Chat — drawer (any route) + `/chat` fullpage

| # | Element | Expected | Actual | Status | Priority |
|---|---------|----------|--------|--------|----------|
| CH1 | Floating 56 px chat trigger | Open drawer | Works | ✅ | — |
| CH2 | Drawer header : clear / maximize / close icons | 3 actions | Works | ✅ | — |
| CH3 | Context strip | Show working-on summary | Works | ✅ | — |
| CH4 | Bubble list + send composer | Message flow | Works (streaming + enrichment detection + action allow-list) | ✅ | — |
| CH5 | Enrichment confirmation card | "Update project / Keep as is / Cancel" | Works (iter-17 logic preserved) | ✅ | — |
| CH6 | Action confirmation card (forest-bordered) | "Apply / Cancel" | Works | ✅ | — |
| CH7 | `/chat` conversations sidebar | Switch convo / New convo | Local only (no persistence) | 🚧 | P2 |
| CH8 | "Back to dashboard" left rail | Navigate | Works | ✅ | — |
| CH9 | Chat-drawer backdrop click | Close drawer | Works | ✅ | — |

---

## Top 10 fix priorities

| Rank | Fix | Priority | Doc section |
|------|-----|----------|-------------|
| 1 | **D5** — Wire "New project" on Dashboard to a real create-project modal with floor-plan upload + parse + redirect | **P0** | iter-19 B |
| 2 | **TF5** — Fix 2D Test Fit visual collisions (bundle's FloorPlan2D zones overlap on real macro data) | **P0** | iter-19 C |
| 3 | **B3 / B4 / B6** — Seed a programme with H2 sections OR force the Brief into `idle` phase when sections count is 0 so the Synthesize button resurfaces | **P0** | iter-19 B (follow-on) |
| 4 | **TF3** — Make the per-variant 2D/3D toggle actually swap the preview | **P0** | iter-19 D |
| 5 | **MB5** — "Add to client deck" should compose + download the PPTX (or be renamed "Open justify") | **P0** | iter-19 D |
| 6 | **L2** — "Start a project" on Landing should open the new-project modal instead of jumping straight to /brief | **P0** | iter-19 B |
| 7 | **PD4** — "New run" on Project detail : wire or remove | P1 | iter-19 E |
| 8 | **B5** — Asset dropzones : wire logo + floor-plan upload | P1 | iter-19 E |
| 9 | **J5** — Rename "Compose client deck (PPTX)" → "Open export" or start the generation from here | P1 | iter-19 E |
| 10 | **MB4** — Generate-vs-Download "A3 PDF" : two buttons so the `<a>` and `<button>` don't nest | P1 | iter-19 E |

---

## Carry-forward / P2 notes

- L4 / L7 — Landing marketing links are inert. Acceptable for demo ; wire them post-hackathon.
- CH7 — Chat conversation persistence. Not demo-blocking.
- PD2 — view-mode toggle duplicated between nav + project-detail hero. Choose one.
- MB2 — Planting-summary "undefined species" needs a schema patch.
- The per-card 2D/3D toggle (TF3) should probably be a page-level toggle above the 3 variant cards rather than 3 separate toggles ; defer UX decision to iter-20 if scope creep.

---

**Next** : stop here, commit this report alone, then move to iter-19 B
(New project flow) per the directive.
