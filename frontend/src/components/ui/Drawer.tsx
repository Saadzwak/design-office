import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Drawer width in px. Bundle default 460 ; zone drawer uses 520. */
  width?: number;
  /** Respect `prefers-reduced-motion` — on when true. */
  respectReducedMotion?: boolean;
  ariaLabel?: string;
};

/**
 * Right-edge drawer with backdrop blur + transform-X slide. Closes on
 * backdrop click or Escape. Bundle parity : `components.jsx#Drawer`.
 *
 * Body-scroll lock kicks in while the drawer is open so the floor
 * plan under the mood-board / zone drill doesn't scroll under the hood.
 *
 * Iter-31 (Bug 2) — rendered through `createPortal(..., document.body)`.
 * The product's `<main>` carries `animate-fade-rise` whose final
 * keyframe leaves a `transform: translateY(0)` that makes `<main>` the
 * containing block for any descendant `position: fixed` element. That
 * mis-anchored the drawer 149px below the viewport top and made the
 * bottom 298px scroll off-screen — looked like a scroll bug to the
 * user. Portaling to `document.body` puts the drawer outside the
 * transformed ancestor so `inset-y-0` resolves against the viewport
 * again.
 */
export default function Drawer({
  open,
  onClose,
  children,
  width = 460,
  respectReducedMotion: _respectReducedMotion = true,
  ariaLabel,
}: Props) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while open — preserve scroll position on close.
  //
  // Iter-33 follow-up v3 (Saad bug report) : the previous version just
  // toggled `body.style.overflow = 'hidden'` on open and restored it on
  // close. That kept the page from scrolling under the drawer, but
  // when Chrome on Windows closed the drawer the visible scroll
  // position dropped back to the top — so after browsing card #1, the
  // user had to re-scroll to reach card #2.
  //
  // The standard fix (used by Headless UI, Radix, Reakit) :
  // 1. Capture `window.scrollY` before locking.
  // 2. Pin the body to `position:fixed; top:-scrollY; width:100%`. The
  //    page now visually stays where it was AND can't scroll.
  // 3. On close, undo all four properties AND `window.scrollTo(0,
  //    scrollY)` so the browser re-anchors at the previous offset.
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    return () => {
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      // Restore the visible offset Chrome lost while body was fixed.
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  // SSR-safe : `document` is undefined during server render. The route
  // shell never renders Drawer on the server, but guard anyway in
  // case a future static-pre-render pass touches it.
  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden
        className="fixed inset-0 z-[80] transition-opacity duration-[240ms] ease-out-gentle"
        style={{
          background: "rgba(250, 247, 242, 0.55)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
      />
      {/* Panel. Iter-20c (Saad #5, #18) : children use `flex-1 min-h-0
          overflow-y-auto` now, so the panel itself must give them a
          real flex context to shrink against. `min-h-0` on the aside
          is the piece that lets the inner scroll kick in. */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? "Drawer"}
        className="fixed inset-y-0 right-0 z-[90] flex min-h-0 flex-col overflow-hidden bg-canvas"
        style={{
          width,
          borderLeft: "1px solid var(--mist-200)",
          boxShadow: "var(--sh-drawer, -24px 0 48px rgba(28, 31, 26, 0.08))",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 360ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {children}
      </aside>
    </>,
    document.body,
  );
}
