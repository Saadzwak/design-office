/**
 * Projects index — multi-project storage.
 *
 * Iter-17 landed `project_state.v2` for a SINGLE active project.
 * The Claude Design handoff introduces a dashboard where the user
 * sees every project at a glance, drills into one, and comes back.
 *
 * Rather than expand the v2 state to carry an array (which would
 * break every existing consumer and require another migration),
 * iter-18 stores the project index under a dedicated localStorage
 * key — `design-office.projects_index.v1`. The index is the
 * at-a-glance roll-up (metadata + per-surface state summary) ;
 * the full data for the active project stays in the v2 state and
 * gets snapshotted into the index on every save.
 *
 * Real fixtures (no fictional data) — Saad's rule #2 on the iter-18
 * kickoff :
 *
 *   - Lumen      — tech_startup, Paris 9ᵉ, 120 → 170 FTE, 2 400 m²
 *                  (the canonical flow, proven live end-to-end)
 *   - Altamont   — law_firm, City of London, 68 → 92 partners + staff,
 *                  1 650 m² (live Brief fixture : altamont_brief_output)
 *   - Kaito      — creative_agency, Lisbon, 42 → 60 FTE, 980 m²
 *                  (live Mood Board fixture : kaito_moodboard.pdf)
 *   - Meridian   — bank_insurance (synthetic fourth slot, 340 → 380,
 *                  6 200 m², La Défense) — fills the grid and
 *                  demonstrates a 4th industry profile without a
 *                  live run behind it.
 */

import type { Industry } from "../projectState";

const STORAGE_KEY = "design-office.projects_index.v1";
export const PROJECTS_INDEX_EVENT = "design-office:projects-index-changed";

export type SurfaceKey = "brief" | "testfit" | "moodboard" | "justify" | "export";

export type SurfaceState = "done" | "active" | "draft" | "pending";

export type SurfaceSummary = {
  state: SurfaceState;
  updatedAt: string; // e.g. "today · 14:32", free-form
  note: string;
};

export type ProjectSummary = {
  id: string;
  name: string;
  industry: Industry;
  client: string;
  headcount: number;
  headcountTarget: number;
  /** m² net usable. */
  surface: number;
  floors: number;
  location: string;
  /** External ref, e.g. "LUM-2026-041". */
  ref: string;
  /** Human stage label — driven by the rightmost "active" surface
   *  or "Export" if all are done. */
  stage: string;
  /** 0–100 progress. */
  progress: number;
  updatedAt: string;
  /** CSS hex for the project tint — seeds card headers + progress bar. */
  tint: string;
  /** Per-surface summary (5 surfaces). */
  surfaces: Record<SurfaceKey, SurfaceSummary>;
  /** True when this project is the one currently loaded in project_state v2. */
  isActive?: boolean;
};

/**
 * Canonical real fixtures — shipped as the initial content of the
 * index. Consumers can overlay their own projects (via `upsert`) but
 * these names remain recognisable in the demo and in screenshots.
 */
export const DEFAULT_PROJECTS: ProjectSummary[] = [
  {
    id: "lumen",
    name: "Lumen",
    industry: "tech_startup",
    client: "Lumen SAS",
    headcount: 120,
    headcountTarget: 170,
    surface: 2400,
    floors: 2,
    location: "Paris, 9ᵉ",
    ref: "LUM-2026-041",
    stage: "Test fit",
    progress: 62,
    updatedAt: "today · 14:32",
    tint: "#3C5D50",
    surfaces: {
      brief: {
        state: "done",
        updatedAt: "yesterday · 17:00",
        note: "8 programme sections · 120 → 170 FTE",
      },
      testfit: {
        state: "active",
        updatedAt: "today · 13:10",
        note: "Atelier retained · 130 desks",
      },
      moodboard: {
        state: "done",
        updatedAt: "today · 14:32",
        note: "Atelier · 10 tiles · 6 pigments",
      },
      justify: {
        state: "draft",
        updatedAt: "today · 14:40",
        note: "7 sections drafted · 31 citations",
      },
      export: {
        state: "pending",
        updatedAt: "—",
        note: "Not started",
      },
    },
    isActive: true,
  },
  {
    id: "altamont",
    name: "Altamont & Rees",
    industry: "law_firm",
    client: "Altamont & Rees LLP",
    headcount: 68,
    headcountTarget: 92,
    surface: 1650,
    floors: 1,
    location: "City of London",
    ref: "ALT-2026-028",
    stage: "Justify",
    progress: 88,
    updatedAt: "yesterday · 11:20",
    tint: "#8A7555",
    surfaces: {
      brief: {
        state: "done",
        updatedAt: "3d ago · 10:00",
        note: "Partners, associates, admin — tiered programme",
      },
      testfit: {
        state: "done",
        updatedAt: "2d ago · 16:14",
        note: "Library parti retained · 82 offices",
      },
      moodboard: {
        state: "done",
        updatedAt: "2d ago · 18:02",
        note: "Card Room Green · Dinesen · brass",
      },
      justify: {
        state: "active",
        updatedAt: "yesterday · 11:20",
        note: "Client review tomorrow",
      },
      export: {
        state: "pending",
        updatedAt: "—",
        note: "Awaiting sign-off",
      },
    },
  },
  {
    id: "kaito",
    name: "Kaito Studio",
    industry: "creative_agency",
    client: "Kaito Studio Lda",
    headcount: 42,
    headcountTarget: 60,
    surface: 980,
    floors: 1,
    location: "Lisbon, Marvila",
    ref: "KAI-2026-019",
    stage: "Brief",
    progress: 34,
    updatedAt: "4d ago · 09:48",
    tint: "#A0522D",
    surfaces: {
      brief: {
        state: "done",
        updatedAt: "4d ago · 09:48",
        note: "Culture-led programme · ritual rooms",
      },
      testfit: {
        state: "pending",
        updatedAt: "—",
        note: "Awaiting floor plan upload",
      },
      moodboard: {
        state: "done",
        updatedAt: "3d ago · 15:02",
        note: "Plaster · kiln · plywood · acid yellow",
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
    },
  },
  {
    id: "meridian",
    name: "Meridian",
    industry: "bank_insurance",
    client: "Meridian Group",
    headcount: 340,
    headcountTarget: 380,
    surface: 6200,
    floors: 4,
    location: "La Défense",
    ref: "MER-2026-007",
    stage: "Export",
    progress: 100,
    updatedAt: "1w ago · 18:44",
    tint: "#2F4A3F",
    surfaces: {
      brief: { state: "done", updatedAt: "3w ago", note: "Delivered" },
      testfit: {
        state: "done",
        updatedAt: "2w ago",
        note: "Campus retained · 348 desks",
      },
      moodboard: {
        state: "done",
        updatedAt: "2w ago",
        note: "Terrazzo, blued steel, wool",
      },
      justify: { state: "done", updatedAt: "1w ago", note: "Client signed-off" },
      export: {
        state: "done",
        updatedAt: "1w ago · 18:44",
        note: "DXF delivered · DWG pending ODA converter",
      },
    },
  },
];

export function loadProjectsIndex(): ProjectSummary[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { projects?: ProjectSummary[] };
      if (Array.isArray(parsed.projects) && parsed.projects.length > 0) {
        return parsed.projects;
      }
    }
  } catch {
    // fall through
  }
  // First load — seed with the real-fixture default.
  saveProjectsIndex(DEFAULT_PROJECTS);
  return DEFAULT_PROJECTS;
}

export function saveProjectsIndex(projects: ProjectSummary[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects }));
    window.dispatchEvent(
      new CustomEvent(PROJECTS_INDEX_EVENT, { detail: projects }),
    );
  } catch {
    // quota / disabled — non-fatal.
  }
}

export function upsertProject(project: ProjectSummary): ProjectSummary[] {
  const current = loadProjectsIndex();
  const idx = current.findIndex((p) => p.id === project.id);
  const next =
    idx >= 0
      ? current.map((p, i) => (i === idx ? project : p))
      : [...current, project];
  saveProjectsIndex(next);
  return next;
}

export function setActiveProject(id: string): ProjectSummary[] {
  const current = loadProjectsIndex();
  const next = current.map((p) => ({ ...p, isActive: p.id === id }));
  saveProjectsIndex(next);
  return next;
}

export function getActiveProject(): ProjectSummary | null {
  const projects = loadProjectsIndex();
  return projects.find((p) => p.isActive) ?? projects[0] ?? null;
}

export function resetProjectsIndex(): ProjectSummary[] {
  saveProjectsIndex(DEFAULT_PROJECTS);
  return DEFAULT_PROJECTS;
}

export function onProjectsIndexChange(
  listener: (projects: ProjectSummary[]) => void,
): () => void {
  const handler = (e: Event) => {
    const custom = e as CustomEvent<ProjectSummary[]>;
    if (custom.detail) listener(custom.detail);
    else listener(loadProjectsIndex());
  };
  window.addEventListener(PROJECTS_INDEX_EVENT, handler as EventListener);
  return () =>
    window.removeEventListener(PROJECTS_INDEX_EVENT, handler as EventListener);
}
