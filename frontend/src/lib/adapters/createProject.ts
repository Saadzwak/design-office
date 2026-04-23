/**
 * createProject — fold a user-uploaded project into project_state v2
 * + the projects index.
 *
 * Iter-19 B plumbing. Called by `NewProjectModal` after the user hits
 * "Create project". Responsibilities :
 *
 * 1. Mint a stable id from the project name + timestamp.
 * 2. Append a `ProjectSummary` to the projects index and flag it active.
 * 3. Overwrite the active `projectState` v2 : client identity, empty
 *    brief, a minimal programme seed (3 H2 sections so the Brief page
 *    still renders the Synthesize CTA — the seed is intentionally
 *    light so the user doesn't think the brief is "done").
 * 4. Persist the uploaded FloorPlan + client logo.
 */

import type { FloorPlan } from "../api";
import {
  defaultProjectState,
  setClient,
  setFloorPlan,
  setViewMode,
  type Industry,
  type ProjectState,
} from "../projectState";
import {
  loadProjectsIndex,
  saveProjectsIndex,
  setActiveProject,
  type ProjectSummary,
  type SurfaceKey,
  type SurfaceSummary,
} from "./projectsIndex";

/**
 * Minimal programme seed emitted for fresh projects. Crucially it has
 * NO H2 headings (`##`) so the Brief parser detects "0 sections" and
 * keeps the page in the `idle` phase with the Synthesize CTA visible —
 * the user gets to write their brief rather than landing on a
 * pre-canned Lumen programme.
 */
export const DEFAULT_PROGRAMME_SEED = "";

const STORAGE_KEY = "design-office.project_state.v1";

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 24) || "project"
  );
}

function minted(name: string): string {
  const base = slug(name);
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  return `${base}-${stamp}`;
}

function uniqueId(index: ProjectSummary[], name: string): string {
  let id = slug(name) || "project";
  const existing = new Set(index.map((p) => p.id));
  if (!existing.has(id)) return id;
  let i = 2;
  while (existing.has(`${id}-${i}`)) i += 1;
  return `${id}-${i}`;
}

function mintedRef(name: string): string {
  const first3 = slug(name).slice(0, 3).toUpperCase() || "DO0";
  const year = new Date().getFullYear();
  const n = String(Math.floor(100 + Math.random() * 899));
  return `${first3}-${year}-${n.padStart(3, "0")}`;
}

const INDUSTRY_TINT: Record<Industry, string> = {
  tech_startup: "#3C5D50",
  law_firm: "#8A7555",
  bank_insurance: "#2F4A3F",
  consulting: "#6B8F7F",
  creative_agency: "#A0522D",
  healthcare: "#4A6B5E",
  public_sector: "#5F584E",
  other: "#5A5E53",
};

function freshSurfaces(hasPlan: boolean): Record<SurfaceKey, SurfaceSummary> {
  return {
    brief: {
      state: "pending",
      updatedAt: "—",
      note: "Not started",
    },
    testfit: {
      state: "pending",
      updatedAt: "—",
      note: hasPlan ? "Plan parsed · awaiting the brief" : "Awaiting brief + plan",
    },
    moodboard: {
      state: "pending",
      updatedAt: "—",
      note: "Not started",
    },
    justify: {
      state: "pending",
      updatedAt: "—",
      note: "Not started",
    },
    export: {
      state: "pending",
      updatedAt: "—",
      note: "Not started",
    },
  };
}

export type CreateProjectInput = {
  name: string;
  industry: Industry;
  logoDataUrl: string | null;
  floorPlan: FloorPlan | null;
  /** Override the generated ref. Mostly for tests. */
  ref?: string;
  /** Override headcount defaults (the Brief will refine). */
  headcount?: number;
  headcountTarget?: number;
  surface?: number;
  floors?: number;
  location?: string;
};

/**
 * Writes the new project into both the projects index AND the v2
 * project state (which becomes the "active" identity). Returns the
 * `ProjectSummary` so the caller can navigate to its detail view.
 */
export function createProjectFromUpload(
  input: CreateProjectInput,
): ProjectSummary {
  const index = loadProjectsIndex();
  const id = uniqueId(index, input.name);
  const ref = input.ref ?? mintedRef(input.name);

  const hasPlan = !!input.floorPlan;
  const summary: ProjectSummary = {
    id,
    name: input.name,
    industry: input.industry,
    client: input.name,
    headcount: input.headcount ?? 0,
    headcountTarget: input.headcountTarget ?? 0,
    surface: input.surface ?? (hasPlan ? computePlanArea(input.floorPlan!) : 0),
    floors: input.floors ?? 1,
    location: input.location ?? "—",
    ref,
    stage: "Brief",
    progress: hasPlan ? 10 : 0,
    updatedAt: "just now",
    tint: INDUSTRY_TINT[input.industry],
    surfaces: freshSurfaces(hasPlan),
    isActive: true,
  };

  // Append + activate.
  const next = [summary, ...index.map((p) => ({ ...p, isActive: false }))];
  saveProjectsIndex(next);
  setActiveProject(id);

  // Reset project state v2 to the new identity.
  const base: ProjectState = {
    ...defaultProjectState(),
    project_id: id,
    client: {
      name: input.name,
      industry: input.industry,
      logo_data_url: input.logoDataUrl,
    },
    brief: "",
    programme: {
      markdown: DEFAULT_PROGRAMME_SEED,
      headcount: input.headcount ?? null,
      growth_target: input.headcountTarget ?? null,
      flex_policy: null,
      constraints: [],
    },
    floor_plan: input.floorPlan ?? null,
    view_mode: "engineering",
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(base));
  } catch {
    /* quota */
  }

  // Propagate the new identity through the existing setters so every
  // subscriber re-renders with the fresh project.
  setClient({
    name: input.name,
    industry: input.industry,
    logo_data_url: input.logoDataUrl,
  });
  if (input.floorPlan) {
    setFloorPlan(input.floorPlan);
  }
  setViewMode("engineering");

  return summary;
}

function computePlanArea(plan: FloorPlan): number {
  const pts = plan.envelope.points;
  if (pts.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.round(Math.abs(a) / 2 / 1_000_000);
}

export { minted as __testMinted };
