import { useState } from "react";

import PlanSvg from "./PlanSvg";
import type { FloorPlan, VariantOutput } from "../../lib/api";

type VariantStyle = "villageois" | "atelier" | "hybride_flex";

// Vite serves `frontend/public/` at the site root. The 3 Lumen screenshots
// captured during the live SketchUp round-trip are persisted there so the
// frontend can show the real 3D iso view without talking to SketchUp.
const SKETCHUP_SCREENSHOTS: Record<VariantStyle, string> = {
  villageois: "/sketchup/sketchup_variant_villageois.png",
  atelier: "/sketchup/sketchup_variant_atelier.png",
  hybride_flex: "/sketchup/sketchup_variant_hybride_flex.png",
};

type Zone = {
  kind: string;
  bbox_mm?: [number, number, number, number];
  origin_mm?: [number, number];
  position_mm?: [number, number];
  corner1_mm?: [number, number];
  corner2_mm?: [number, number];
};

type Props = {
  plan: FloorPlan | null;
  variant: VariantOutput | null;
  style: VariantStyle | null;
  zones: Zone[];
  /** Default view when both 2D + 3D are available. */
  defaultView?: "2d" | "3d";
  /** Optional live SketchUp screenshot URL captured after an iterate call.
   *  Overrides the static bundled baseline for the active style. */
  liveScreenshotUrl?: string | null;
};

export default function VariantViewer({
  plan,
  variant: _variant,
  style,
  zones,
  defaultView = "3d",
  liveScreenshotUrl,
}: Props) {
  const bundled = style !== null ? SKETCHUP_SCREENSHOTS[style] : undefined;
  const activeSrc = liveScreenshotUrl || bundled;
  const hasScreenshot = Boolean(activeSrc);
  const [view, setView] = useState<"2d" | "3d">(hasScreenshot ? defaultView : "2d");
  // When the style changes, reset to the preferred view if the screenshot is available.
  const activeView = hasScreenshot ? view : "2d";
  const isLive = Boolean(liveScreenshotUrl);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
          {activeView === "3d" ? "SketchUp iso" : "Plan 2D"}
        </span>
        {hasScreenshot && (
          <div className="inline-flex rounded-lg border border-neutral-500/30 bg-neutral-900/50 p-0.5 text-[11px]">
            <button
              onClick={() => setView("3d")}
              className={[
                "rounded-md px-2 py-0.5 font-mono uppercase tracking-widest transition-colors",
                activeView === "3d"
                  ? "bg-terracotta/80 text-ink"
                  : "text-neutral-300 hover:text-bone-text",
              ].join(" ")}
            >
              3D
            </button>
            <button
              onClick={() => setView("2d")}
              className={[
                "rounded-md px-2 py-0.5 font-mono uppercase tracking-widest transition-colors",
                activeView === "2d"
                  ? "bg-terracotta/80 text-ink"
                  : "text-neutral-300 hover:text-bone-text",
              ].join(" ")}
            >
              2D
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-hidden rounded-xl border border-neutral-500/20 bg-neutral-900/60">
        {activeView === "3d" && activeSrc ? (
          <img
            src={activeSrc}
            alt={`SketchUp iso render of the ${style} variant`}
            className="h-full w-full object-contain"
          />
        ) : plan ? (
          <div className="h-full w-full p-2">
            <PlanSvg plan={plan} highlightedVariant={style} zones={zones} />
          </div>
        ) : (
          <div className="grid h-full place-items-center text-sm text-neutral-400">
            Loading plan…
          </div>
        )}
      </div>
      {activeView === "3d" && hasScreenshot && (
        <p className="mt-2 font-mono text-[10px] text-neutral-500">
          {isLive
            ? "Live SketchUp render · captured after the last iteration."
            : "Baseline SketchUp render · captured during the Lumen round-trip against SU_MCP v1.5.0."}
        </p>
      )}
    </div>
  );
}
