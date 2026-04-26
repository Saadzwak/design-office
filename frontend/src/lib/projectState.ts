/**
 * Unified project state — single source of truth across pages.
 *
 * v2 (iter-17) : append-only run history so regenerating a macro-zoning
 * no longer wipes the micro-zonings and mood boards that were drilled
 * on the previous run. The `testfit`, `justify`, `mood_board` fields
 * are now **derived views** of the latest active run, kept on the state
 * object so every existing consumer continues to read them unchanged.
 *
 * New writes go through the `runs` arrays. The v1-shaped mirrors are
 * re-computed on every save. Iteration-18 (frontend UX refactor) will
 * add the history-browsing UI that consumes the raw arrays.
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

/** v1-shape view, still consumed by every page. Kept as derived state. */
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
  /** Iter-33 follow-up — the HTML→PDF magazine deck. Optional so older
   *  serialised projects don't break on rehydrate. */
  magazine_pdf_id?: string | null;
};

export type MoodBoardState = {
  pdf_id: string | null;
  palette: string[];
  // iter-20e (Saad #19-#22) : keep the full curator selection JSON
  // around so the Justify page can forward it to the PPT renderer
  // (tagline, palette, materials, furniture). Opaque to the UI : it
  // only matters to the backend. `null` when the mood board hasn't
  // been generated yet or when legacy state has no selection.
  selection?: Record<string, unknown> | null;
};

// ──────────────────────────────── Runs ────────────────────────────────

export type MacroZoningRun = {
  run_id: string;
  timestamp: string;
  label?: string;
  floor_plan: FloorPlan;
  variants: VariantOutput[];
  verdicts: ReviewerVerdict[];
  live_screenshots: Partial<Record<VariantStyle, string>>;
  retained_style: VariantStyle | null;
};

export type MicroZoningRun = {
  run_id: string;
  parent_macro_run_id: string;
  parent_variant_style: VariantStyle;
  timestamp: string;
  markdown: string;
  // iter-17 additive — optional structured sections. The existing UI
  // reads `markdown`; iter-18 cards will consume `sections` when present.
  sections?: Array<{ id: string; title: string; tldr?: string; detail?: string }>;
};

export type MoodBoardRun = {
  run_id: string;
  parent_macro_run_id: string | null;
  parent_variant_style: VariantStyle | null;
  timestamp: string;
  pdf_id: string | null;
  visual_image_id: string | null;
  palette: string[];
  // iter-20e : full curator JSON, persisted so Justify can forward
  // tagline / palette / materials / furniture to the PPT renderer.
  selection?: Record<string, unknown> | null;
};

export type JustifyRun = {
  run_id: string;
  parent_macro_run_id: string | null;
  parent_variant_style: VariantStyle | null;
  timestamp: string;
  argumentaire_markdown: string;
  pdf_id: string | null;
  pptx_id: string | null;
  /** Iter-33 follow-up — magazine PDF rendered via Jinja2 + headless
   *  Chromium. Optional so pre-iter-33 serialised runs deserialize. */
  magazine_pdf_id?: string | null;
};

export type ExportRun = {
  run_id: string;
  parent_macro_run_id: string | null;
  parent_variant_style: VariantStyle | null;
  timestamp: string;
  dxf_id: string | null;
  dwg_id: string | null;
};

// ──────────────────────────────── State ────────────────────────────────

export type ProjectState = {
  version: 2;
  project_id: string;
  client: {
    name: string;
    industry: Industry;
    logo_data_url: string | null;
  };
  /** Iter-20b (Saad #1) — upload enrichment.
   *
   * - `plan_image_data_url` : when the user drops a PNG / JPG / WEBP
   *   of their plan instead of a PDF, we store the raster preview
   *   alongside the parsed FloorPlan (if any). The macro-zoning agent
   *   can feed the raster into Vision HD for better spatial cues.
   * - `visit_photos` : multi-upload of on-site photographs the
   *   architect took during the brief visit. These enrich mood-board
   *   prompts (real materials observed) and micro-zoning context
   *   (existing furniture configuration).
   */
  uploads?: {
    plan_image_data_url?: string | null;
    visit_photos?: Array<{ name: string; data_url: string }>;
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

  // Raw history — newest last. Iter-18 UX will expose browsing.
  macro_zoning_runs: MacroZoningRun[];
  active_macro_run_id: string | null;
  micro_zoning_runs: MicroZoningRun[];
  moodboard_runs: MoodBoardRun[];
  justify_runs: JustifyRun[];
  export_runs: ExportRun[];

  // v1-shape derived views. Re-computed on every save. Safe to read
  // from the existing pages unchanged.
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

function newId(prefix: string): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rnd}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

export function defaultProjectState(): ProjectState {
  return {
    version: 2,
    project_id: newId("lumen"),
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
    macro_zoning_runs: [],
    active_macro_run_id: null,
    micro_zoning_runs: [],
    moodboard_runs: [],
    justify_runs: [],
    export_runs: [],
    testfit: null,
    justify: null,
    mood_board: null,
    view_mode: "engineering",
  };
}

/**
 * Recompute the v1-shape derived views from the raw run arrays.
 * Called on every save so consumers that still read `state.testfit`
 * keep observing the latest active run.
 */
export function reconcileDerivedViews(state: ProjectState): ProjectState {
  const active = state.macro_zoning_runs.find(
    (r) => r.run_id === state.active_macro_run_id,
  );
  const testfit: TestFitState | null = active
    ? {
        floor_plan: active.floor_plan,
        variants: active.variants,
        verdicts: active.verdicts,
        live_screenshots: active.live_screenshots,
        retained_style: active.retained_style,
      }
    : null;

  // Justify / mood board — last entry tied to the active macro run if
  // any, otherwise the last entry at all. This matches the v1 semantics
  // where those fields always pointed at "the current artefact".
  const justifyRun = latestForActive(state.justify_runs, state.active_macro_run_id);
  const justify: JustifyState | null = justifyRun
    ? {
        argumentaire_markdown: justifyRun.argumentaire_markdown,
        pdf_id: justifyRun.pdf_id,
        pptx_id: justifyRun.pptx_id,
        magazine_pdf_id: justifyRun.magazine_pdf_id ?? null,
      }
    : null;

  const mbRun = latestForActive(state.moodboard_runs, state.active_macro_run_id);
  const mood_board: MoodBoardState | null = mbRun
    ? {
        pdf_id: mbRun.pdf_id,
        palette: mbRun.palette,
        selection: mbRun.selection ?? null,
      }
    : null;

  return {
    ...state,
    floor_plan: state.floor_plan ?? active?.floor_plan ?? null,
    testfit,
    justify,
    mood_board,
  };
}

function latestForActive<T extends { parent_macro_run_id: string | null; timestamp: string }>(
  runs: T[],
  activeMacroId: string | null,
): T | null {
  if (runs.length === 0) return null;
  // Prefer runs tied to the active macro; fall back to the latest of any.
  const tied = runs.filter((r) => r.parent_macro_run_id === activeMacroId);
  const pool = tied.length > 0 ? tied : runs;
  return [...pool].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0] ?? null;
}

// ──────────────────────────────── Migration ────────────────────────────────

/**
 * Promote a legacy v1 payload to v2 : wrap its `testfit`, `justify`,
 * `mood_board` (if present) into single-entry runs so the user doesn't
 * see a blank slate after this deploy.
 */
function migrateV1ToV2(raw: unknown): ProjectState | null {
  if (!raw || typeof raw !== "object") return null;
  const v1 = raw as Record<string, unknown>;
  // Already v2
  if (v1.version === 2) return raw as ProjectState;
  if (v1.version !== 1) return null;

  const base = defaultProjectState();
  // Copy scalar groups straight over.
  base.project_id = (v1.project_id as string | undefined) ?? base.project_id;
  base.client = { ...base.client, ...(v1.client as ProjectState["client"]) };
  if (typeof v1.brief === "string") base.brief = v1.brief;
  if (v1.programme && typeof v1.programme === "object") {
    base.programme = {
      ...base.programme,
      ...(v1.programme as ProjectState["programme"]),
    };
  }
  if (v1.floor_plan) base.floor_plan = v1.floor_plan as FloorPlan;
  if (v1.view_mode === "client" || v1.view_mode === "engineering") {
    base.view_mode = v1.view_mode;
  }

  // Promote legacy testfit → one macro run.
  const legacyTestfit = v1.testfit as TestFitState | null | undefined;
  let macroId: string | null = null;
  if (legacyTestfit && legacyTestfit.variants?.length) {
    macroId = newId("macro");
    base.macro_zoning_runs = [
      {
        run_id: macroId,
        timestamp: isoNow(),
        label: "Migrated from v1",
        floor_plan: legacyTestfit.floor_plan,
        variants: legacyTestfit.variants,
        verdicts: legacyTestfit.verdicts ?? [],
        live_screenshots: legacyTestfit.live_screenshots ?? {},
        retained_style: legacyTestfit.retained_style ?? null,
      },
    ];
    base.active_macro_run_id = macroId;
  }

  // Legacy justify → one run.
  const legacyJustify = v1.justify as JustifyState | null | undefined;
  if (legacyJustify && legacyJustify.argumentaire_markdown) {
    base.justify_runs = [
      {
        run_id: newId("justify"),
        parent_macro_run_id: macroId,
        parent_variant_style: legacyTestfit?.retained_style ?? null,
        timestamp: isoNow(),
        argumentaire_markdown: legacyJustify.argumentaire_markdown,
        pdf_id: legacyJustify.pdf_id,
        pptx_id: legacyJustify.pptx_id,
      },
    ];
  }

  // Legacy mood board → one run.
  const legacyMood = v1.mood_board as MoodBoardState | null | undefined;
  if (legacyMood && (legacyMood.pdf_id || legacyMood.palette?.length)) {
    base.moodboard_runs = [
      {
        run_id: newId("moodboard"),
        parent_macro_run_id: macroId,
        parent_variant_style: legacyTestfit?.retained_style ?? null,
        timestamp: isoNow(),
        pdf_id: legacyMood.pdf_id,
        visual_image_id: null,
        palette: legacyMood.palette ?? [],
      },
    ];
  }

  return reconcileDerivedViews(base);
}

function migrateStaleStorageKeys(existing: ProjectState): ProjectState {
  const next: ProjectState = { ...existing };

  try {
    const legacyBrief = localStorage.getItem("design-office.brief");
    if (legacyBrief && next.brief === DEFAULT_BRIEF) next.brief = legacyBrief;

    const legacyProg = localStorage.getItem("design-office.programme");
    if (legacyProg && next.programme.markdown === DEFAULT_PROGRAMME) {
      next.programme = { ...next.programme, markdown: legacyProg };
    }

    // Only promote legacy testfit if we don't already have a macro run
    // from the v1→v2 migration step above.
    if (next.macro_zoning_runs.length === 0) {
      const rawTestfit = localStorage.getItem("design-office.testfit.result");
      if (rawTestfit) {
        const parsed = JSON.parse(rawTestfit) as {
          floor_plan: FloorPlan;
          variants: VariantOutput[];
          verdicts: ReviewerVerdict[];
        };
        if (parsed?.floor_plan && parsed?.variants?.length) {
          const rawShots = localStorage.getItem(
            "design-office.testfit.live_screenshots",
          );
          const shots: Partial<Record<VariantStyle, string>> = rawShots
            ? JSON.parse(rawShots)
            : {};
          const macroId = newId("macro");
          next.floor_plan = parsed.floor_plan;
          next.macro_zoning_runs = [
            {
              run_id: macroId,
              timestamp: isoNow(),
              label: "Migrated from legacy keys",
              floor_plan: parsed.floor_plan,
              variants: parsed.variants,
              verdicts: parsed.verdicts,
              live_screenshots: shots,
              retained_style: null,
            },
          ];
          next.active_macro_run_id = macroId;
        }
      }
    }
  } catch {
    // Corrupt legacy values — keep defaults.
  }

  return reconcileDerivedViews(next);
}

export function loadProjectState(): ProjectState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      const asAny = parsed as { version?: number };
      if (asAny?.version === 2) {
        return reconcileDerivedViews(parsed as ProjectState);
      }
      if (asAny?.version === 1) {
        const migrated = migrateV1ToV2(parsed);
        if (migrated) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          } catch {
            /* ignore quota */
          }
          return migrated;
        }
      }
    }
  } catch {
    // fall through to defaults
  }
  // First load on this machine. Seed with defaults and attempt a legacy
  // migration so returning users don't lose their in-flight project.
  const seeded = migrateStaleStorageKeys(defaultProjectState());
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  } catch {
    /* ignore quota */
  }
  return seeded;
}

export function saveProjectState(state: ProjectState): void {
  const reconciled = reconcileDerivedViews(state);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reconciled));
    window.dispatchEvent(
      new CustomEvent(PROJECT_STATE_EVENT, { detail: reconciled }),
    );
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

/** Iter-20b : store the user's uploaded raster plan preview. */
export function setPlanImage(dataUrl: string | null): ProjectState {
  const current = loadProjectState();
  const next: ProjectState = {
    ...current,
    uploads: {
      ...(current.uploads ?? {}),
      plan_image_data_url: dataUrl,
    },
  };
  saveProjectState(next);
  return next;
}

/** Iter-20b : append visit photos (replaces the array when list is given). */
export function setVisitPhotos(
  photos: Array<{ name: string; data_url: string }>,
): ProjectState {
  const current = loadProjectState();
  const next: ProjectState = {
    ...current,
    uploads: {
      ...(current.uploads ?? {}),
      visit_photos: photos,
    },
  };
  saveProjectState(next);
  return next;
}

export function appendVisitPhoto(photo: {
  name: string;
  data_url: string;
}): ProjectState {
  const current = loadProjectState();
  const list = current.uploads?.visit_photos ?? [];
  return setVisitPhotos([...list, photo]);
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

// ──────────────────────────── Macro-zoning runs ────────────────────────────

/**
 * Start a new macro-zoning run. Append-only : previous runs stay on
 * `state.macro_zoning_runs` so the micro-zoning and mood-board artefacts
 * tied to them via `parent_macro_run_id` remain retrievable.
 *
 * Back-compat : still reachable as `setTestFit(...)` from every existing
 * caller — the v1-shape payload is promoted to a run here.
 */
export function startMacroZoningRun(payload: {
  floor_plan: FloorPlan;
  variants: VariantOutput[];
  verdicts: ReviewerVerdict[];
  live_screenshots?: Partial<Record<VariantStyle, string>>;
  retained_style?: VariantStyle | null;
  label?: string;
}): ProjectState {
  const current = loadProjectState();
  const run: MacroZoningRun = {
    run_id: newId("macro"),
    timestamp: isoNow(),
    label: payload.label,
    floor_plan: payload.floor_plan,
    variants: payload.variants,
    verdicts: payload.verdicts,
    live_screenshots: payload.live_screenshots ?? {},
    retained_style: payload.retained_style ?? null,
  };
  const next: ProjectState = {
    ...current,
    floor_plan: payload.floor_plan,
    macro_zoning_runs: [...current.macro_zoning_runs, run],
    active_macro_run_id: run.run_id,
  };
  saveProjectState(next);
  return next;
}

/** v1-compat setter. Creates a new run if there is none, else replaces it
 * in place only when the payload shape matches (identical variants).
 * Callers that want append-only history should use `startMacroZoningRun`.
 */
export function setTestFit(testfit: TestFitState | null): ProjectState {
  if (testfit === null) {
    // Hard-reset requested — drop the active pointer but KEEP the run
    // history so the parent_macro_run_id links on micro/moodboard still
    // resolve if the user scrolls back.
    const current = loadProjectState();
    const next: ProjectState = { ...current, active_macro_run_id: null };
    saveProjectState(next);
    return next;
  }
  return startMacroZoningRun(testfit);
}

export function setActiveMacroRunId(run_id: string | null): ProjectState {
  return patchProjectState({ active_macro_run_id: run_id });
}

export function setTestFitRetained(style: VariantStyle | null): ProjectState {
  const current = loadProjectState();
  if (!current.active_macro_run_id) return current;
  const macro_zoning_runs = current.macro_zoning_runs.map((r) =>
    r.run_id === current.active_macro_run_id
      ? { ...r, retained_style: style }
      : r,
  );
  const next: ProjectState = { ...current, macro_zoning_runs };
  saveProjectState(next);
  return next;
}

export function setLiveScreenshot(
  style: VariantStyle,
  url: string,
): ProjectState {
  const current = loadProjectState();
  if (!current.active_macro_run_id) return current;
  const macro_zoning_runs = current.macro_zoning_runs.map((r) =>
    r.run_id === current.active_macro_run_id
      ? {
          ...r,
          live_screenshots: { ...r.live_screenshots, [style]: url },
        }
      : r,
  );
  const next: ProjectState = { ...current, macro_zoning_runs };
  saveProjectState(next);
  return next;
}

export function upsertVariant(updated: VariantOutput): ProjectState {
  const current = loadProjectState();
  if (!current.active_macro_run_id) return current;
  const macro_zoning_runs = current.macro_zoning_runs.map((r) => {
    if (r.run_id !== current.active_macro_run_id) return r;
    return {
      ...r,
      variants: r.variants.map((v) => (v.style === updated.style ? updated : v)),
    };
  });
  const next: ProjectState = { ...current, macro_zoning_runs };
  saveProjectState(next);
  return next;
}

// ──────────────────────────── Micro-zoning runs ────────────────────────────

export function appendMicroZoningRun(payload: {
  parent_variant_style: VariantStyle;
  markdown: string;
  sections?: MicroZoningRun["sections"];
}): ProjectState {
  const current = loadProjectState();
  if (!current.active_macro_run_id) return current;
  const run: MicroZoningRun = {
    run_id: newId("micro"),
    parent_macro_run_id: current.active_macro_run_id,
    parent_variant_style: payload.parent_variant_style,
    timestamp: isoNow(),
    markdown: payload.markdown,
    sections: payload.sections,
  };
  const next: ProjectState = {
    ...current,
    micro_zoning_runs: [...current.micro_zoning_runs, run],
  };
  saveProjectState(next);
  return next;
}

export function selectLatestMicroZoningFor(
  state: ProjectState,
  variantStyle: VariantStyle,
): MicroZoningRun | null {
  if (!state.active_macro_run_id) return null;
  const tied = state.micro_zoning_runs.filter(
    (r) =>
      r.parent_macro_run_id === state.active_macro_run_id &&
      r.parent_variant_style === variantStyle,
  );
  if (tied.length === 0) return null;
  return [...tied].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0] ?? null;
}

// ──────────────────────────── Mood board runs ────────────────────────────

export function appendMoodBoardRun(payload: {
  parent_variant_style?: VariantStyle | null;
  pdf_id: string | null;
  visual_image_id?: string | null;
  palette: string[];
  selection?: Record<string, unknown> | null;
}): ProjectState {
  const current = loadProjectState();
  const run: MoodBoardRun = {
    run_id: newId("moodboard"),
    parent_macro_run_id: current.active_macro_run_id,
    parent_variant_style: payload.parent_variant_style ?? null,
    timestamp: isoNow(),
    pdf_id: payload.pdf_id,
    visual_image_id: payload.visual_image_id ?? null,
    palette: payload.palette,
    selection: payload.selection ?? null,
  };
  const next: ProjectState = {
    ...current,
    moodboard_runs: [...current.moodboard_runs, run],
  };
  saveProjectState(next);
  return next;
}

/** v1-compat setter. Appends a new mood-board run. */
export function setMoodBoard(mb: MoodBoardState | null): ProjectState {
  if (mb === null) {
    // Intentional reset — do NOT delete the run history; flip the
    // derived view off by clearing the last entry's pdf_id would lie.
    // The UI should just open a fresh generation flow instead.
    return loadProjectState();
  }
  return appendMoodBoardRun({
    pdf_id: mb.pdf_id,
    palette: mb.palette,
    selection: mb.selection ?? null,
  });
}

// ──────────────────────────── Justify runs ────────────────────────────

export function appendJustifyRun(payload: {
  parent_variant_style?: VariantStyle | null;
  argumentaire_markdown: string;
  pdf_id: string | null;
  pptx_id: string | null;
  magazine_pdf_id?: string | null;
}): ProjectState {
  const current = loadProjectState();
  const run: JustifyRun = {
    run_id: newId("justify"),
    parent_macro_run_id: current.active_macro_run_id,
    parent_variant_style: payload.parent_variant_style ?? null,
    timestamp: isoNow(),
    argumentaire_markdown: payload.argumentaire_markdown,
    pdf_id: payload.pdf_id,
    pptx_id: payload.pptx_id,
    magazine_pdf_id: payload.magazine_pdf_id ?? null,
  };
  const next: ProjectState = {
    ...current,
    justify_runs: [...current.justify_runs, run],
  };
  saveProjectState(next);
  return next;
}

/** v1-compat setter. Appends a new justify run. */
export function setJustify(justify: JustifyState | null): ProjectState {
  if (justify === null) return loadProjectState();
  return appendJustifyRun({
    argumentaire_markdown: justify.argumentaire_markdown,
    pdf_id: justify.pdf_id,
    pptx_id: justify.pptx_id,
    magazine_pdf_id: justify.magazine_pdf_id ?? null,
  });
}

// ──────────────────────────── Export runs ────────────────────────────

export function appendExportRun(payload: {
  parent_variant_style?: VariantStyle | null;
  dxf_id: string | null;
  dwg_id?: string | null;
}): ProjectState {
  const current = loadProjectState();
  const run: ExportRun = {
    run_id: newId("export"),
    parent_macro_run_id: current.active_macro_run_id,
    parent_variant_style: payload.parent_variant_style ?? null,
    timestamp: isoNow(),
    dxf_id: payload.dxf_id,
    dwg_id: payload.dwg_id ?? null,
  };
  const next: ProjectState = {
    ...current,
    export_runs: [...current.export_runs, run],
  };
  saveProjectState(next);
  return next;
}

// ──────────────────────────── View mode ────────────────────────────

export function setViewMode(mode: ViewMode): ProjectState {
  return patchProjectState({ view_mode: mode });
}

// ──────────────────────────── Subscription ────────────────────────────

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
