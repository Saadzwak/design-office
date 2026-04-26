# Archoff — UI design

A short guide to the visual language of Archoff. The product is aimed at
interior architects who design tertiary fit-outs for Gensler, Saguez, MoreySmith
and similar agencies. The interface must feel at home next to their mood boards
and Kinfolk subscriptions — never like a SaaS dashboard.

## Principles

1. **Paper, not dashboard.** Ivory backgrounds, long form, generous white
   space. Elements sit on the canvas, they do not live inside boxes.
2. **One pigment at a time.** Forest green is the single accent for action and
   active state. Sand and sun are reserved for the three variants (villageois,
   atelier, hybride flex) and for the reviewer’s verdicts.
3. **Editorial over informational.** Titles are Fraunces display, set large.
   Italics carry meaning (“A quiet _co-architect_ for office interiors.”). Small
   caps in JetBrains Mono label everything else.
4. **Subtlety over spectacle.** Animations are limited to fade-rise (12 px,
   400 ms, `[0.22, 1, 0.36, 1]`), a 1.4 s dot pulse, and a 4.5 s sun breathe on
   the chat button. No bounces, no toasts that pop.
5. **Architectural truth.** The 2D plan uses real architectural codes — ink for
   cores, sand for columns, hairlines for the envelope, per-variant pigment for
   the facade windows only. Not a UI mood-board of colourful rectangles.

## Palette

The palette is called **Organic Modern**. Every token is defined in
`frontend/tailwind.config.ts` and exposed through Tailwind utilities.

| Role                  | Token         | Hex       | Used for                            |
|-----------------------|---------------|-----------|-------------------------------------|
| Canvas (page)         | `canvas`      | `#FAF7F2` | All page backgrounds                |
| Raised (cards, panel) | `raised`      | `#FFFCF6` | Cards, drawers, chat bubbles        |
| Hairline              | `hairline`    | `#E8E3D8` | 1 px borders and dividers           |
| Ink                   | `ink`         | `#1C1F1A` | Headlines, body, core masses        |
| Ink soft              | `ink-soft`    | `#3E4240` | Secondary body                      |
| Ink muted             | `ink-muted`   | `#7F837D` | Labels, metadata                    |
| Forest (accent)       | `forest`      | `#2F4A3F` | CTAs, active state, links           |
| Forest dark           | `forest-dark` | `#24382F` | Hover on primary button             |
| Sand (secondary)      | `sand`        | `#C9B79C` | Columns in the plan                 |
| Sand deep             | `sand-deep`   | `#A08863` | Atelier variant, warn reviewer      |
| Sun (highlight)       | `sun`         | `#E8C547` | Hybride flex variant, breathe dot   |
| Clay (error)          | `clay`        | `#A0522D` | Errors, rejected verdict            |
| Warm neutrals         | `mist-50..900`| —         | 8-step warm grey for subtle fills   |

The full scale lives as semantic tokens — code should always refer to
`bg-canvas`, `text-ink`, `border-forest`, never to raw hex values.

## Typography

Three families, loaded from Google Fonts via `frontend/index.html`:

- **Fraunces** — display + body serif. Variable axes `opsz (9-144)`,
  `wght (100-900)`, `SOFT (0-100)`. Used for all H1-H3, client names, variant
  titles, key numbers. Display headlines set `opsz` to 144, `wght` 620,
  `SOFT` 100 for a warm, editorial feel.
- **Inter** — UI sans, body copy. Variable 300-700.
- **JetBrains Mono** — labels, metadata, metrics. 400 and 500. Always uppercase
  with `tracking-label` (0.18 em) for section labels, `tracking-eyebrow`
  (0.28 em) for the forest eyebrows like `I · Brief`.

## Layout

- **Page shell** — 1440 px max, 40 px gutters (`px-10`), 48 px top / 112 px
  bottom padding (`pt-12 pb-28`).
- **Header** — 64 px, sticky, `bg-canvas/85` with a backdrop blur so the page
  colour bleeds through. A 1.5 px forest underline marks the active route.
- **Page rhythm** — every page starts with a 2-line eyebrow (`I · Brief`) in
  forest mono-caps, an H1 at `text-display-sm` (52 px) with one italic word,
  then a 15 px lead paragraph, then `mt-14` of breathing room before content.
- **Grids** — two columns, asymmetric. Hero always uses `minmax(0, 1.25fr)` to
  `minmax(0, 1fr)` so serif headlines have room to breathe and right rails stay
  narrow.
- **Borders** — 1 px `border-hairline` only. No shadows on input elements. The
  only elevated surfaces are the chat drawer (`shadow-drawer`) and the
  integration badge dropdown (`shadow-lift`).

## Components

### Buttons
- **Primary** — `.btn-primary`, `bg-forest` on `text-raised`, `rounded-md`
  (6 px), `px-5 py-2.5`. Hover `bg-forest-dark`, transition 200 ms ease-out.
  Only action per page; never two side by side.
- **Ghost** — `.btn-ghost`, `border-mist-200`, `text-ink`, `hover:bg-mist-50`.
  For secondary actions (Download PDF, Open in AutoCAD).
- **Minimal** — `.btn-minimal`, no border, no bg, `hover:bg-mist-50`. For
  “Start over”, “How it works”, tertiary navigation.

### Inputs
- **Underline** — `.input-line`. No box, only a 1 px bottom border that turns
  forest on focus. Used for client name, project reference, chat composer.
- **Page textarea** — `.textarea-page`. Serif Fraunces, no border, no bg,
  leading-relaxed. Used for the brief editor — feels like a page, not a field.
- **Framed textarea** — only for secondary Markdown fields (programme edit).
  `border-hairline`, `bg-raised`, JetBrains Mono 11 px.

### Indicators
- **DotStatus** — 7 px circle. Tones `idle / running / ok / warn / error` map
  to `mist-300`, `forest` with dot-pulse animation, `forest`, `sand-deep`,
  `clay` respectively.
- **Variant dots** — 7-9 px circles in forest / sand-deep / sun, one per
  variant. Never used as background; always sit on the canvas.
- **Verdict dots** — same dot vocabulary; reviewer says `approved` (forest),
  `approved_with_notes` (sand-deep), `rejected` (clay).

### Loading states
- No skeleton bars. Ever.
- Instead: `TypewriterText` (26 ms per char, blinking caret) spelling out the
  agent’s current task — `"Counting desks, meeting rooms, support spaces…"`.
- In parallel: a 6 px forest dot pulsing at 1.4 s with staggered delays, one
  per active sub-agent.

### Chat drawer
- Floating pill, forest background, ivory label. A sun-tinted dot breathes at
  4.5 s — the only pulsing element on an otherwise still canvas.
- Drawer slides from the right, 480 px wide, `bg-canvas`, spring 280 stiffness.

## Photography & imagery

- **Hero** — black & white photography of real architectural interiors
  (corridors, library reading rooms). Hotlinked from Unsplash, grayscale
  filter, optional `contrast-110` to keep the ink palette coherent.
- **Secondary quote image** — same family, different composition, balanced by
  an italic Fraunces pull-quote on the left.
- **No stock diagrams, no AI-generated illustrations, no emojis.**

## Motion

- `fade-rise` — 400 ms, `translateY(8px)` to 0, `cubic-bezier(0.22, 1, 0.36, 1)`.
  Applied to `main` on every route change, and to data panels when they resolve.
- `dot-pulse` — 1.4 s, opacity 0.35 ↔ 1 + scale 0.85 ↔ 1.15. Used on the
  DotStatus.running tone.
- `soft-breathe` — 4.5 s, scale 1 ↔ 1.8 + opacity 0.45 ↔ 0. Used only on the
  chat button sun halo.
- `shimmer` — 2.4 s, used sparingly on the sources marquee on the landing.

Transitions on state changes use `transition-colors duration-200 ease-out-gentle`
(`cubic-bezier(0.32, 0.72, 0, 1)`). Never longer than 300 ms.

## Accessibility

- All active colours pass WCAG AA on the ivory canvas. Forest (`#2F4A3F`) on
  canvas reaches 8.6:1 — comfortably above the 4.5:1 threshold.
- Focus rings use `focus-visible:ring-2 ring-forest/40`. Never removed.
- Every icon carries an `aria-label`. The chat button uses
  `aria-label="Open Ask Archoff"`.

## Five pages at a glance

| Page        | One-word theme | Page screenshot                                  |
|-------------|----------------|--------------------------------------------------|
| Landing     | _quiet_        | [`screenshots/01-landing.png`](screenshots/01-landing.png) |
| Brief       | _blank page_   | [`screenshots/02-brief.png`](screenshots/02-brief.png)     |
| Test Fit    | _plan_         | [`screenshots/03-testfit.png`](screenshots/03-testfit.png) |
| Justify     | _argumentaire_ | [`screenshots/04-justify.png`](screenshots/04-justify.png) |
| Export      | _delivery_     | [`screenshots/05-export.png`](screenshots/05-export.png)   |

Every page opens with an eyebrow (`I · Brief`), a Fraunces headline with one
italic word, a 15 px lead paragraph, and a 56-px rhythm before content. The
three variants carry the same pigment (`forest / sand-deep / sun`) from Test
Fit to Justify to Export — the same eye that picks a variant on Test Fit
tracks it across the rest of the product.
