import { useEffect, useState } from "react";

/**
 * Reactive map of variant style → live SketchUp iso URL. Written by
 * /testfit on a successful iterate, read by /testfit / /justify / /export
 * so the fresh post-iterate render appears everywhere the retained variant
 * is displayed.
 *
 * Storage key : `design-office.testfit.live_screenshots`.
 */
export function useLiveScreenshots(): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>(() => read());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === "design-office.testfit.live_screenshots") {
        setMap(read());
      }
    };
    window.addEventListener("storage", onStorage);
    // Also poll on focus + a 2 s interval for same-tab updates (storage
    // events don't fire in the tab that wrote the value).
    const onFocus = () => setMap(read());
    window.addEventListener("focus", onFocus);
    const id = window.setInterval(onFocus, 2_000);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(id);
    };
  }, []);

  return map;
}

function read(): Record<string, string> {
  try {
    const raw = localStorage.getItem("design-office.testfit.live_screenshots");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}
