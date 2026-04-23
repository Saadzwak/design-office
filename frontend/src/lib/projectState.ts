/**
 * Unified project state — single source of truth across pages.
 *
 * Replaces the scatter of `design-office.brief`, `design-office.programme`,
 * `design-office.testfit.result`, `design-office.testfit.live_screenshots`
 * etc. with one JSON payload at `design-office.project_state.v1`.
 *
 * Existing keys are migrated on first load (see `loadProjectState`). This
 * keeps older sessions working after deploy.
 *
 * Updates are published via a `storage`-like custom event so every mounted
 * page reacts in real time, including chat-driven updates from the drawer
 * on a different route.
 */

import type {
  FloorPlan,
  ReviewerVerdict,
  VariantOutput,
} from "./api";

export type Industry =
  | "tech_startup"
  | "law_firm"
  | "bank_insurance"
  | "consulting"
  | "creative_agency"
  | "healthcare"
  | "public_sector"
  | "other";

export const INDUSTRY_LABEL: Record<Industry, string> = {
  tech_startup: "Tech startup",
  law_firm: "Law firm",
  bank_insurance: "Bank & insurance",
  consulting: "Consulting",
  creative_agency: "Creative agency",
  healthcare: "Healthcare",
  public_sector: "Public sector",
  other: "Other",
};

export type ViewMode = "engineering" | "client";

export type VariantStyle = "villageois" | "atelier" | "hybride_flex";

export type TestFitState = {
  floor_plan: FloorPlan;
  variants: VariantOutput[];
  verdicts: ReviewerVerdict[];
  live_screenshots: Partial<Record<VariantStyle, string>>;
  retained_style: VariantStyle | null;
};

export type JustifyState = {
  argumentaire_markdown: string;
  pdf_id: string | null;
  pptx_id: string | null;
};

export type MoodBoardState = {
  pdf_id: string | null;
  palette: string[];
};

export type ProjectState = {
  version: 1;
  client: {
    name: string;
    industry: Industry;
    logo_data_url: string | null;
  };
  brief: string;
  programme: {
    markdown: string;
    headcount: number | null;
    growth_target: number | null;
    flex_policy: string | null;
    constraints: string[];
  };
  floor_plan: FloorPlan | null;
  testfit: TestFitState | null;
  justify: JustifyState | null;
  mood_board: MoodBoardState | null;
  view_mode: ViewMode;
};

const STORAGE_KEY = "design-office.project_state.v1";
export const PROJECT_STATE_EVENT = "design-office:project-state-changed";

// Legacy keys we migrate away from on first load.
const LEGACY_KEYS = [
  "design-office.brief",
  "design-office.programme",
  "design-office.testfit.result",
  "design-office.testfit.live_screenshots",
];

const DEFAULT_BRIEF = `Lumen, a fintech startup, 120 people today, 170 projected within 24 months.
Attendance policy: 3 days on-site, 2 remote. Tech teams pair-program heavily.
Culture is flat, transparent, with a strong team identity (product, tech, data, growth, ops).
Dominant work modes: synchronous collaboration, design sprints, pair programming,
deep focus for engineers, weekly all-hands rituals.
Stated asks: plenty of collaboration spaces, a central café (not tucked away),
quiet zones for deep work, no giant undifferentiated open space,
strong brand expression.
Available area: 2,400 m² usable across two floors connected by a central stair.
Cat B budget: 2.2 M€ excl. tax.
Climate: Paris, south façade onto the street, north façade onto an inner courtyard.`;

const DEFAULT_PROGRAMME = `# Functional programme — Lumen

- 170 FTE at 24 months, 3/2 on-site policy, flex ratio 0.75 (130 desks).
- 6 focus rooms, 14 phone booths, 8 huddles, 6 mid-sized meeting rooms, 2 boardrooms.
- 1 town-hall space 120 m², central café 260 m².
- Sources: design://office-programming, design://flex-ratios, design://collaboration-spaces.`;

export function defaultProjectState(): ProjectState {
  return {
    version: 1,
    client: {
      name: "Lumen",
      industry: "tech_startup",
      logo_data_url: null,
    },
    brief: DEFAULT_BRIEF,
    programme: {
      markdown: DEFAULT_PROGRAMME,
      headcount: 120,
      growth_target: 170,
      flex_policy: "3 days on-site, 2 remote",
      constraints: [],
    },
    floor_plan: null,
    testfit: null,
    justify: null,
    mood_board: null,
    view_mode: "engineering",
  };
}

function migrateLegacy(existing: ProjectState): ProjectState {
  const next: ProjectState = { ...existing };

  try {
    const legacyBrief = localStorage.getItem("design-office.brief");
    if (legacyBrief && next.brief === DEFAULT_BRIEF) next.brief = legacyBrief;

    const legacyProg = localStorage.getItem("design-office.programme");
    if (legacyProg && next.programme.markdown === DEFAULT_PROGRAMME) {
      next.programme = { ...next.programme, markdown: legacyProg };
    }

    const rawTestfit = localStorage.getItem("design-office.testfit.result");
    if (rawTestfit && !next.testfit) {
      const parsed = JSON.parse(rawTestfit) as {
        floor_plan: FloorPlan;
        variants: VariantOutput[];
        verdicts: ReviewerVerdict[];
      };
      next.floor_plan = parsed.floor_plan;
      next.testfit = {
        floor_plan: parsed.floor_plan,
        variants: parsed.variants,
        verdicts: parsed.verdicts,
        live_screenshots: {},
        retained_style: null,
      };
    }

    const rawShots = localStorage.getItem("design-office.testfit.live_screenshots");
    if (rawShots && next.testfit) {
      next.testfit = {
        ...next.testfit,
        live_screenshots: JSON.parse(rawShots),
      };
    }
  } catch {
    // Corrupt legacy values — keep defaults.
  }

  return next;
}

export function loadProjectState(): ProjectState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProjectState;
      if (parsed.version === 1) return parsed;
    }
  } catch {
    // fall through to defaults
  }
  // First load on this machine. Seed with defaults and attempt a legacy
  // migration so returning users don't lose their in-flight project.
  const seeded = migrateLegacy(defaultProjectState());
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  } catch {
    /* ignore quota */
  }
  return seeded;
}

export function saveProjectState(state: ProjectState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(PROJECT_STATE_EVENT, { detail: state }));
  } catch {
    // Quota full or storage disabled. UI will still work in-memory for this tab.
  }
}

export function patchProjectState(patch: Partial<ProjectState>): ProjectState {
  const current = loadProjectState();
  const next = { ...current, ...patch };
  saveProjectState(next);
  return next;
}

/** Setters for nested groups — each returns the new state for chaining. */
export function setClient(
  patch: Partial<ProjectState["client"]>,
): ProjectState {
  const current = loadProjectState();
  const next: ProjectState = {
    ...current,
    client: { ...current.client, ...patch },
  };
  saveProjectState(next);
  return next;
}

export function setBrief(brief: string): ProjectState {
  return patchProjectState({ brief });
}

export function setProgramme(
  patch: Partial<ProjectState["programme"]>,
): ProjectState {
  const current = loadProjectState();
  const next: ProjectState = {
    ...current,
    programme: { ...current.programme, ...patch },
  };
  saveProjectState(next);
  return next;
}

export function setFloorPlan(plan: FloorPlan | null): ProjectState {
  return patchProjectState({ floor_plan: plan });
}

export function setTestFit(testfit: TestFitState | null): ProjectState {
  return patchProjectState({ testfit });
}

export function setTestFitRetained(style: VariantStyle | null): ProjectState {
  const current = loadProjectState();
  if (!current.testfit) return current;
  const next: ProjectState = {
    ...current,
    testfit: { ...current.testfit, retained_style: style },
  };
  saveProjectState(next);
  return next;
}

export function setLiveScreenshot(style: VariantStyle, url: string): ProjectState {
  const current = loadProjectState();
  if (!current.testfit) return current;
  const next: ProjectState = {
    ...current,
    testfit: {
      ...current.testfit,
      live_screenshots: { ...current.testfit.live_screenshots, [style]: url },
    },
  };
  saveProjectState(next);
  return next;
}

export function upsertVariant(updated: VariantOutput): ProjectState {
  const current = loadProjectState();
  if (!current.testfit) return current;
  const variants = current.testfit.variants.map((v) =>
    v.style === updated.style ? updated : v,
  );
  const next: ProjectState = {
    ...current,
    testfit: { ...current.testfit, variants },
  };
  saveProjectState(next);
  return next;
}

export function setJustify(justify: JustifyState | null): ProjectState {
  return patchProjectState({ justify });
}

export function setMoodBoard(mb: MoodBoardState | null): ProjectState {
  return patchProjectState({ mood_board: mb });
}

export function setViewMode(mode: ViewMode): ProjectState {
  return patchProjectState({ view_mode: mode });
}

/**
 * Subscribe to project-state changes. Fires on both same-tab updates
 * (via the custom event we dispatch in `saveProjectState`) and cross-tab
 * updates (via the standard `storage` event).
 */
export function onProjectStateChange(
  listener: (state: ProjectState) => void,
): () => void {
  const handleLocal = (e: Event) => {
    const custom = e as CustomEvent<ProjectState>;
    if (custom.detail) listener(custom.detail);
    else listener(loadProjectState());
  };
  const handleCross = (e: StorageEvent) => {
    if (e.key === null || e.key === STORAGE_KEY) {
      listener(loadProjectState());
    }
  };
  window.addEventListener(PROJECT_STATE_EVENT, handleLocal as EventListener);
  window.addEventListener("storage", handleCross);
  return () => {
    window.removeEventListener(PROJECT_STATE_EVENT, handleLocal as EventListener);
    window.removeEventListener("storage", handleCross);
  };
}

/** One-shot helper to nuke the legacy keys after migration is confirmed. */
export function clearLegacyKeys(): void {
  for (const k of LEGACY_KEYS) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}
