/**
 * Dashboard summary adapter — turn the live project_state v2 into the
 * per-surface summary the ProjectCard + ProjectDetail use.
 *
 * The active project in `project_state.v2` carries append-only run
 * arrays (macro / micro / moodboard / justify / export). The dashboard
 * needs a compact roll-up per surface : one state, one updatedAt, one
 * short note. This module condenses them.
 */

import type { ProjectState } from "../projectState";
import type { SurfaceKey, SurfaceState, SurfaceSummary } from "./projectsIndex";

function relative(ts: string | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const diffMs = Date.now() - d.getTime();
  const h = Math.floor(diffMs / 3_600_000);
  if (h < 1) return `today · ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  if (h < 6) return `${h}h ago`;
  if (h < 24) return `today · ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  const days = Math.floor(h / 24);
  if (days < 2) return `yesterday · ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  if (days < 7) return `${days}d ago`;
  if (days < 31) return `${Math.floor(days / 7)}w ago`;
  return d.toISOString().slice(0, 10);
}

function summarise(
  runs: number,
  latestNote: string,
  latestTs: string | undefined,
  activeHint: boolean,
): SurfaceSummary {
  if (runs === 0) {
    return { state: "pending", updatedAt: "—", note: "Not started" };
  }
  return {
    state: activeHint ? "active" : "done",
    updatedAt: relative(latestTs),
    note: latestNote,
  };
}

export function briefSummary(project: ProjectState): SurfaceSummary {
  const hasProg = !!project.programme.markdown?.trim();
  if (!hasProg) return { state: "pending", updatedAt: "—", note: "Not started" };
  const hc = project.programme.headcount ?? null;
  const tgt = project.programme.growth_target ?? null;
  const note =
    hc && tgt
      ? `${hc} → ${tgt} FTE · programme synthesised`
      : "Programme synthesised";
  return { state: "done", updatedAt: relative(undefined), note };
}

export function testFitSummary(project: ProjectState): SurfaceSummary {
  const runs = project.macro_zoning_runs.length;
  const latest = project.macro_zoning_runs.at(-1);
  if (!latest) return { state: "pending", updatedAt: "—", note: "Not started" };
  const retained = latest.retained_style;
  const variants = latest.variants.length;
  const note = retained
    ? `${retained.replace("_", " ")} retained · ${latest.variants.find((v) => v.style === retained)?.metrics.workstation_count ?? "?"} desks`
    : `${variants} variants · choose one`;
  return summarise(runs, note, latest.timestamp, !retained);
}

export function moodBoardSummary(project: ProjectState): SurfaceSummary {
  const runs = project.moodboard_runs.length;
  const latest = project.moodboard_runs.at(-1);
  if (!latest) return { state: "pending", updatedAt: "—", note: "Not started" };
  const tiles = latest.palette.length;
  const parts: string[] = [];
  if (latest.parent_variant_style) {
    parts.push(`${latest.parent_variant_style.replace("_", " ")}`);
  }
  parts.push(`${tiles} swatch${tiles === 1 ? "" : "es"}`);
  if (latest.visual_image_id) parts.push("visual");
  return summarise(runs, parts.join(" · "), latest.timestamp, false);
}

export function justifySummary(project: ProjectState): SurfaceSummary {
  const runs = project.justify_runs.length;
  const latest = project.justify_runs.at(-1);
  if (!latest) return { state: "pending", updatedAt: "—", note: "Not started" };
  const lines = latest.argumentaire_markdown.split("\n").filter((l) => l.trim());
  const headers = lines.filter((l) => /^##\s/.test(l)).length;
  const note =
    latest.pdf_id && latest.pptx_id
      ? `${headers} sections · PDF + PPTX ready`
      : latest.pdf_id || latest.pptx_id
        ? `${headers} sections · draft ready`
        : `${headers} sections drafted`;
  return summarise(runs, note, latest.timestamp, !latest.pdf_id);
}

export function exportSummary(project: ProjectState): SurfaceSummary {
  const runs = project.export_runs.length;
  const latest = project.export_runs.at(-1);
  if (!latest) return { state: "pending", updatedAt: "—", note: "Not started" };
  const parts: string[] = [];
  if (latest.dxf_id) parts.push("DXF");
  if (latest.dwg_id) parts.push("DWG");
  return summarise(
    runs,
    parts.length ? `${parts.join(" + ")} delivered` : "Drafted",
    latest.timestamp,
    false,
  );
}

export function stateFromSurfaces(
  surfaces: Record<SurfaceKey, SurfaceSummary>,
): SurfaceState {
  // Overall project stage picker : return the first surface that's
  // "active" then "draft" then the last "done". Mirrors what the
  // dashboard's stage pill reflects.
  const order: SurfaceKey[] = [
    "brief",
    "testfit",
    "moodboard",
    "justify",
    "export",
  ];
  for (const key of order) {
    if (surfaces[key].state === "active") return "active";
  }
  for (const key of order) {
    if (surfaces[key].state === "draft") return "draft";
  }
  if (order.every((k) => surfaces[k].state === "done")) return "done";
  return "pending";
}

export function projectSurfacesFromState(
  project: ProjectState,
): Record<SurfaceKey, SurfaceSummary> {
  return {
    brief: briefSummary(project),
    testfit: testFitSummary(project),
    moodboard: moodBoardSummary(project),
    justify: justifySummary(project),
    export: exportSummary(project),
  };
}

/**
 * Overall progress in 0-100. Counts surfaces :
 *   done   → 1.0
 *   active → 0.6
 *   draft  → 0.4
 *   pending → 0
 */
export function projectProgressPct(
  surfaces: Record<SurfaceKey, SurfaceSummary>,
): number {
  const weights: Record<SurfaceState, number> = {
    done: 1,
    active: 0.6,
    draft: 0.4,
    pending: 0,
  };
  const keys: SurfaceKey[] = ["brief", "testfit", "moodboard", "justify", "export"];
  const sum = keys.reduce((acc, k) => acc + weights[surfaces[k].state], 0);
  return Math.round((sum / keys.length) * 100);
}
