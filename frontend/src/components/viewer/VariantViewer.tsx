import { useState } from "react";

import PanZoom from "./PanZoom";
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
  const activeView = hasScreenshot ? view : "2d";
  const isLive = Boolean(liveScreenshotUrl);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-label text-ink-muted">
          {activeView === "3d" ? "SketchUp · iso" : "Plan · 2D"}
          {isLive && activeView === "3d" && (
            <span className="ml-3 text-forest">· live</span>
          )}
        </span>
        {hasScreenshot && (
          <div className="inline-flex items-center gap-1 rounded-md border border-hairline bg-canvas p-0.5">
            <button
              onClick={() => setView("3d")}
              className={[
                "rounded-[4px] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-label transition-colors",
                activeView === "3d"
                  ? "bg-forest text-raised"
                  : "text-ink-soft hover:text-ink",
              ].join(" ")}
            >
              3D
            </button>
            <button
              onClick={() => setView("2d")}
              className={[
                "rounded-[4px] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-label transition-colors",
                activeView === "2d"
                  ? "bg-forest text-raised"
                  : "text-ink-soft hover:text-ink",
              ].join(" ")}
            >
              2D
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-hidden bg-canvas">
        {activeView === "3d" && activeSrc ? (
          // iter-20f : wrap the 3D iso in PanZoom too — clients often
          // want to zoom into a specific zone of the render.
          <PanZoom>
            <img
              src={activeSrc}
              alt={`SketchUp iso render of the ${style} variant`}
              className="h-full w-full object-contain"
              draggable={false}
            />
          </PanZoom>
        ) : plan ? (
          // iter-20f (Saad #13) : wrap the plan in PanZoom so wheel
          // zoom + drag pan work. Previously wheel events scrolled the
          // host page because nothing captured them.
          <PanZoom className="p-6">
            <PlanSvg plan={plan} highlightedVariant={style} zones={zones} />
          </PanZoom>
        ) : (
          <div className="grid h-full place-items-center">
            <p className="font-mono text-[11px] uppercase tracking-label text-ink-muted">
              Loading plan…
            </p>
          </div>
        )}
      </div>
      {activeView === "3d" && hasScreenshot && (
        <p className="border-t border-hairline px-4 py-2 font-mono text-[10px] text-ink-muted">
          {isLive
            ? "Live SketchUp render — captured after the last iteration."
            : "Baseline SketchUp render — captured against SU_MCP v1.5.0."}
        </p>
      )}
    </div>
  );
}
