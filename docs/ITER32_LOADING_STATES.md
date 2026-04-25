# iter-32 — Loading states (TestFit macro + micro)

Saad reported that the macro and micro generation states on
`/testfit` looked dead during the real wall-clock wait :

- **Macro** (~30-60 s) showed three white pulsing boxes labelled
  *"Composing variant 1…"*. Visually inert, no story, no signal of
  what the orchestration was doing.
- **Micro** (~2-3 min) showed a single one-line card *"Detailing the
  {variant} variant, zone by zone…"*. Even less.

Both were replaced with editorial loading states that mirror the
eventual result layout in placeholder form, narrate what the
orchestration is actually doing, and use the same primitives the
rest of the product already speaks (TypewriterText, DotPulse,
soft-breathe).

## Design principles

1. **Render the destination, not a generic spinner.**  The user is
   waiting to see *something specific* (three variant cards / a
   floor plan + zone list). The loading state shows the same grid
   geometry and the same typographic chrome (eyebrow, italic
   Fraunces title, mono live-narration band). When the response
   lands, the parent unmounts the loading component and the real
   content fills the same slots — no layout shift.

2. **Honest narration, not fake progress.**  The backend doesn't
   stream per-step progress, so client-side cadence would lie if it
   said "step 3/4 done." Instead the typewriter *loops* through a
   list of orchestration steps as long as the component is mounted.
   The user reads it as "still working" because the words keep
   moving, not because we're claiming progress that didn't happen.

3. **Single primitive across surfaces.** Brief, Justify, TestFit
   macro, TestFit micro all converge on `<TypewriterText>` /
   `<CyclingTypewriter>` + `<DotPulse>` + `Eyebrow`. The vocabulary
   is consistent across surfaces, which reads as polish.

4. **Organic Modern tokens only.** No new colours. Forest for
   active state, sand-deep for variant pigment, mist for hairlines
   and skeletons, canvas / canvas-alt for backgrounds. `soft-
   breathe` and `dot-pulse` from `tailwind.config.ts` keep
   animations consistent with the existing motion language.

## Macro loading (`MacroLoadingGrid` in `routes/TestFit.tsx`)

Three cards, identical grid geometry to the post-generation card
grid (`repeat(3, 1fr)`, `gap-6`, `h-[360px]`). Per card:

```
┌──────────────────────────────────────────┐
│  VARIANT · 0N                       ●     │   ← eyebrow + dot-pulse
│                                            │      (per-pigment, staggered delay)
│  Villageois                                │   ← italic Fraunces 28 px,
│                                            │      eventual title shown
│                                            │      in place
│                                            │
│  ─────────────────────────────────────    │
│  OPUS · LIVE                              │   ← live-narration eyebrow
│  Anchoring quartiers around a central     │   ← CyclingTypewriter,
│  social spine…|                           │      4-message loop
└──────────────────────────────────────────┘
```

- Per-variant pigment (`forest` / `sand-deep` / `mint`) on the
  dot-pulse, matching the variant's pigment in the post-generation
  cards.
- `soft-breathe 3s` on each card with `0 / 0.2 / 0.4 s` staggered
  delays so the trio breathes asynchronously.
- `CyclingTypewriter.startOffset` shifted by `i * 900 ms` so the
  three cards display *different* messages at any given moment —
  visually evokes parallel agents without staggering anything
  physical.
- Each variant carries its own message bank (4 strings / variant),
  named after the actual orchestration steps : zone anchoring →
  Reviewer / Adjacency Validator call → SketchUp angle capture
  → final validation.

Live verified at 1280×720 with fetch patched to delay 30 s :
3 cards rendered with titles `Villageois / Atelier / Hybride
flex`, three different narration messages on screen
simultaneously, `VARIANT · 01/02/03` + `OPUS · LIVE` eyebrows,
no white-frame look.

## Micro loading (`MicroLoadingGrid` in `routes/TestFit.tsx`)

Two-column layout matching the eventual done view
(`1.6fr 1fr`, `gap-8`).

**Left** : a "blueprint" panel.

```
┌──────────────────────────────────────────────────────┐
│ ● MICRO-ZONING · LIVE                                 │
│                                                      │
│ Atelier                                              │   ← italic Fraunces 28 px
│ usually 2 – 3 minutes                                │   ← mono caption
│                                                      │
│ (diagonal sand hairlines under the content,           │
│  decorative, no semantic content — quiet "drafting   │
│  in progress" texture)                               │
│                                                      │
│ ─────────────────────────────────────────────────────│
│ OPUS · NARRATING                                     │
│ Computing zone breakdown by typology…|              │   ← CyclingTypewriter,
│                                                      │      6-message loop
└──────────────────────────────────────────────────────┘
```

The diagonal hairline pattern uses
`repeating-linear-gradient(45deg, transparent 0 36px,
var(--sand-soft) 36px 37px)` at 30 % opacity — reads as a
draughtsman's parallel rules without competing with the typography.

`soft-breathe 4s` on the outer card.

**Right** : 6 skeleton zone rows.

```
ZONES · COMPOSING            …
┌──────────────────────────────┐
│ 01  ▢  ▬▬▬▬▬▬▬▬▬▬       ●   │  ← number slot + skeleton icon
│         ▬▬▬▬                │     + skeleton name + meta + dot
├──────────────────────────────┤
│ 02  ▢  ▬▬▬▬▬▬▬▬▬▬▬▬     ●   │
│         ▬▬▬▬▬▬              │
├──────────────────────────────┤
│ 03  ▢  ▬▬▬▬▬▬▬▬▬       ●    │
│         ▬▬▬▬▬               │
…
```

- 6 rows. Default is 6 because the median micro response lands
  in the 5-8 range; once the response arrives the parent
  unmounts MicroLoadingGrid and renders the real list. (If the
  count is wrong by 2 zones, the user sees a brief flicker as
  the list resizes — acceptable.)
- Skeleton bars use the existing `.skeleton` utility from
  `globals.css` (gradient mist-100 → mist-200 → mist-100 +
  `animate-shimmer`).
- Width jitter `68 + (i*7)%22%` and `30 + (i*5)%18%` to avoid the
  "regimented progress bars" look.
- `soft-breathe 3s` per row, staggered by `i * 0.18 s`.
- The intentional decision : we do **not** reveal skeleton
  rows one-by-one to fake progress. The backend returns the
  whole payload at the end ; lying about per-zone progress
  would feel cheap. A static skeleton + cycling narration
  reads more honest.

## New primitive : `<CyclingTypewriter>`

`frontend/src/components/ui/CyclingTypewriter.tsx`. Wraps the
existing `TypewriterText` and cycles through a list of messages
in a loop. Advances after each message finishes typing + a
configurable hold (`holdMs`, default 1800).

Props :

| Prop          | Default | Purpose                                      |
|---------------|---------|----------------------------------------------|
| `messages`    | —       | Ordered list to cycle through                 |
| `speed`       | `28`    | ms per character (matches TypewriterText)     |
| `holdMs`      | `1800`  | ms to hold a finished message before advance  |
| `startOffset` | `0`     | ms to shift the cycle start (siblings out-of- |
|               |         | phase). Useful when 3 instances should display|
|               |         | different messages simultaneously             |
| `className`   | `""`    | passthrough                                   |
| `caret`       | `true`  | passthrough to TypewriterText                 |

Implementation note : TypewriterText resets character state when
its `text` prop changes, so cycling is just an index that picks
the next string. The `key={cycle-${idx}}` we pass to
TypewriterText forces a clean remount per message — guarantees
the caret blinks and the type-in animation restarts cleanly.

## Why this beats AgentTrace for these surfaces

`AgentTrace` (used on Brief + Justify) is the right primitive
when there are **N named agents** running in parallel/serial and
each agent has a distinct identity that survives the wait
("Headcount", "Compliance", "Editor"). The user reads the trace
as a roster of teammates working on their behalf.

For TestFit :
- **Macro** has *three variants* (not three agents). Each variant
  has its own internal Reviewer + Adjacency Validator — those are
  out-of-frame from the user's perspective ; surfacing them as
  a separate row would clutter without adding signal. Three
  variant cards + per-variant narration is the right metaphor.
- **Micro** has *one agent* drilling zones. AgentTrace doesn't fit
  one row. Skeleton zones + a single narration band reads better
  as "result composing in this exact slot."

## When to reach for `<CyclingTypewriter>`

Any surface whose backend takes >5 s and doesn't stream
per-step progress. The typewriter narration carries the
"working" signal ; the parent layout (skeleton rows / placeholder
cards / blueprint motif) carries the "this is the destination"
signal. Together they keep the page alive without claiming
progress that didn't happen.

If the backend ever streams real progress, swap the typewriter
for a real per-step indicator and bin the cycle. The component
boundary is small (one component, one place mounted) so the
swap is local.
