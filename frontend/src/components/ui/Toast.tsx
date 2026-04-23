import { useEffect, useState } from "react";

const CHANNEL = "design-office:toast";
const AUTO_HIDE_MS = 2800;

type ToastPayload = { kind: "success" | "info" | "error"; message: string };

/**
 * Tiny toast infrastructure. Anywhere in the app, call `toast(message)`
 * and a bottom-centred pill fades in for ~3 s. `<ToastHost />` must
 * be mounted once at the app root (App.tsx) — it listens for custom
 * events and renders the queue.
 */
export function toast(message: string, kind: ToastPayload["kind"] = "success") {
  window.dispatchEvent(
    new CustomEvent<ToastPayload>(CHANNEL, { detail: { kind, message } }),
  );
}

export default function ToastHost() {
  const [current, setCurrent] = useState<ToastPayload | null>(null);

  useEffect(() => {
    const onEvent = (e: Event) => {
      const custom = e as CustomEvent<ToastPayload>;
      if (!custom.detail) return;
      setCurrent(custom.detail);
      const t = setTimeout(() => setCurrent(null), AUTO_HIDE_MS);
      return () => clearTimeout(t);
    };
    window.addEventListener(CHANNEL, onEvent as EventListener);
    return () => window.removeEventListener(CHANNEL, onEvent as EventListener);
  }, []);

  if (!current) return null;

  const tint =
    current.kind === "error"
      ? "var(--clay)"
      : current.kind === "info"
        ? "var(--mist-500)"
        : "var(--mint)";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-8 left-1/2 z-[100] -translate-x-1/2 animate-fade-rise"
    >
      <div
        className="flex items-center gap-2.5 rounded-full border border-mist-200 px-5 py-2.5 shadow-lift"
        style={{ background: "var(--canvas)" }}
      >
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: tint }}
        />
        <span className="text-[13px] text-ink">{current.message}</span>
      </div>
    </div>
  );
}
