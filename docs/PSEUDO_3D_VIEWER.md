# Pseudo-3D Viewer

`frontend/src/components/viewer/PseudoThreeDViewer.tsx` is a lightweight
angle-switcher that gives Test Fit the *feel* of a 3D viewport without the
cost of a real WebGL scene. It is NOT Three.js. It is NOT interactive
rotation, zoom or pan. It is six pre-rendered SketchUp PNGs, stitched
together with carefully tuned UI affordances so the user perceives
spatial depth.

## What you get

Six angles per variant, captured offline against live SketchUp Pro :

| Angle        | Camera                                              | Purpose                                      |
| ------------ | --------------------------------------------------- | -------------------------------------------- |
| `iso_ne`     | 45 deg azimuth, 30 deg elevation, perspective       | Default hero view                            |
| `iso_nw`     | 135 deg azimuth, 30 deg elevation, perspective      | Reveals west facade + stair                  |
| `iso_se`     | 315 deg azimuth, 30 deg elevation, perspective      | Reveals south facade                         |
| `iso_sw`     | 225 deg azimuth, 30 deg elevation, perspective      | Reveals phone booths + cafe clusters         |
| `top_down`   | Orthographic, straight down, up-vector on Y         | Floor plate legibility                       |
| `eye_level`  | Perspective, 1.65 m height, 10 m outside the model  | Human-scale immersion                        |

Each PNG is 1920 x 1280, antialiased, rendered with "Architectural
Design Style" when available and shadows enabled at 14:00 local time on
21 June (steep, dramatic shadow cast).

## UI affordances

1. **Thumbnail dock** — a horizontal Apple-style dock under the main
   image with up to six 64x40 thumbnails. Click to switch. Active
   thumbnail gets the `forest` accent border.
2. **Orbit slider** — a thin horizontal slider that cycles the four iso
   corners in clockwise order (NE -> SE -> SW -> NW -> NE). Dragging
   updates a continuous value; on release the slider snaps to the
   nearest iso angle. The slider is intentionally coarse : it is a
   *suggestion* of orbiting, not an actual rotation.
3. **Top view / Eye level buttons** — pinned to the top-right of the
   chrome, always one click away from a bird-eye or a human-scale shot.
4. **Cross-fade transition** — Framer Motion `AnimatePresence` with
   `mode="wait"` swaps images in 200 ms on the `out-gentle` curve.
5. **Cursor parallax** — on iso angles only, a `useMotionValue` +
   `useSpring` pair maps cursor position to a +/- 10 px translateX and
   +/- 6 px translateY on the main image. The spring is intentionally
   damped (stiffness 120, damping 18) so the motion reads as
   "living screenshot", not "wobbly image".

## Parallax : the illusion

The parallax window is small on purpose. At +/- 10 px on a 1600 px-wide
container, the apparent angular offset is well under 1 deg. That is
enough for the viewer's peripheral vision to register "the image is not
static" without creating the uncanny impression that the geometry is
deforming. Combined with the orbit slider and the hard switches between
iso angles, the user reads the experience as "I am orbiting a
low-sample 3D model" rather than "I am looking at six JPEGs".

## Graceful degradation

- `sources` with 0 entries -> muted placeholder, no chrome buttons.
- `sources` with 1 entry -> single static image, no dock, no slider, no
  parallax.
- `sources` with 2-5 entries -> dock shows whatever is present; the
  orbit slider is hidden if fewer than two iso angles are available.
- Any unknown angle key is silently ignored.

## Limitations (important)

- **No true rotation** — only six fixed angles. Anything outside the
  captured set is unreachable.
- **No zoom or pan** — the image is `object-cover` at `aspect-[16/10]`.
- **No live geometry updates** — iterating a variant requires a
  fresh capture pass to refresh the PNGs.
- **No VR / stereo** — pseudo-3D is a monocular illusion, not a real
  scene graph.

For a real 3D viewer, see `docs/FUTURE_WORK.md` (section
"Real 3D via Three.js").

## Regenerating captures

```bash
cd backend
python scripts/capture_variant_angles.py
```

The script probes SketchUp MCP on `127.0.0.1:9876`. If unreachable, it
prints the BLOCKERS.md reference and exits 0 (non-fatal for CI). If
reachable, it replays each variant's `sketchup_trace` into a clean
SketchUp model and writes 18 PNGs (3 variants x 6 angles) into
`backend/tests/fixtures/`, plus a mirrored copy into
`frontend/public/sketchup/` so the Vite dev server can serve them at
`/sketchup/...`. The existing single-iso alias
`sketchup_variant_<style>.png` is rewritten to point at the fresh
`iso_ne` capture, so any consumer of the old asset keeps working.
