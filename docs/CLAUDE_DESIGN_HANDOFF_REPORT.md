# Claude Design handoff — inventory report (iter-18 Phase 1)

**Bundle fetched** : `https://api.anthropic.com/v1/design/h/OkuKkTFI2Ki2myAThbhA4Q`
**Transport** : WebFetch returned 31 kB gzip → 127 kB POSIX tar → extracted to
`claude-design-bundle/opus-4-7/` (the tar's single top-level folder).
**Fetched on** : 2026-04-23 16:06 UTC.

This document is **Phase 1 only** : inventory and risk analysis. No
production code has been modified. Phase 2 begins only on Saad's explicit
"Go Phase 2".

---

## a. Exhaustive file list

| Path | Size | Role |
|------|------|------|
| `opus-4-7/README.md` | 2.0 kB | Handoff doc for the coding agent. Tells us to read chats first, then `Archoff.html` top-to-bottom, then follow imports. States the prototype is HTML/CSS/JS (not production) — we recreate in whatever target technology fits. Explicitly says **don't** open the prototype in a browser for screenshots ; read sources directly. |
| `opus-4-7/chats/chat1.md` | 4.9 kB | Transcript of a single Claude Design session. User asked for a "projects-first" dashboard after initial build (single-project view). Relevant intent : dashboard drills from projects list → project hub (5-surface grid) → surface page. Assistant hit a stale-cache bug, fixed it with `?v=2` query busters. |
| `opus-4-7/project/Archoff.html` | 6.4 kB | Entry point. Router via `React.useState('landing' \| 'dashboard' \| 'brief' \| 'testfit' \| 'moodboard' \| 'justify' \| 'export' \| 'chat')`, persisted in `localStorage.do_route`. `GlobalNav` hidden on `landing` + `chat`. Floating chat button + right-edge `Drawer` wrapping `ChatBody`. Pulls React 18.3.1 + ReactDOM + Babel Standalone 7.29 from `unpkg` at runtime (prototype only — not a production build). |
| `opus-4-7/project/src/tokens.css` | 5.7 kB | Design tokens (:root vars), typography helpers, `.btn` / `.pill` / `.card` / `.input-underline` primitives, 4 keyframes (`dot-pulse`, `soft-breathe`, `fade-rise`, `blink-caret`), scrollbars, placeholder tile, selection. |
| `opus-4-7/project/src/components.jsx` | 12.0 kB | Reusable primitives as inline React components : `Icon` (39-path mini-lucide set), `Typewriter`, `DotPulse`, `Eyebrow`, `MetricBadge`, `PillToggle` (2-value pill segmented toggle), `Drawer` (right, 460 px, transform-X + backdrop-blur), `AgentTrace` (`[{roman,name,status,message}]`), `roman(n)`, `Placeholder` (diagonal-hatch placeholder with mono tag), `FloorPlan` (inline SVG with 88×62 normalised zone coords, 5-category fills), `ZONE_COLORS` table. |
| `opus-4-7/project/src/data.js` | 14.4 kB | **Fictional** sample corpus. Global `window.PROJECTS[4]` (Lumen / Atrium / Forge / Meridian — four distinct industries, each with a per-surface state summary for the dashboard), global `window.LUMEN` (deep data for every surface : `brief.synthesis[8]`, `macroVariants[3]` with normalised zones, `microZones[12]`, `moodBoard.{palette,tiles,materials,furniture,light,planting}`, `justify[7]`, `runs[5]`). This is the source of truth for the prototype — every screen reads from these globals. |
| `opus-4-7/project/src/screens-1.jsx` | 33.7 kB | `LandingScreen`, `DashboardScreen` (splits into `ProjectsList` ↔ `ProjectDetail` internally), `BriefScreen`. |
| `opus-4-7/project/src/screens-2.jsx` | 29.5 kB | `TestFitScreen` (with internal `MacroView` + `MicroView` + zone `Drawer`), `MoodBoardScreen` (Pinterest collage + drill-down drawers per topic), `JustifyScreen` (card grid + research-trace aside + section drawer + Engineering/Client view-mode conditional). |
| `opus-4-7/project/src/screens-3.jsx` | 13.5 kB | `ExportScreen` (hero panel + pipeline + generation states), `ChatBody` (shared between drawer + fullpage), `ChatFullPage` (conversations list + messages). |

**Total** : 9 files, ~128 kB. No binary assets, no logos, no fonts shipped in
the bundle. Fonts are pulled via `@import` from Google Fonts inside
`tokens.css`.

---

## b. Pages / screens → our existing routes

The bundle enumerates **8 screen entries** in the `ROUTES` array (10 if we
split TestFit macro/micro and Chat drawer/fullpage).

| Bundle screen | Our current route | Fit |
|---------------|-------------------|-----|
| `LandingScreen` | `/` (Landing) | ✅ direct |
| `DashboardScreen` (projects list + project detail) | **NEW** — we have no `/project` or dashboard | ⚠️ NEW ROUTE needed |
| `BriefScreen` | `/brief` | ✅ direct, but refactor around card-drill-down |
| `TestFitScreen` → `MacroView` | `/testfit?tab=macro` | ✅ direct |
| `TestFitScreen` → `MicroView` | `/testfit?tab=micro` | ✅ direct |
| `MoodBoardScreen` | `/moodboard` | ✅ direct, but Pinterest collage visual is new |
| `JustifyScreen` | `/justify` | ✅ direct, view-mode already wired |
| `ExportScreen` | `/export` | ✅ direct |
| `ChatBody` inside `Drawer` | Floating drawer (today : `ChatDrawer` component) | ✅ replace existing drawer body |
| `ChatFullPage` | `/chat` | ✅ direct, needs conversations sidebar |

Net delta : **one new route** (`/project` or rename `/dashboard`) plus an
update on each existing surface.

---

## c. Design tokens — diff against `tailwind.config.ts`

### Colour diff

| Bundle `tokens.css` | Current `tailwind.config.ts` | Action |
|---------------------|------------------------------|--------|
| `--canvas #FAF7F2` | `canvas #FAF7F2` | ✅ IDENTICAL |
| `--canvas-2 #F3EEE5` | *(missing)* | ➕ ADD as `canvas-alt` or `raised-warm` |
| `--forest #2F4A3F` | `forest #2F4A3F` | ✅ IDENTICAL |
| `--forest-2 #3C5D50` | `forest-soft #4A6B5E` | ⚠️ DIFFERENT hex — bundle's hover is darker. Ship `forest-2 = #3C5D50` as the new hover token alongside our existing `forest-soft`. |
| `--forest-ghost rgba(47,74,63,.08)` | *(missing)* | ➕ ADD |
| `--sand #C9B79C` | `sand #C9B79C` | ✅ IDENTICAL |
| `--sand-2 #E4D7C1` | `sand-soft #E5DAC4` | ⚠️ off-by-1 on 2 channels — align on bundle (`#E4D7C1`) to keep Pinterest collage tinted correctly. |
| `--sun #E8C547` | `sun #E8C547` | ✅ IDENTICAL |
| `--clay #A0522D` | `clay #A0522D` | ✅ IDENTICAL |
| `--mint #6B8F7F` | *(missing — but we already use `#6B8F7F` inline in a few tailwind utility spots)* | ➕ ADD as semantic token |
| `--ink #1C1F1A` | `ink #1C1F1A` | ✅ IDENTICAL |
| `--ink-2 #2A2E28` | `ink-soft #5A5E53` | ⚠️ DIFFERENT — bundle's "ink-2" is a slightly-lighter ink, ours is a mid-grey soft-text. Rename bundle's to `ink-heavy` to avoid collision. |
| `--mist-50 #F6F3EE` | `mist-50 #F4F1EA` | ⚠️ close but not identical |
| `--mist-100 #EDE8DF` | `mist-100 #E8E3D8` | ⚠️ close but not identical |
| `--mist-200 #DDD6C9` | `mist-200 #D4CEC0` | ⚠️ close but not identical |
| `--mist-300 #C5BCAC` | `mist-300 #B8B2A4` | ⚠️ 6-9 units off per channel |
| `--mist-400 #A49B8B` | `mist-400 #8F8A7F` | ⚠️ more divergent |
| `--mist-500 #7F776A` | `mist-500 #6F6B62` | ⚠️ more divergent |
| `--mist-600 #5F584E` | `mist-600 #504D46` | ⚠️ divergent |
| `--mist-700 #423D36` | `mist-700 #363431` | ⚠️ divergent |
| `--mist-800 #2B2824` | `mist-800 #23221F` | ⚠️ divergent |
| `--mist-900 #1A1816` | `mist-900 #15141200` | ⚠️ ours carries an accidental 8-char hex (broken!) |

**Decision required** : the mist scale is close but not identical. The bundle
is the **source of truth** per Saad's rules. Adopt bundle values. Our
existing `mist-900` is also malformed (`#15141200` has a stray alpha byte) —
fixing it is not a visual regression.

### Typography

| Token | Bundle | Ours | Action |
|-------|--------|------|--------|
| Display font | Fraunces (weights 300,400,500,600 + italic 300/400/500, opsz 9..144) | Fraunces variable | ✅ compatible — our Fraunces variable axis covers bundle's static instances |
| Body font | Inter (300,400,500,600,700) | Inter variable | ✅ compatible |
| Mono font | JetBrains Mono (400,500) | JetBrains Mono | ✅ compatible |
| Display scale | Inline `clamp(52px, 9vw, 112px)` etc., no named classes | `display-sm / display / display-lg / display-xl` | ✅ our scale is richer ; bundle inlines sizes (less reusable) — keep ours, port bundle pages to use our classes where possible |

### Radii

| Token | Bundle | Ours | Action |
|-------|--------|------|--------|
| `--r-sm` | `4px` | `sm=4px` | ✅ IDENTICAL |
| `--r-md` | `6px` | `md=6px` | ✅ IDENTICAL |
| `--r-lg` | `8px` | `lg=8px` | ✅ IDENTICAL |
| `--r-xl` | `12px` | `xl=12px` | ✅ IDENTICAL |
| `--r-2xl` | `18px` | `2xl=16px` | ⚠️ 2 px off — adopt bundle (`18px`). |

### Shadows

| Token | Bundle | Ours | Action |
|-------|--------|------|--------|
| `--sh-soft` | `0 1px 2px .04 + 0 4px 12px .05` | `shadow-soft: 0 1px 2px .04 + 0 0 1px .06` | ⚠️ bundle's is more pronounced (12 px drop instead of a hairline). Adopt bundle. |
| `--sh-lift` | `0 2px 4px .05 + 0 12px 24px .07` | `shadow-lift: 0 8px 28px -12px .12 + 0 2px 4px .04` | ⚠️ meaningfully different elevations. Adopt bundle. |
| `--sh-hero` | `0 24px 48px .08` | *(missing)* | ➕ ADD |
| `shadow-drawer` | — | `-16px 0 48px -24px .18` | keep ours + bundle's inline `-24px 0 48px .08` for ChatDrawer — reconcile |

### Motion

| Token | Bundle | Ours | Action |
|-------|--------|------|--------|
| `--ease` | `cubic-bezier(0.22, 1, 0.36, 1)` | `out-gentle: cubic-bezier(0.22, 1, 0.36, 1)` | ✅ IDENTICAL |
| `fade-rise` | `from opacity 0 translateY 6px → 1 / 0` (360 ms) | `300ms` version | ⚠️ align on 360 ms |
| `soft-breathe` | `scale(1) ↔ scale(1.03)` 3 s | `scale(1) ↔ scale(1.03) + opacity` 4.5 s | ⚠️ adopt bundle (shorter, no opacity) |
| `dot-pulse` | `opacity .3→1 + scale .9→1.1` 1.1 s | `opacity .35→1` 1.4 s | ⚠️ bundle adds scale. Adopt. |
| `blink-caret` | 900 ms step-end | *(missing)* | ➕ ADD for chat typewriter |

---

## d. External assets — fonts, images, icons, CDN libs

| Asset | Source | Notes |
|-------|--------|-------|
| Fraunces | `fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@...` | Already linked in our `main.tsx` / `index.html` — keep as is. |
| Inter | same Google Fonts import | Already loaded. |
| JetBrains Mono | same Google Fonts import | Already loaded. |
| React 18.3.1 | `unpkg.com/react@18.3.1/umd/react.development.js` | **Prototype only** — we have React 18.3.1 in npm ✅ |
| ReactDOM 18.3.1 | `unpkg.com/react-dom@18.3.1/umd/react-dom.development.js` | **Prototype only** — we have it in npm ✅ |
| Babel Standalone 7.29.0 | `unpkg.com/@babel/standalone@7.29.0/babel.min.js` | **Prototype only** — we compile at build time with `@vitejs/plugin-react`, no runtime Babel needed |
| Icons | Inline SVG paths in `components.jsx` (39 icons, Lucide-style, stroke 1.5) | We already have `lucide-react` 0.453. Bundle reinvents a tiny subset inline ; we'd use `lucide-react` directly and keep the same stroke weight. |
| Images | **None shipped**. Every visual is either a `Placeholder` div or a tinted gradient. | Real images will come from (a) our SketchUp renders in `backend/tests/fixtures/`, (b) our NanoBanana visual moodboard endpoint, (c) the new 2D SVG floor-plan endpoint. |
| Logos | None | We keep our existing client-logo upload flow. |

**Conclusion on external deps** : bundle adds **zero** new npm packages.
Everything is either already in `package.json` or reimplementable inline
using what we already have.

---

## e. npm dependency analysis

### Current stack (`frontend/package.json`)

```
dependencies:
  react                ^18.3.1
  react-dom            ^18.3.1
  framer-motion        ^11.5.0
  lucide-react         ^0.453.0
  react-router-dom     ^6.27.0
  react-markdown       ^9.0.1
  remark-gfm           ^4.0.0

devDependencies:
  @tailwindcss/typography ^0.5.15
  @types/react            ^18.3.12
  @types/react-dom        ^18.3.1
  @vitejs/plugin-react    ^4.3.3
  autoprefixer            ^10.4.20
  postcss                 ^8.4.49
  tailwindcss             ^3.4.14
  typescript              ^5.6.3
  vite                    ^5.4.10
```

### Bundle usage

- Uses React 18.3.1 + ReactDOM 18.3.1 (matches ours)
- Uses `React.useState`, `React.useEffect`, `React.Fragment`, `React.createElement` (no hooks beyond these)
- No `framer-motion` references — bundle does motion via CSS keyframes only. Our framer-motion usage on the Brief / TestFit pages will coexist ; bundle's pages give us the option to drop framer where CSS is enough.
- No `react-router-dom` — the bundle uses a single-state router. We keep `react-router-dom` and use its `<Routes>` / `<NavLink>` instead of the bundle's inline approach.
- No `lucide-react` — bundle has its own 39-icon inline set. We keep `lucide-react` and use the real icons with stroke-width 1.5 for visual parity.
- No `react-markdown` / `remark-gfm` — not needed in bundle, but we still need them for the Brief programme markdown + Justify report markdown.

### Net dependency change

**Zero additions**. Zero removals. No peer-dep conflicts.
Optional follow-up : we could drop `framer-motion` on Landing + Dashboard
if CSS animations suffice — that's a cleanup, not a blocker.

---

## f. UI primitives — have / new / adapt

| Primitive | Bundle impl | Our current | Action |
|-----------|-------------|-------------|--------|
| Button `.btn .btn-primary` | CSS class + inline `padding/fontSize` overrides | Already ships as `btn-primary` in `globals.css` | ✅ ADAPT — align padding/shadows with bundle |
| Button `.btn-ghost` | hairline + hover mist-50 | Ships (ghost variant) | ✅ ADAPT |
| Button `.btn-text` | Underline link variant | Missing | ➕ ADD |
| Pill `.pill .pill-active .pill-ghost` | full 3-state pill | `IntegrationBadge` approximates, no unified pill | ➕ ADD as `components/ui/Pill.tsx` |
| `PillToggle` (segmented 2-value) | `components.jsx` | `components/ui/ViewModeToggle` is close but hard-coded to ViewMode | 🔀 GENERALIZE — rename to `components/ui/PillToggle.tsx` with `options[]` + keep ViewModeToggle as a thin wrapper |
| Card `.card` | CSS class, cursor + hover elevation | Scattered inline rounded-lg+border across routes | ➕ EXTRACT as `components/ui/Card.tsx` |
| Drawer right 460 px | Backdrop-blur + transform-X | Our `ChatDrawer` is custom, 420 px, framer-motion spring | 🔀 UNIFY — port to the bundle's 460 px transform-X approach (keep framer-motion for the entrance if we like) |
| `Eyebrow` | `.eyebrow` class, uppercase tracking-label | `eyebrow-forest` / `label-xs` helpers scattered | ➕ EXTRACT `components/ui/Eyebrow.tsx` |
| `Typewriter` | 20-30 ms/char React effect | We already ship `components/ui/TypewriterText` — API differs | 🔀 ALIGN — bundle uses `{ text, speed, onDone }`, ours uses `{ text, speed, startDelay, caret }`. Extend ours to emit `onDone` + adopt blink-caret class. |
| `DotPulse` | 3 dots staggered | We ship `DotStatus` (single dot per status tone) | ➕ ADD separate `DotPulse` for running-agent state |
| `AgentTrace` | 3-column grid roman/name/status | We render traces in `routes/Brief.tsx` inline | ➕ EXTRACT `components/ui/AgentTrace.tsx` |
| `MetricBadge` | mono label + display number | `EditorialMetric` in TestFit.tsx is equivalent | ➕ EXTRACT unified `MetricBadge.tsx` |
| `Placeholder` | Diagonal hatch + mono tag | Missing | ➕ ADD — useful for empty states across every page |
| `FloorPlan` (inline SVG, 88×62 normalised) | `components.jsx` | Our backend ships real-mm SVGs via `/api/testfit/floor-plan-2d` — different scale | 🔀 ADAPTER — see §j |
| Floating chat button | circle 56 px, forest bg, breathe anim | We already ship `ChatDrawer` trigger — different styling | 🔀 RESTYLE, keep logic |
| Icons | Inline 39-path set | `lucide-react` | 🔀 MAP bundle icon names → lucide equivalents (trivial 1:1) |

---

## g. New interaction patterns introduced

1. **Projects list → project detail drill-down** on the dashboard. List
   → click a card → hero header with live tint gradient + pill metrics
   + view-mode pill + progress percent → 5-surface grid (each opens the
   corresponding surface page) → recent-activity timeline.
2. **Per-surface state pill** on each dashboard project card (5 dots
   coloured by state: done/active/draft/pending).
3. **Brief card-drill-down drawer** — the 8 programme sections become
   tiles, each click opens a right-drawer with tldr + body + sources.
   Replaces our current markdown blob.
4. **TestFit macro 2D/3D toggle per variant card** — each of the three
   cards shows a `PillToggle('2D', '3D')` switching the variant preview.
   Both states exist ; 3D is still a placeholder in the prototype.
5. **TestFit micro clickable zones** — 12 numbered zones on the plan ;
   clicking a number OR a zone card opens a right-drawer with zoom,
   furniture list, acoustic targets, materials, adjacency check, edit.
6. **Mood board Pinterest collage** — 10 tiles in a 3-column CSS
   `columnCount` flow, each tile with a tiny rotation `(i%3 - 1) * 0.4°`,
   soft shadow + paper padding. Click any topic card on the right side
   → drill-down drawer with materials grid / furniture list / planting /
   light / atmosphere / sources.
7. **Justify card grid + view-mode aware** — in Engineering view the
   research-trace aside is visible, in Client view it's hidden and the
   title switches to "The story behind this space."
8. **Justify section drawer** — opens on card click, includes
   pull-quote blockquote + sources list.
9. **Export hero panel + 3-step pipeline** — simultaneous "Generate DXF"
   / "Generate DWG" buttons, scale pill-toggle (1:50, 1:100, 1:200),
   running state via the shared AgentTrace.
10. **Chat inline confirmation card** — when the assistant proposes an
    action, the bubble renders a proposed-action card with primary
    (Update) + ghost (Keep) + ghost (Cancel) CTAs inside the bubble.
    Replaces our current separate `ConfirmationCard` component.
11. **Chat fullpage conversations sidebar** — 300 px left rail with
    timestamped conversation titles, "New conversation" CTA, active
    highlight.
12. **Soft-breathe animation on the floating chat button** — continuous
    3 s pulse, not triggered by hover.

---

## h. Top-5 integration risks

1. **Multi-project data model gap (highest risk).**
   Bundle's `PROJECTS[]` has 4 fictional projects each with per-surface
   state summaries (`{state, updatedAt, note}`). Our `project_state.v2`
   holds **one active project**. Two options :
   - (a) Extend v2 to hold `projects: Project[]` + `active_project_id`.
     Breaks every existing consumer of `loadProjectState()` that expects
     a flat `brief / programme / testfit / ...` shape.
   - (b) Add a separate `projects_index` localStorage key (array of
     `{id, name, industry, surfaces_summary}`) alongside the per-project
     v2 state ; loading a project swaps the active key.
   - Recommendation : (b). Additive, no regression on existing 71 tests.
   Implement in the new adapter layer.

2. **Zone coordinates normalised 0-88 / 0-62 vs our mm floor-plan.**
   Bundle's `FloorPlan` component expects zone bboxes in normalised
   plate units. Our backend emits absolute-mm SVG via
   `/api/testfit/floor-plan-2d`. Two paths :
   - (a) Use the backend SVG directly as `<img src="data:...">` or
     `<object>` inside the variant card and drop bundle's inline
     `FloorPlan`. Loses the zone-click drawer because the SVG is flat.
   - (b) Port bundle's `FloorPlan` to consume real-mm zones and
     normalise client-side (div by envelope w/h). Keep zone-click
     interactivity.
   - Recommendation : (b). Click interactivity is the whole point of the
     Micro drill-down. Ship a `zonesToNormalisedZones` adapter.

3. **Brief agent names revert to French.**
   Bundle says `{ name: 'Effectifs Agent', 'Benchmarks Agent',
   'Constraints Agent', 'Synthesizer' }`. Iter-17 E explicitly replaced
   those with studio vocab (`Headcount / Benchmarks / Compliance /
   Editor`). Saad's Phase-2 rule 1 says the design is source of truth ;
   rule 4 says iter-17 capabilities must be preserved. Ambiguity.
   - Recommendation : keep iter-17 studio vocab, override bundle
     copy where the design shows French class-names. Argue : "Agent"
     suffix is class-name-like ("Effectifs Agent" reads like a
     variable, not a studio role). Confirm with Saad during Phase 2
     kickoff.

4. **Bundle has its own fictional "Atrium / Forge / Meridian" data.**
   Those are NOT the industries we proved live (Lumen tech, Altamont
   law, Kaito creative). We'd either :
   - (a) Adopt bundle's names verbatim for the demo (loses real
     fixtures).
   - (b) Rename bundle's fictitious projects to match our real
     fixtures (Lumen stays, Atrium → Altamont law, Forge → Kaito
     creative, Meridian → a fourth synthetic).
   - Recommendation : (b). The live adjacency + moodboard fixtures
     are our proof of depth ; we keep them labelled correctly.

5. **Icon set collision.**
   Bundle ships an inline 39-icon set (`iconPaths` in components.jsx).
   We already have `lucide-react@0.453`. If we let the bundle path
   ship into the repo as-is, we have two icon libraries fighting for
   the same visual language — future icon additions might use either.
   - Recommendation : migrate bundle icon usages (`name: 'search'`,
     `'arrow-right'`, etc.) to `lucide-react` with stroke 1.5. Keep the
     39-path set as a fallback for any icon lucide-react doesn't ship
     at exactly the same shape (unlikely).

### Lower-severity risks (note, don't block)

- **Chat inline-confirmation shape** differs from our current
  `ConfirmationCard`. Adapter layer handles it.
- **Mood board Pinterest collage uses static `Placeholder` tiles**, no
  real images. We wire real NanoBanana visual images and
  material-finish stills where available, keep `Placeholder` as the
  loading state. No design drift, just content filling.
- **Export simulates generation with a setTimeout.** We wire the real
  `/api/export/dxf` endpoint ; the bundle's 3-step AgentTrace renders
  while the real backend call resolves.
- **Router is localStorage+useState** in the prototype. We use
  `react-router-dom` with real URLs ; that's already better (shareable
  links, browser back/forward). Migrate bundle screens to `useNavigate`
  without losing the `{route === 'x' && ...}` clarity.
- **`bundle tokens.css` `@import`s Google Fonts** with a different
  weight axis than ours. Our global `main.tsx` already pulls Fraunces
  variable + Inter variable. Adopt bundle's weight axis only if a
  page visibly uses `fontWeight: 300` italic — otherwise keep the
  variable axis.

---

## i. 10-step integration plan (estimated end-to-end ≈ 14-18 h)

1. **Setup** (30 min). Commit bundle under `claude-design-bundle/`
   (already done). No npm deps to add. Diff against current stack
   documented (this report).
2. **Token reconciliation** (45 min). Merge bundle `tokens.css` values
   into `tailwind.config.ts` : add `canvas-alt`, `forest-2`,
   `forest-ghost`, `mint`, `ink-heavy`, realign the mist scale to the
   bundle hexes, add `sh-hero`, fix the malformed `mist-900`. Update
   `globals.css` to emit the tokens as CSS vars for inline-style usage.
   tsc + pytest gates.
3. **UI primitives** (2 h). Extract `Card`, `Pill`, `PillToggle`,
   `Eyebrow`, `Drawer`, `AgentTrace`, `DotPulse`, `MetricBadge`,
   `Placeholder`, `FloorPlan` as TS components in
   `frontend/src/components/ui/`. Port the 39-icon table to `lucide-react`
   aliases. Ship Storybook-like visual checks via a throwaway
   `/__preview` route (dev only). tsc + pytest.
4. **Adapter layer** (1.5 h). Create `frontend/src/lib/adapters/` with :
   - `projectsIndex.ts` — new `localStorage` key, CRUD for the
     projects list without disturbing v2 active-project state.
   - `variantToDesignVariant.ts` — shape our `VariantOutput` into
     the design's `{ id, name, pigment, pitch, metrics, warnings,
     zones }` tuple.
   - `floorPlanToNormalisedZones.ts` — convert absolute-mm bboxes to
     88×62 normalised coords against the envelope bbox.
   - `adjacencyAuditToWarnings.ts` — turn `AdjacencyAudit.violations`
     into the design's dashed-warning chip shape.
   - `projectStateToDashboardSummary.ts` — compute per-surface state
     (done/active/draft/pending) from `macro_zoning_runs`,
     `micro_zoning_runs`, `justify_runs`, etc.
   - `chatConfirmationAdapter.ts` — map our enrichment payload to
     the inline-bubble confirmation shape.
5. **Layout + nav** (1 h). Rewrite `App.tsx` around the new
   `GlobalNav`. Add `/project` route. Move the floating chat button
   + drawer out of App into a top-level mount compatible with every
   page. Landing + `/chat` hide the nav. tsc + pytest.
6. **Page ports — in order** (≈ 8-10 h total) :
   - (a) Landing (45 min) — hero split, metric strip, surfaces
     editorial grid, pull quote, sources marquee, footer. No backend
     wiring.
   - (b) Project dashboard (90 min) — projects list + project detail
     using the adapters from step 4, recent-activity from
     `projectState.runs`. Wire the "New project" action to a stubbed
     form.
   - (c) Brief (60 min) — industry pills + big editorial textarea +
     AgentTrace + 8-section card grid with drill-down drawer. Wire
     real `POST /api/brief/synthesize` ; adapt the manifest 14-items
     claim text.
   - (d) TestFit macro (75 min) — 3 variant cards with 2D floor
     plan inline + metrics row + adjacency warnings + iterate bar.
     Wire `POST /api/testfit/generate` + `POST /api/testfit/iterate`.
   - (e) TestFit micro (75 min) — variant pill + numbered floor
     plan + 12-zone list + zone drawer with furniture / acoustic /
     materials / adjacency-check. Wire `POST /api/testfit/microzoning`
     and iter-18 new adapter.
   - (f) Mood board (60 min) — Pinterest collage + 6 drill topics +
     palette strip + download CTAs. Wire `POST /api/moodboard/generate`
     for the PDF and `POST /api/moodboard/generate-visual` for the
     hero.
   - (g) Justify (45 min) — 7 cards + research trace aside
     (Engineering only) + section drawer with pull quote + sources.
     Wire `POST /api/justify/generate`.
   - (h) Export (45 min) — hero panel + scale pill + reference input
     + twin DXF/DWG buttons + 3-step pipeline + generation state.
     Wire `POST /api/export/dxf`. DWG stays behind the `B7` blocker
     banner ; the button shows a tooltip and a `clay`-coloured pill
     ("waiting on ODA converter").
   - (i) Chat drawer + fullpage (75 min) — `ChatBody` shared component,
     fullpage conversations sidebar, inline-confirmation bubble.
     Wire existing chat endpoint.
7. **Visual QA pass** (60 min). Preview-browser each page at
   1440×900 and 375×812. Save screenshots under
   `docs/screenshots/v3/`. Confirm `0` console errors.
8. **End-to-end Lumen walkthrough** (45 min). Run Brief → TestFit →
   MoodBoard → Justify → Export live. Document the session under
   `docs/FLOW_WALKTHROUGH_v3.md` with token spends per surface and a
   final "what a judge sees" summary. Take one reel-ready screenshot
   per surface.
9. **Docs refresh** (45 min). Update `README.md` hero + screenshots,
   `docs/ARCHITECTURE.md` routes + state diagram, `docs/DEMO_SCRIPT.md`
   to reflect the new dashboard-entry flow, `docs/HACKATHON_SUMMARY.md`
   iter-18 entry with the dashboard + drill-down claim.
10. **Preflight + final commit** (30 min). Update
    `scripts/demo_preflight.ps1` with the new v3 screenshots (7 pages
    + chat + dashboard). Bump BUILD_LOG with iter-18 close. Commit.

Wall-clock estimate : **14-18 h with gates at every commit**, plus
whatever back-and-forth the live Lumen walkthrough surfaces. Saad's
80 h remaining (noon Friday → Sunday 20:00 EST) accommodates this
with comfortable slack for unknowns.

---

## j. Components / screens that will need an adapter

Every place where the design assumes a data shape we don't emit.
The adapter layer lives in `frontend/src/lib/adapters/` (new).

| Consumer | Bundle expects | Our backend emits | Adapter |
|----------|----------------|-------------------|---------|
| `ProjectCard`, `ProjectDetail` | `PROJECTS[]` array with `{id, name, industry, headcount, headcountTarget, surface, floors, location, ref, stage, progress, updatedAt, tint, surfaces: {brief/testfit/moodboard/justify/export: {state, updatedAt, note}}}` | `project_state.v2` single-project shape + `macro_zoning_runs[]` etc. | `projectsIndex.ts` + `projectStateToDashboardSummary.ts` |
| `MacroView` → variant cards | `{id, name, pigment, pitch, metrics: {desks, density, flex, adjacency}, warnings: [{text, kind}], zones: [{label, kind, x, y, w, h}]}` in normalised 88×62 space | `VariantOutput` with `{style, title, narrative, metrics: VariantMetrics, sketchup_trace, adjacency_audit}` in absolute-mm space | `variantToDesignVariant.ts` + `floorPlanToNormalisedZones.ts` |
| `MicroView` → 12 zones list | `microZones: [{n, name, surface, icon, status}]` | `MicroZoningRun.markdown` (Opus-generated prose) + the variant's `sketchup_trace` for positional zones | **NEW backend endpoint** `POST /api/testfit/microzoning/structured` that returns `{ zones: [{n, name, surface, icon, status, furniture[], materials[], acoustic_targets}] }` — cleaner than parsing markdown client-side. OR a client-side markdown-to-zones parser if we must ship fast. Decide in Phase 2 kickoff. |
| `MoodBoardScreen` → tiles | `moodBoard.tiles: [{tag, ratio, tint}]` + `materials[]` + `furniture[]` + `light` + `planting` | `MoodBoardResponse.selection` JSON (palette + materials + furniture + planting + light from the curator agent) + `VisualMoodBoardResponse.path_rel` for the NanoBanana hero | `moodBoardToCollage.ts` — mainly re-shape palette hex list, materials 2-col grid, furniture brand/dims. Use the NanoBanana hero as ONE of the tiles (or as the page hero banner). |
| `JustifyScreen` → 7 cards | `justify: [{roman, title, tldr, citations}]` | `JustifyResponse.argumentaire_markdown` + `trace[]` + pdf_id | `argumentaireToSections.ts` — parse the structured-section markdown into the 7-card shape. Rely on iter-17 E's structured-sections prompt rewrite deferral — parse section headings H2 + their first sentence as tldr until the Opus prompt change lands. |
| `ExportScreen` → generation running-state | AgentTrace rows | HTTP request to `POST /api/export/dxf` returning `ExportResponse` | `exportProgressAdapter.ts` — emit the 3-row AgentTrace states (Model Reader / ezdxf Translator / Packager) based on the request lifecycle and the polling delay budget. |
| `ChatBody` inline `action: 'confirm'` | Inline bubble with `{type, proposed_label, confirm_label, reject_label}` | Our `chat.py` returns a `ChatResponse.enrichment` object with `{action_type, proposal, confirm_label, reject_label}` | `chatConfirmationAdapter.ts` — rename fields, ship the inline bubble as the render. |
| `ChatFullPage` conversations list | `[{t, label, active}]` hard-coded 5 | We don't persist chat history today. | **Out of scope for iter-18 Phase 2** — keep hard-coded sample conversations for the demo, wire real persistence later. |

---

## Suggested Phase 2 entry order (if Saad confirms this plan)

```
iter-18a  Tokens + globals.css reconciliation, tsc/pytest/preflight green
iter-18b  UI primitives extracted (+ Placeholder, Card, Pill, etc.)
iter-18c  Adapter layer (projectsIndex + 5 other adapters)
iter-18d  App.tsx + new GlobalNav + /project route
iter-18e  Landing page
iter-18f  Project dashboard
iter-18g  Brief
iter-18h  TestFit macro
iter-18i  TestFit micro
iter-18j  MoodBoard
iter-18k  Justify
iter-18l  Export
iter-18m  Chat drawer + fullpage
iter-18n  Screenshots v3 + walkthrough + docs + preflight
```

Each of `iter-18a` → `iter-18n` is a separate commit with green gates.
That's 14 commits for Phase 2. Sizeable but coherent, each one
reviewable in isolation if Saad wakes up mid-build and wants to
inspect progress.

---

## Open questions for Saad (confirm before Phase 2)

1. **French agent names** ("Effectifs Agent", "Constraints Agent") vs
   iter-17's studio vocab ("Headcount", "Compliance"). Pick one ; I
   recommend keeping the studio vocab and overriding bundle copy.
2. **Fictional projects** on the dashboard — keep bundle's
   Atrium/Forge/Meridian or rebrand to our real fixtures
   (Lumen/Altamont/Kaito + one synthetic for 4-tile grid)?
3. **Micro-zoning structured endpoint** — green-light a new
   `POST /api/testfit/microzoning/structured` that emits 12 numbered
   zones with furniture / acoustic / materials / status, or parse the
   existing markdown client-side?
4. **Chat inline-confirmation** — port existing `ConfirmationCard` into
   the inline bubble shape (matches design) or keep the separate
   confirmation card below the bubble (deviates from design but
   reuses iter-17 plumbing)?

Awaiting **"Go Phase 2"** + any answers to these four questions.

---

**End of Phase 1 inventory. No production code modified.**
