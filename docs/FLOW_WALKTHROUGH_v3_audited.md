# Flow walkthrough — iter-19 audited pass

**As of** : iter-19n (2026-04-23T21:05Z). Supersedes
`FLOW_WALKTHROUGH_v3.md` for regression-checking purposes — the v3
doc remains the canonical visual spec ; this file verifies every
interactive element actually does what it claims. Any element listed
here was exercised in the preview browser during iter-19 F.

The audit that drove this pass lives in
[`docs/INTERACTIVE_AUDIT.md`](./INTERACTIVE_AUDIT.md). Every "❌ broken"
row from there was either fixed or explicitly down-graded to P2 and
documented below.

Test context : 1440 × 900 viewport, localStorage cleared before the
run, backend + frontend both live (NanoBanana + Opus keys loaded).

---

## 0 — Cold-start

```js
localStorage.clear(); location.href = '/';
```

Result : Landing renders. h1 "DesignOffice." in italic Fraunces 112 px.
Nav shows 3 anchor links (Surfaces / Method / Journal) + "Sign in" CTA.

---

## 1 — Landing → New project

| Step | Click | Observed |
|------|-------|----------|
| 1.1 | "Start a project" CTA | Navigates to `/project?new=1` and the **NewProjectModal opens automatically** (iter-19 B). |
| 1.2 | Surfaces / Method / Journal anchors | Smooth-scroll to `#surfaces` / `#method` / `#journal` (iter-19 D). |
| 1.3 | GitHub footer | Opens `https://github.com/anthropics/design-office` in a new tab (iter-19 D). |
| 1.4 | Floating chat bubble | Drawer opens ; context strip shows "WORKING ON · …". |

✅ 4/4 pass.

---

## 2 — NewProjectModal → Dashboard detail

Modal fields :

- Project name : **"Helios"**
- Industry : **Creative agency**
- Logo : skipped for this run
- Floor plan : *optional* ; skip in this pass (separate run below)

Click "Create project" :

| Check | Observed |
|-------|----------|
| Toast | `● Project "Helios" created` (mint dot, bottom-centre) |
| Modal | Closed |
| Dashboard | Flipped to **ProjectDetail** for Helios |
| h1 | "Helios · Creative agency" |
| Stage pill | "Stage · Brief" |
| Progress | 0 % — all 5 surfaces pending |
| Projects index | 5 projects : Helios (top, active), Lumen, Altamont & Rees, Kaito Studio, Meridian |

✅ Pass.

---

## 3 — Helios → Brief (empty state)

Click "Write the brief" (iter-19 D rename of the "New run" orphan) :

| Check | Observed |
|-------|----------|
| Route | `/brief` |
| h1 | "Tell us about the project." |
| Textarea | Empty (no Lumen seed) |
| Phase | `idle` → "Synthesize programme" button visible |
| Industry pills | "Creative agency" selected (carried from modal) |
| Asset sidebar | `AssetLogoDrop` + `AssetPlanDrop` functional (iter-19 E) |

✅ Pass — Brief dead-end bug from iter-18 is gone (iter-19 B).

Asset-upload sub-test : click "DROP CLIENT LOGO" → file picker
opens → pick any small PNG → mint thumbnail renders + "Logo
attached" toast + sidebar flips to the attached-logo card with a
Remove button. Same pattern for the plan PDF.

---

## 4 — Back to Dashboard → Open Lumen → all surfaces

Click "All projects" back link, then the Lumen card :

| Route | Element | Observed |
|-------|---------|----------|
| `/project` (detail) | Engineering / Client PillToggle in hero | Flips `project.view_mode` globally ; Justify swaps its h1 on flip. |
| | 5 Surface cards (Brief / Test fit / Mood board / Justify / Export) | Each navigates ; pending surfaces disabled with 0.6 opacity. |
| | "Write the brief" (iter-19 rename) | Navigates to /brief. |

✅ Pass.

---

## 5 — Test fit macro

| Step | Observed |
|------|----------|
| `/testfit?tab=macro` | Three variant cards render with FloorPlan2D previews. |
| **2D zones no longer collide** | Biggest-first sort + halos + smart labels (iter-19 C). Lumen atelier shows "OPEN WORK", "FOCUS NAVE", "BOARDROOM", etc. without overlapping text. |
| **Per-card 2D/3D toggle** | Click "3D" on variant 1 → swaps to `/sketchup/sketchup_variant_villageois.png` iso render. Variants 2+3 stay in 2D (per-card local state). Clicking 2D on variant 1 returns the FloorPlan2D. (iter-19 D). |
| "Drill into micro-zoning" | Flips tab to micro. |
| Iterate bar | Type 3+ chars → "Generate" enabled → POST /api/testfit/iterate updates the active variant in place. |
| Zone legend | Renders 5 category chips + eyebrow. |
| 4-row AgentTrace | Done-state reports real numbers (avg adjacency, approval count). |

✅ Pass.

---

## 6 — Test fit micro

| Step | Observed |
|------|----------|
| `/testfit?tab=micro` | Loads the Lumen atelier fixture (`/microzoning-fixtures/atelier.json`) automatically. |
| 14 zone list + numbered FloorPlan2D | Clicking a number or a zone card opens the right-drawer with narrative + furniture table + acoustic block + materials list + adjacency check. |
| Variant pill row | Clicking Villageois / Hybride flex re-targets (runs the live endpoint on non-Lumen-atelier combos). |
| "Re-run" link | POSTs the structured endpoint again. |

✅ Pass.

---

## 7 — Mood board

| Step | Observed |
|------|----------|
| `/moodboard` | Loads `/moodboard-fixtures/lumen_atelier.json` ; tagline h1 in italic. |
| Pinterest collage | 10 tinted tiles in 3 CSS-columns, rotated ±0.4°. |
| Drill topic summaries | "Atmosphere 5 pigments · tech-startup fintech…", "Materials 8 finishes · Amtico · Interface · Kvadrat", "**Planting 4 species · biophilic strategy**", "**Light 3000 K · 3 fixtures**" (iter-19 E bug fix). |
| Planting drawer | Shows strategy paragraph + 4 species cards each with its own care / light annotation. |
| Light drawer | Kelvin big + strategy paragraph + fixture list. |
| Palette strip | 5 pigments with auto-contrasted foreground. |
| "Generate A3 PDF" | Button → POST /api/moodboard/generate. On success it turns into `<a>` "Download A3 PDF" (no more nested `<a>` in `<button>` hydration warning — iter-19 D). |
| "Compose client deck" (rename of "Add to client deck" iter-19 D) | Navigates to /justify. |

✅ Pass.

---

## 8 — Justify

Engineering view :

| Step | Observed |
|------|----------|
| h1 | "A sourced argumentaire, in the client's language." |
| 7 cards | Each opens the drawer with pull quote + citations. |
| Research-trace aside | Renders estimated totals ; "Compose live" primary calls /api/justify/generate. |
| **"Compose pitch deck (PPTX)"** | Primary CTA. If `pptx_id` absent calls generateJustify ; if present swaps to `<a>` "Download pitch deck (PPTX)". (iter-19 D) |
| "Open export →" | Navigates to /export. |

Client view (toggle in hero) :

| Step | Observed |
|------|----------|
| Eyebrow | "IV · STORY" |
| h1 | "The story behind this space." |
| Aside | Hidden. Single-column card grid. |

✅ Pass.

---

## 9 — Export

| Step | Observed |
|------|----------|
| h1 | "Hand off to engineering." |
| Retained pill + Scale PillToggle + project-ref input | All live. |
| "Generate DXF" | POST /api/export/dwg → mint shield-check card with filename / size / layers / sheet / scale + Download. |
| "Generate DWG" | Disabled with clay "ODA PENDING" pill + mono caption "DXF opens in every major CAD app" (iter-17 F blocker). |

✅ Pass.

---

## 10 — Chat (drawer + fullpage)

Drawer :

| Step | Observed |
|------|----------|
| Floating 56 px circular forest button | Opens drawer with soft-breathe animation. |
| Header | "Ask Design Office" + clear / maximize / close icons. |
| Bubble shape | User mist-100 sharp-bottom-right, assistant canvas 2 px forest left border, sharp-top-left. |
| Enrichment detection | Typing "Actually we're 120 people now" flashes the sand enrichment card. |
| Action card | When the assistant proposes a start_brief / retain_variant / … action, forest-bordered Apply/Cancel card fires the action for real. |
| Composer | Enter sends, 36 px forest circular send icon. |

Fullpage `/chat` :

| Step | Observed |
|------|----------|
| Sidebar | 5 sample convos + "+ New conversation" prepends a row. |
| Project card | Reads `getActiveProject()` + project state. |
| Right side | Same ChatPanel as the drawer — no code duplication. |

✅ Pass.

---

## 11 — End-to-end with a real floor-plan upload (Helios test)

1. Cleared localStorage, clicked "Start a project".
2. Modal → name "Helios", industry "Creative agency", picked the
   Lumen fixture PDF (`backend/tests/fixtures/lumen_plan.pdf`) via
   the plan drop.
3. Modal parsed the plan through `/api/testfit/parse` → mint
   shield-check card in the modal saying "4 envelope pts · 54
   columns · 2 cores · 22 windows".
4. "Create project" → toast + detail view.
5. Project detail tint : clay (creative-agency pigment).
6. Clicked "Brief" surface card → Synthesize CTA visible with
   empty textarea. The parsed FloorPlan was already in
   `project.floor_plan` so TestFit inherits it on first visit.

✅ Full flow survives with a real uploaded plan.

---

## Remaining P2 carry-forwards

| Ref | Item | Rationale |
|-----|------|-----------|
| L1 | "Sign in" on Landing routes straight to /project without auth | Acceptable hackathon demo. |
| PD2 | Engineering/Client toggle duplicated between nav + project-detail hero | Per bundle parity. |
| PD6 | Recent-activity rows are decorative (not clickable) | P2, not on the demo path. |
| CH7 | Chat conversation persistence | Sample rows suffice for the 3-minute demo. |
| Interactive audit top-10 | All P0 + 3 of 4 P1 fixed | The 4th P1 (J5 rename) delivered as a semantic rework rather than a direct rename. |

---

## Grand total

- Audit rows resolved this iteration : **17 / 23 interactive
  elements flagged.**
- Commits in iter-19 : 6 + inventory = **7**.
- Gates at each commit : tsc clean, vitest 41 → 43, pytest 100.
- No regression on Lumen end-to-end.

The product can now be demo'd live with a new-project creation
step — Saad's iter-19 #1 blocker.
