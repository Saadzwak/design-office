/**
 * PseudoThreeDViewer — a 6-angle "pseudo-3D" viewer.
 *
 * NOT a real 3D engine. It displays one of 6 pre-captured SketchUp PNGs
 * (4 iso corners + top-down + eye-level) at a time and provides :
 *
 *  - A thumbnail dock for direct angle selection (Apple-style)
 *  - A horizontal "orbit" slider that cycles the 4 iso corners
 *  - A subtle cursor-driven parallax offset on the main image
 *  - Cross-fade transitions between angles (Framer Motion)
 *  - Dedicated "Top view" / "Eye level" buttons in the chrome
 *
 * If fewer than 2 sources are provided, the component collapses to a
 * single static image with no controls. If zero sources are provided, it
 * renders a muted placeholder.
 *
 * See `docs/PSEUDO_3D_VIEWER.md` for the design rationale, and
 * `backend/scripts/capture_variant_angles.py` for the capture pipeline.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";

export type Angle =
  | "iso_ne"
  | "iso_nw"
  | "iso_se"
  | "iso_sw"
  | "top_down"
  | "eye_level";

type Props = {
  /**
   * Source PNGs keyed by angle. Missing keys are OK — the component
   * degrades gracefully to whatever is provided.
   */
  sources: Partial<Record<Angle, string>>;
  /** Optional caption shown in the chrome (e.g. "Atelier · live render"). */
  caption?: string;
};

const ANGLE_LABELS: Record<Angle, string> = {
  iso_ne: "NE",
  iso_nw: "NW",
  iso_se: "SE",
  iso_sw: "SW",
  top_down: "Top",
  eye_level: "Eye",
};

// Orbit order for the horizontal slider : clockwise from NE.
const ORBIT_ORDER: Angle[] = ["iso_ne", "iso_se", "iso_sw", "iso_nw"];

export default function PseudoThreeDViewer({ sources, caption }: Props) {
  const availableAngles = useMemo<Angle[]>(() => {
    const all: Angle[] = [
      "iso_ne",
      "iso_nw",
      "iso_se",
      "iso_sw",
      "top_down",
      "eye_level",
    ];
    return all.filter((a) => typeof sources[a] === "string" && sources[a]);
  }, [sources]);

  const orbitAvailable = useMemo<Angle[]>(
    () => ORBIT_ORDER.filter((a) => availableAngles.includes(a)),
    [availableAngles],
  );

  const initialAngle: Angle | null =
    availableAngles.find((a) => a === "iso_ne") ?? availableAngles[0] ?? null;

  const [active, setActive] = useState<Angle | null>(initialAngle);

  // Re-anchor to a valid source if the props change.
  useEffect(() => {
    if (!active || !sources[active]) {
      setActive(initialAngle);
    }
  }, [sources, active, initialAngle]);

  // Parallax motion values (mouse X/Y normalised to -1..+1).
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 120, damping: 18, mass: 0.5 });
  const sy = useSpring(my, { stiffness: 120, damping: 18, mass: 0.5 });
  const translateX = useTransform(sx, [-1, 1], [-10, 10]);
  const translateY = useTransform(sy, [-1, 1], [-6, 6]);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    const nx = ((e.clientX - box.left) / box.width) * 2 - 1;
    const ny = ((e.clientY - box.top) / box.height) * 2 - 1;
    mx.set(Math.max(-1, Math.min(1, nx)));
    my.set(Math.max(-1, Math.min(1, ny)));
  };

  const handlePointerLeave = () => {
    mx.set(0);
    my.set(0);
  };

  // Orbit slider state — index into ORBIT_ORDER (0..3). Continuous while
  // dragging, snapped to nearest iso on release.
  const orbitIndex = orbitAvailable.findIndex((a) => a === active);
  const [sliderValue, setSliderValue] = useState<number>(
    orbitIndex >= 0 ? orbitIndex : 0,
  );

  useEffect(() => {
    // Keep slider in sync with active angle when it changes from other inputs.
    if (active && orbitAvailable.includes(active)) {
      const idx = orbitAvailable.indexOf(active);
      if (idx >= 0) setSliderValue(idx);
    }
  }, [active, orbitAvailable]);

  const onSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setSliderValue(v);
  };

  const onSliderRelease = () => {
    if (orbitAvailable.length === 0) return;
    const snapped = Math.round(sliderValue) % orbitAvailable.length;
    const next = orbitAvailable[Math.max(0, snapped)];
    if (next) setActive(next);
  };

  // Empty state.
  if (availableAngles.length === 0 || !active) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
            Pseudo-3D · no render
          </span>
        </div>
        <div className="grid flex-1 place-items-center bg-canvas">
          <p className="font-mono text-[11px] uppercase tracking-label text-ink-muted">
            No render available for this variant.
          </p>
        </div>
      </div>
    );
  }

  // Single-source degraded mode : no dock, no slider, no parallax.
  if (availableAngles.length < 2) {
    const src = sources[active];
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
            {caption ?? "Pseudo-3D · single angle"}
          </span>
        </div>
        <div className="flex-1 overflow-hidden bg-canvas">
          {src ? (
            <img
              src={src}
              alt="SketchUp variant render"
              className="h-full w-full object-contain"
            />
          ) : null}
        </div>
      </div>
    );
  }

  const activeSrc = sources[active];
  const isIso = active.startsWith("iso_");

  return (
    <div className="flex h-full flex-col">
      {/* Chrome */}
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
          {caption ?? "Pseudo-3D · 6 angles"}
        </span>
        <div className="inline-flex items-center gap-1 rounded-md border border-hairline bg-canvas p-0.5">
          <button
            type="button"
            onClick={() =>
              sources.top_down ? setActive("top_down") : undefined
            }
            disabled={!sources.top_down}
            className={[
              "rounded-[4px] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-label transition-colors",
              active === "top_down"
                ? "bg-forest text-raised"
                : "text-ink-soft hover:text-ink disabled:opacity-40 disabled:hover:text-ink-soft",
            ].join(" ")}
            title="Top-down plan view"
          >
            Top view
          </button>
          <button
            type="button"
            onClick={() =>
              sources.eye_level ? setActive("eye_level") : undefined
            }
            disabled={!sources.eye_level}
            className={[
              "rounded-[4px] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-label transition-colors",
              active === "eye_level"
                ? "bg-forest text-raised"
                : "text-ink-soft hover:text-ink disabled:opacity-40 disabled:hover:text-ink-soft",
            ].join(" ")}
            title="Eye-level human-scale view"
          >
            Eye level
          </button>
        </div>
      </div>

      {/* Main image with parallax */}
      <div
        ref={containerRef}
        onPointerMove={isIso ? handlePointerMove : undefined}
        onPointerLeave={handlePointerLeave}
        className="relative flex-1 overflow-hidden bg-canvas"
      >
        <div className="relative mx-auto h-full w-full max-w-[1600px] p-3">
          <div className="relative aspect-[16/10] h-auto w-full overflow-hidden rounded-lg bg-mist-50 shadow-soft">
            <AnimatePresence mode="wait">
              <motion.img
                key={active}
                src={activeSrc}
                alt={`SketchUp variant render · ${ANGLE_LABELS[active]}`}
                className="absolute inset-0 h-full w-full select-none object-cover"
                draggable={false}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 0.2,
                  ease: [0.22, 1, 0.36, 1],
                }}
                style={
                  isIso
                    ? { x: translateX, y: translateY }
                    : undefined
                }
              />
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Thumbnail dock + orbit slider */}
      <div className="border-t border-hairline px-4 py-3">
        <div className="flex items-center justify-center gap-2">
          {availableAngles.map((a) => {
            const src = sources[a];
            if (!src) return null;
            const selected = a === active;
            return (
              <button
                key={a}
                type="button"
                onClick={() => setActive(a)}
                className={[
                  "group relative overflow-hidden rounded-md border transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  selected
                    ? "border-forest shadow-soft"
                    : "border-hairline opacity-75 hover:opacity-100 hover:border-mist-300",
                ].join(" ")}
                title={`Switch to ${ANGLE_LABELS[a]} view`}
                style={{ width: 64, height: 40 }}
              >
                <img
                  src={src}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
                <span
                  className={[
                    "absolute bottom-0 left-0 right-0 bg-ink/70 py-[1px] text-center font-mono text-[8px] uppercase tracking-label",
                    selected ? "text-raised" : "text-raised/90",
                  ].join(" ")}
                >
                  {ANGLE_LABELS[a]}
                </span>
              </button>
            );
          })}
        </div>

        {orbitAvailable.length >= 2 && (
          <div className="mt-3 flex items-center gap-3">
            <span className="font-mono text-[9px] uppercase tracking-label text-ink-muted">
              Orbit
            </span>
            <input
              type="range"
              min={0}
              max={orbitAvailable.length - 1}
              step={0.01}
              value={sliderValue}
              onChange={onSliderChange}
              onMouseUp={onSliderRelease}
              onTouchEnd={onSliderRelease}
              onKeyUp={onSliderRelease}
              className="h-[2px] flex-1 cursor-pointer appearance-none rounded-full bg-hairline accent-forest"
              aria-label="Orbit iso angles"
            />
            <span className="min-w-[32px] text-right font-mono text-[9px] uppercase tracking-label text-ink-muted">
              {orbitAvailable[Math.round(sliderValue) % orbitAvailable.length]
                ? ANGLE_LABELS[
                    orbitAvailable[
                      Math.round(sliderValue) % orbitAvailable.length
                    ] as Angle
                  ]
                : "—"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
