import { useEffect } from "react";
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

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
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
    </div>
  );
}
