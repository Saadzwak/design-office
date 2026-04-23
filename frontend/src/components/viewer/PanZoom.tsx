/**
 * PanZoom — minimal wheel-to-zoom + drag-to-pan wrapper (iter-20f, Saad #13).
 *
 * Root cause of the bug: `VariantViewer` embedded `PlanSvg` directly so
 * the browser had nothing to zoom — wheel events just scrolled the page.
 * This component keeps a `{scale, tx, ty}` transform in state and exposes
 * a scrollable viewport that:
 *
 * - zooms on mouse-wheel (Ctrl-less), keeping the cursor as the focal
 *   point so the geometry doesn't run away under the pointer,
 * - pans on click+drag (or middle-click drag), cursor becomes `grabbing`,
 * - pinch-zooms via ctrl+wheel (trackpads), because the browser emits
 *   ctrlKey=true on pinches on macOS / Windows alike,
 * - offers a small toolbar (−, 100%, +) in the corner so the user has an
 *   explicit reset even when wheel is captured by a parent scroller.
 *
 * Kept deliberately framework-free — no Framer Motion, no lib. The
 * transform is CSS (`translate + scale`), so it's GPU-accelerated and
 * cheap even on the full-plate SVG.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  children: React.ReactNode;
  minScale?: number;
  maxScale?: number;
  /** Optional className merged onto the outer viewport. */
  className?: string;
};

const ZOOM_STEP = 1.15; // ~15 % per wheel tick, matches CAD tools

export default function PanZoom({
  children,
  minScale = 0.4,
  maxScale = 8,
  className = "",
}: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );

  const clamp = useCallback(
    (s: number) => Math.max(minScale, Math.min(maxScale, s)),
    [minScale, maxScale],
  );

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const zoomAtPoint = useCallback(
    (targetScale: number, cx: number, cy: number) => {
      setScale((prev) => {
        const next = clamp(targetScale);
        if (next === prev) return prev;
        // Keep the point (cx, cy) stable under the new scale. The
        // transform is `translate(offset) scale(scale)` applied from
        // the stage's top-left, so the post-scale shift is:
        //   offset' = cursor - (cursor - offset) * (next / prev)
        const ratio = next / prev;
        setOffset((o) => ({
          x: cx - (cx - o.x) * ratio,
          y: cy - (cy - o.y) * ratio,
        }));
        return next;
      });
    },
    [clamp],
  );

  // Native wheel listener so we can call preventDefault (React's synthetic
  // wheel is passive on modern Chrome / Firefox and can't block the page
  // scroll otherwise).
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      zoomAtPoint(scale * factor, cx, cy);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [scale, zoomAtPoint]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    setDragging(true);
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      ox: offset.x,
      oy: offset.y,
    };
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return;
      setOffset({
        x: drag.current.ox + (e.clientX - drag.current.x),
        y: drag.current.oy + (e.clientY - drag.current.y),
      });
    };
    const onUp = () => {
      setDragging(false);
      drag.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  const stepZoom = (factor: number) => {
    const el = wrapperRef.current;
    if (!el) {
      setScale((s) => clamp(s * factor));
      return;
    }
    const rect = el.getBoundingClientRect();
    zoomAtPoint(scale * factor, rect.width / 2, rect.height / 2);
  };

  return (
    <div
      ref={wrapperRef}
      onMouseDown={onMouseDown}
      className={`relative h-full w-full select-none overflow-hidden ${className}`}
      style={{ cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
    >
      <div
        ref={stageRef}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: "0 0",
          willChange: "transform",
          height: "100%",
          width: "100%",
        }}
      >
        {children}
      </div>
      <div
        className="pointer-events-auto absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-md border border-hairline bg-canvas/90 p-0.5 backdrop-blur"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => stepZoom(1 / ZOOM_STEP)}
          className="rounded-[4px] px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-ink-soft hover:text-ink"
          aria-label="Zoom out"
          type="button"
        >
          −
        </button>
        <button
          onClick={reset}
          className="rounded-[4px] px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-ink-soft hover:text-ink"
          aria-label="Reset zoom"
          type="button"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          onClick={() => stepZoom(ZOOM_STEP)}
          className="rounded-[4px] px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-ink-soft hover:text-ink"
          aria-label="Zoom in"
          type="button"
        >
          +
        </button>
      </div>
    </div>
  );
}
