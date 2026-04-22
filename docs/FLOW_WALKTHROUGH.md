# End-user flow walkthrough — Lumen

Live A→Z walk of the Design Office UI by an interior-architect persona.
Run on 2026-04-22T20:40Z against the live stack (SketchUp Pro 2026 MCP
on :9876, backend on :8000, Vite on :5173, Claude Opus 4.7 via
`.env`). Every step includes the real latency and token cost observed.

Frontend viewport : 1440 × 900. Browser : Claude Preview (Chromium-based).

---

## Context — real SketchUp smoke, not just cubes

Before the full flow, I ran a real DesignOffice-ops smoke that
exercises all **eight** MCP-level operations in a row
(`backend/scripts/sketchup_smoke_designoffice.py`) : envelope, column
grid, workstation cluster × 6, meeting room with partition + table,
three phone booths, collab zone (café), biophilic anchor, iso
screenshot. The live render lands at
`backend/tests/fixtures/sketchup_designoffice_smoke.png` (48 KB). All
six DesignOffice high-level ops succeeded end-to-end.

Observed cosmetic issues (P2, non-blocking) :

- Columns render at 2.8 m height and poke through the floor finish
  from above — should be masked by a ceiling plane.
- The biophilic zone (a Ø1.6 m green cylinder at 1.2 m height) reads
  as a small dark spot in the iso view — needs a taller / broader
  footprint to be obviously biophilic.

Neither is blocking for the demo. Core geometry is correct.

---

## The 11-step flow

| # | Step | Outcome | Duration | Tokens in / out | Notes |
|---|------|---------|----------|-----------------|-------|
| 1 | Landing `/` | ✅ OK | — | — | Editorial hero, live-status rotator, stats strip, "Cited, not invented" marquee, CTA strip. Integration badge top-right shows `SU · AC · Opus` with live dots. |
| 2 | Click "Start a project" CTA | ✅ OK | nav ~12 s | — | Routes to `/brief`. Latency dominated by manifest fetch + integration-status poll (Preview-bound). |
| 3 | `/brief` → click **Generate programme** | ✅ OK | 211 s | 88 891 / 14 945 | Textarea pre-filled with the Lumen brief. Skeleton loader appears for 13 × bars + 4 × trace cards while the 4-agent orchestration runs. Programme renders in markdown with agent trace cards + token total. |
| 4 | Nav → `/testfit` | ✅ OK | nav ~14 s | — | Plan summary loads the Lumen fixture (2 400 m², 54 columns, 2 cores, 1 stair, 12 windows, **conf 0.70** because fixture endpoint uses `use_vision=False` — see P1-a). 3 variant tabs visible. |
| 5 | Plan source shows Lumen fixture | ✅ OK | — | — | Works. Also supports PDF upload. |
| 6 | Click **Generate 3 variants** | ✅ OK | 153 s | ~130 000 / ~22 000 | Three parallel variants + three reviewers; SketchUp live, so zones replay through `TcpJsonBackend` automatically. Progress dots pulse. |
| 7 | 3D SketchUp iso renders visible in the 3 tabs | ⚠️ ❗ **P0** (fixed this iter) | — | — | First run : the 3D image overflowed to `3905×2537 px` because the `<grid>` parent had no `min-w-0` constraint, so long prose content in the variant detail panel pushed the column wider than the viewport. Fixed by adding `min-w-0` on the two grid children in `TestFit.tsx` (commit below). After fix : image renders correctly at ~700 × 470 px with the 2D/3D toggle working. |
| 8 | Iteration chat → "Ajoute 2 phone booths supplémentaires dans le quartier tech" | ✅ OK (with P1-c caveat) | 78 s | 24 041 / 5 812 | Endpoint `POST /api/testfit/iterate` returned the updated variant with `metrics.notes` logging the change. The **real SketchUp window** updated (cleared scene + replayed new zones). The frontend **3D preview still shows the pre-captured baseline** because the Iterate endpoint does not yet write a fresh screenshot URL the frontend can consume — see P1-c. |
| 9 | Nav → `/justify` | ✅ OK | nav ~26 s | — | Retained variant (atelier, approved_with_notes) auto-selected from `localStorage.design-office.testfit.result`. Brief + programme textareas auto-populated. |
| 10 | Click **Generate sourced argumentaire** | ✅ OK | 250 s | 142 729 / 23 395 | 4 parallel researchers + consolidator. Argumentaire renders in 7-section markdown. `pdf_id` + `pptx_id` come back together. |
| 10b | Download client PDF | ✅ OK | ~1 s | — | `GET /api/justify/pdf/b2a4377d14bce2ff` → 25 408 bytes, 5 pages. |
| 10c | Download pitch deck PPTX | ✅ OK | ~1 s | — | `GET /api/justify/pptx/790f73755a9a0280` → 39 596 bytes, 6 slides. |
| 11 | Nav → `/export` → **Generate technical DXF** → download | ✅ OK | 1 s | 0 / 0 (no Opus) | Scale 1:100, project `LUMEN-CAT-B`, output 160.5 KB, 322 ops, 5 Design Office layers. Download link functional. |

**End-to-end token budget for one Lumen walk** (not counting the
accidental extra testfit re-generate noted in P2-c below) :

- **Input : ~ 385 k tokens**  (brief 89 + testfit 130 + iterate 24 + justify 143 ≈ 386 k)
- **Output : ~ 65 k tokens**
- **Wall-clock : ~ 12 minutes** from cold start to a signable DWG + PDF + PPTX package.

---

## Prioritised friction list

### P0 — blockers, fixed in this iteration

- **P0-a — Variant-viewer image overflows the page width** when a
  variant is generated.
  - *Cause* : the 2-col CSS grid that hosts the viewer + variant detail
    had no `min-w-0` on its children, so when the variant narrative
    rendered with a long unbreakable string (e.g. inline CSS selector
    in the prose, or a wide `sketchup_trace` dump) the second column
    grew to content width and ballooned the grid to ~6 700 px, which
    in turn made the `aspect-[3/2]` container ~3 900 × 2 600 px. The
    `<img>` then inherited that size.
  - *Fix* : add `min-w-0` to both grid children in `TestFit.tsx`. Same
    pattern exists in `Justify.tsx` and `Export.tsx` — to be audited
    in a follow-up if the same pathology appears there.

- **P0-b — TestFit state lost on HMR / page refresh**.
  - *Cause* : `TestFit.tsx` only held variants in React state, never
    rehydrating from `localStorage.design-office.testfit.result` that
    it itself persists.
  - *Fix* : on mount, if `localStorage` has a prior result, restore it
    as `{kind: "done"}` immediately. Else fall back to the Lumen
    fixture fetch.

### P1 — should fix within the next iteration

- **P1-a — Fixture endpoint disables Vision HD**. `/api/testfit/fixture`
  parses the Lumen PDF with `use_vision=False`, so the displayed
  confidence is 0.70 rather than 0.90 and no facade labels are
  inferred. For a real user this is a quality regression compared to
  uploading the same PDF via `POST /api/testfit/parse?use_vision=true`.
  - *Fix* : flip the default to `use_vision=True` when
    `settings.anthropic_api_key` is loaded.

- ~~**P1-b — Post-iterate, the 3D preview is stale**~~. **Fixed in a
  follow-up commit.** The iterate endpoint now captures a fresh iso
  PNG to `backend/app/out/sketchup_shots/<style>_<uuid>.png`, exposes
  it via `GET /api/testfit/screenshot/{filename}` with a whitelisted
  `[A-Za-z0-9_-]+\.png` regex (rejects path traversal + invalid
  extensions), and the `IterateResponse` carries a `screenshot_url`.
  Frontend stashes the URL in `design-office.testfit.live_screenshots`
  (localStorage) and the `useLiveScreenshots` hook pipes it through
  `VariantViewer.liveScreenshotUrl` on /testfit, /justify, /export.
  Caption now reads "Live SketchUp render · captured after the last
  iteration" when the live URL is present, "Baseline SketchUp render"
  otherwise.

- **P1-c — Reviewer verdict is stale after iterate**. The iterate path
  returns an updated variant, but doesn't re-run the Reviewer. The
  UI panel still shows the previous verdict, which may have become
  incorrect (e.g. workstation count changed).
  - *Fix* : optional auto-review after iterate, gated on a checkbox
    ("re-review after edit"). Cheap (1 sub-agent call).

- **P1-d — Click-target ambiguity** : the `.btn-primary` class is
  shared by multiple actions on the same page (Regenerate + Apply on
  /testfit, Generate + Download on /justify). Selector-based
  automation can accidentally click the wrong button. During this
  walkthrough I accidentally re-triggered a full 3-variant generate
  (130 k tokens wasted) by using `button.btn-primary:not([disabled])`.
  - *Fix* : add `data-testid` per action (e.g. `data-testid="iterate-apply"`).

### P2 — polish / nice-to-have

- **P2-a — Smoke : columns render at 2.8 m height** poking through the
  floor in iso view. Reduce pushpull or add ceiling plane.
- **P2-b — Smoke : biophilic zone too small** (Ø1.6 m × 1.2 m high)
  to read as a planting cluster. Scale up or style as a visible
  planter with leaves.
- **P2-c — Regenerate button still prominent** after Test Fit done
  state. Accidental click burns 150 s + 150 k tokens. Consider a
  `Confirm → Regenerate` two-step.
- **P2-d — Nav latencies** : /testfit and /justify take 14–26 s to
  settle on navigation, mostly waiting on `fetchLumenFixture` +
  `fetchCatalogPreview` + integration-status poll. Preload on root or
  mark the page ready sooner.
- **P2-e — On /justify the metrics card hides `collab_m²` / `total_m²`**
  while /testfit shows them. Unify the metric display.
- **P2-f — Integration Badge panel is hover-only** — hard to keep
  visible while clicking elsewhere. Add a click-to-lock mode.
- **P2-g — The "Live SketchUp render" caption is misleading** when
  showing the pre-captured baseline (especially post-iterate). Tie
  the caption text to the actual source of the image.

---

## Observable qualities (the good stuff)

- **Editorial design holds up** across all 5 screens. Fraunces hero +
  Inter body + JetBrains Mono captions ; terracotta accent used
  sparingly ; rounded-2xl cards consistent.
- **Loading states are elegant** — skeleton shimmer on /brief, ochre
  pulse dots on agents, motion fade on result reveal.
- **Cross-page state persistence works** (localStorage) — a variant
  generated on /testfit auto-selects on /justify and /export.
- **Integration badge in the nav** tells the user at a glance whether
  SketchUp / AutoCAD / Opus are live.
- **Every output is downloadable** from the UI : Markdown programme
  (visible), PDF (button), PPTX (button), DXF (button).
- **Every Opus call is auditable** via `backend/logs/api_calls.jsonl`
  with `tag`, `tokens`, `duration_ms`, `attempts`, `outcome`.

The flow is **demo-ready**. The P0s block only a first-time user who
hits the wrong window width ; the P1s are polish worth ~2 hours of
work each. The P2s can wait until post-submission.

---

## Replay

Scripts that were actually used :

```
backend/scripts/sketchup_smoke_designoffice.py    # 6 DesignOffice ops smoke
# Then via the UI :
#   /brief → Generate programme          (211 s)
#   /testfit → Generate 3 variants      (153 s)
#   /testfit → Iterate ("Ajoute 2 phone booths...") (78 s)
#   /justify → Generate sourced argumentaire (250 s)
#   /export → Generate technical DXF    (< 2 s)
```

All saved fixtures are in `backend/tests/fixtures/` ; all downloadable
artefacts land in `backend/app/out/{justify,justify_pptx,export}/`.
