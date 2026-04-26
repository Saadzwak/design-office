import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Max-width in px. Default 560. */
  width?: number;
  ariaLabel?: string;
};

/**
 * Modal — centre-screen panel with backdrop blur. Escape-close +
 * backdrop-click-close + body-scroll lock. Use for short forms ;
 * for drawer-style content prefer `Drawer`.
 *
 * Iter-31 (Bug 2) — rendered through `createPortal(..., document.body)`
 * for the same reason as `Drawer`: the product's `<main>` carries an
 * `animate-fade-rise` keyframe whose final `transform: translateY(0)`
 * value makes it the containing block for descendant `position: fixed`
 * elements. That pushed the New-Project modal 147px below the viewport
 * top so its bottom 562px (Create button included) was off-screen with
 * no way to scroll. Portaling escapes the transformed ancestor.
 */
export default function Modal({
  open,
  onClose,
  children,
  width = 560,
  ariaLabel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Iter-33 follow-up v3 — scroll-lock that preserves position. Same
  // fix as Drawer.tsx ; see that comment for the rationale.
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
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-6"
      style={{
        background: "rgba(250, 247, 242, 0.55)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        animation: "fade-rise 220ms var(--ease)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? "Dialog"}
    >
      <div
        className="relative w-full overflow-hidden rounded-2xl border border-mist-200 bg-canvas shadow-hero"
        style={{ maxWidth: width, maxHeight: "calc(100vh - 48px)" }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
