/**
 * VariantZoomModal — zoomed-but-not-fullscreen viewer for a single
 * variant, opened from a click on the variant card's image / viewer.
 *
 * iter-25 (Saad, 2026-04-25). Design :
 *  - Scrim : canvas #FAF7F2 @ 75 % opacity + backdrop-blur(6px).
 *  - Panel : 65 vw (max 900 px), max-height 70 vh, padding 32,
 *    rounded-xl, shadow-xl, canvas background. Centered.
 *  - Header : variant name in italic Fraunces (forest), close ✕
 *    top-right.
 *  - Body : full PseudoThreeDViewer if the variant is active AND has
 *    ≥2 angle sources ; single `<img>` otherwise (spec §4–§5).
 *  - Footer : one-line Mono metrics (Desks / m²-FTE / Flex / Adj.).
 *  - Close triggers : Escape key, scrim click. Click inside the
 *    panel (image, viewer, metrics) does NOT close.
 *  - Body scroll is locked while the modal is open.
 *  - Animations : Framer Motion scale 0.95 → 1 + opacity, 200 ms
 *    ease-out on open, 150 ms on close.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

import type { DesignVariant } from "../../lib/adapters/variantAdapter";
import PseudoThreeDViewer from "./PseudoThreeDViewer";

type Props = {
  /** The variant to zoom on ; `null` closes the modal. */
  variant: DesignVariant | null;
  /** URL already resolved by the parent (live → backend → Lumen → null).
   *  Used only when the variant has no multi-angle dock (inactive card). */
  imgUrl: string | null;
  /** Whether this variant is the active one on the grid. Active +
   *  ≥2 angle sources = full PseudoThreeDViewer ; else single image. */
  isActive: boolean;
  onClose: () => void;
};

export default function VariantZoomModal({
  variant,
  imgUrl,
  isActive,
  onClose,
}: Props) {
  // Escape-to-close.
  useEffect(() => {
    if (!variant) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant, onClose]);

  // Body scroll lock.
  useEffect(() => {
    if (!variant) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [variant]);

  const angleSources = variant?.raw.sketchup_shot_urls ?? {};
  const hasMultiAngle =
    Object.values(angleSources).filter((v) => typeof v === "string" && v).length >= 2;
  const showViewer = isActive && hasMultiAngle;

  // Iter-32 (Saad fix 1) : portaled to `document.body` for the same
  // reason as the canonical `Drawer` + `Modal` (iter-31 fix). The
  // product's `<main>` carries `animate-fade-rise` whose final
  // keyframe leaves a `transform: translateY(0)` value that turns
  // `<main>` into the containing block for descendant
  // `position: fixed` elements. Without portal, the scrim's
  // `inset-0` resolves against `<main>` (top=149px in 720vp) and
  // the modal panel sits partially below the viewport with no way
  // to scroll. Portal escapes the transformed ancestor so
  // `inset-0` is viewport-relative again.
  if (typeof document === "undefined") return null;

  const node = (
    <AnimatePresence>
      {variant ? (
        <motion.div
          key="variant-zoom-scrim"
          data-testid="variant-zoom-scrim"
          role="dialog"
          aria-modal="true"
          aria-label={`${variant.name} zoom`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          style={{
            background: "rgba(250, 247, 242, 0.75)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            key="variant-zoom-panel"
            data-testid="variant-zoom-panel"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative flex flex-col rounded-xl border border-mist-200 shadow-xl"
            style={{
              width: "65vw",
              maxWidth: 900,
              maxHeight: "85vh",
              background: "#FAF7F2",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button — sticky to the panel, not the scroller */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              data-testid="variant-zoom-close"
              className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-mist-200 bg-canvas text-mist-600 transition-colors hover:bg-mist-100 hover:text-ink"
            >
              <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>
                ✕
              </span>
            </button>

            {/* Inner scroller. Iter-32: panel is now flex-col with the
                content wrapped in a single `min-h-0 flex-1
                overflow-y-auto` div so when the 6-angle
                PseudoThreeDViewer + image dock + metrics exceed the
                85vh max-height, the content scrolls inside the panel
                instead of vanishing below the viewport. */}
            <div
              className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"
              style={{ padding: 32 }}
            >
              {/* Variant name header */}
              <div className="mb-4 pr-10">
                <span
                  className="font-display italic"
                  style={{
                    fontSize: 26,
                    fontWeight: 500,
                    color: "var(--forest)",
                    fontVariationSettings: '"opsz" 96, "wght" 500, "SOFT" 100',
                  }}
                >
                  {variant.name}
                </span>
              </div>

              {/* Render area — letterboxed canvas backdrop so non-
                  16:9 images don't touch the panel edges. The
                  PseudoThreeDViewer dock + caption can grow tall
                  with 6 angles, so we let it size naturally and
                  rely on the parent scroller. */}
              <div
                className="relative rounded-lg border border-mist-100"
                style={{
                  background: "var(--canvas-alt, #F5F2EB)",
                  minHeight: 0,
                }}
              >
                {showViewer ? (
                  <PseudoThreeDViewer
                    sources={angleSources}
                    caption={`${variant.name} · live render`}
                  />
                ) : imgUrl ? (
                  <img
                    src={imgUrl}
                    alt={`${variant.name} SketchUp iso render`}
                    className="block w-full object-contain"
                    style={{ maxHeight: "60vh" }}
                  />
                ) : (
                  <div className="flex items-center justify-center py-12">
                    <span className="mono text-[11px] tracking-[0.14em] text-mist-500">
                      No render available
                    </span>
                  </div>
                )}
              </div>

              {/* Metrics */}
              <div className="mt-4 flex flex-wrap gap-6 border-t border-mist-100 pt-3 font-mono text-[12px] tracking-tight text-ink">
                <span>
                  <span className="text-mist-500">Desks </span>
                  {variant.metrics.desks}
                </span>
                <span>
                  <span className="text-mist-500">m²/FTE </span>
                  {variant.metrics.density}
                </span>
                <span>
                  <span className="text-mist-500">Flex </span>
                  {variant.metrics.flex}
                </span>
                <span>
                  <span className="text-mist-500">Adj. </span>
                  {variant.metrics.adjacency}
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return createPortal(node, document.body);
}
