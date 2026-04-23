import { beforeEach, describe, expect, it } from "vitest";

import type {
  FloorPlan,
  ReviewerVerdict,
  VariantOutput,
} from "../../api";
import type { ProjectState } from "../../projectState";

import {
  DEFAULT_PROJECTS,
  getActiveProject,
  loadProjectsIndex,
  onProjectsIndexChange,
  resetProjectsIndex,
  setActiveProject,
  upsertProject,
} from "../projectsIndex";
import {
  projectProgressPct,
  projectSurfacesFromState,
  stateFromSurfaces,
} from "../dashboardSummary";
import { variantToDesign, variantsToDesign } from "../variantAdapter";

// ─────────────────────────────────────────────────────────────
// Minimal jsdom-like localStorage polyfill for Vitest (runs in
// node environment by default; jsdom costs extra startup).
// ─────────────────────────────────────────────────────────────
const mem: Record<string, string> = {};
const g = globalThis as unknown as Record<string, unknown>;
g.localStorage = {
  getItem: (k: string) => (k in mem ? mem[k] : null),
  setItem: (k: string, v: string) => {
    mem[k] = v;
  },
  removeItem: (k: string) => {
    delete mem[k];
  },
  clear: () => {
    for (const k of Object.keys(mem)) delete mem[k];
  },
  key: (i: number) => Object.keys(mem)[i] ?? null,
  get length() {
    return Object.keys(mem).length;
  },
};
g.window = g;
g.dispatchEvent = () => true;
g.addEventListener = () => {};
g.removeEventListener = () => {};
if (!g.CustomEvent) {
  g.CustomEvent = class {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
}

beforeEach(() => {
  for (const k of Object.keys(mem)) delete mem[k];
});

// ─────────────────────────────────────────────────────────────
// projectsIndex
// ─────────────────────────────────────────────────────────────

describe("projectsIndex · real fixtures (no fictional data)", () => {
  it("seeds Lumen, Altamont, Kaito, Meridian on first load", () => {
    const projects = loadProjectsIndex();
    expect(projects.map((p) => p.id)).toEqual([
      "lumen",
      "altamont",
      "kaito",
      "meridian",
    ]);
  });

  it("exposes industry labels that cover our 3 proven + 1 synthetic", () => {
    const industries = DEFAULT_PROJECTS.map((p) => p.industry).sort();
    expect(industries).toEqual(
      ["bank_insurance", "creative_agency", "law_firm", "tech_startup"].sort(),
    );
  });

  it("getActiveProject returns Lumen by default (isActive: true)", () => {
    loadProjectsIndex(); // seed
    const active = getActiveProject();
    expect(active?.id).toBe("lumen");
  });

  it("setActiveProject flips the isActive flag atomically", () => {
    loadProjectsIndex();
    const after = setActiveProject("altamont");
    expect(after.find((p) => p.id === "altamont")?.isActive).toBe(true);
    expect(after.find((p) => p.id === "lumen")?.isActive).toBe(false);
  });

  it("upsertProject adds a new project", () => {
    loadProjectsIndex();
    const nova = {
      ...DEFAULT_PROJECTS[0],
      id: "nova",
      name: "Nova",
      isActive: false,
    };
    const next = upsertProject(nova);
    expect(next.find((p) => p.id === "nova")).toBeDefined();
    expect(next).toHaveLength(5);
  });

  it("upsertProject replaces in place when id matches", () => {
    loadProjectsIndex();
    const modified = { ...DEFAULT_PROJECTS[0], stage: "Export" };
    const next = upsertProject(modified);
    expect(next).toHaveLength(4);
    expect(next.find((p) => p.id === "lumen")?.stage).toBe("Export");
  });

  it("resetProjectsIndex returns to the canonical fixtures", () => {
    loadProjectsIndex();
    setActiveProject("kaito");
    resetProjectsIndex();
    expect(getActiveProject()?.id).toBe("lumen");
  });

  it("onProjectsIndexChange returns an unsubscribe function", () => {
    const unsub = onProjectsIndexChange(() => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });
});

// ─────────────────────────────────────────────────────────────
// variantAdapter
// ─────────────────────────────────────────────────────────────

const LUMEN_PLAN: FloorPlan = {
  level: 0,
  name: "Lumen plateau",
  scale_unit: "mm",
  envelope: {
    points: [
      { x: 0, y: 0 },
      { x: 60_000, y: 0 },
      { x: 60_000, y: 40_000 },
      { x: 0, y: 40_000 },
    ],
  },
  columns: [],
  cores: [],
  windows: [],
  doors: [],
  stairs: [],
  text_labels: [],
  source_confidence: 1,
};

function makeVariant(overrides: Partial<VariantOutput> = {}): VariantOutput {
  return {
    style: "atelier",
    title: "Atelier · Long focus nave",
    narrative: "A long editorial nave of focus.",
    metrics: {
      workstation_count: 130,
      meeting_room_count: 6,
      phone_booth_count: 14,
      collab_surface_m2: 320,
      amenity_surface_m2: 260,
      circulation_m2: 450,
      total_programmed_m2: 1898,
      flex_ratio_applied: 0.76,
      notes: [],
    },
    sketchup_trace: [
      {
        tool: "create_workstation_cluster",
        params: { bbox_mm: [2000, 2000, 30000, 5000], count: 24 },
      },
      {
        tool: "create_meeting_room",
        params: { bbox_mm: [40000, 2000, 10000, 6000], capacity: 10 },
      },
      {
        tool: "create_phone_booth",
        params: { bbox_mm: [55000, 2000, 1200, 1200] },
      },
      {
        tool: "apply_biophilic_zone",
        params: { bbox_mm: [5000, 30000, 8000, 6000] },
      },
      {
        tool: "unknown_tool",
        params: {}, // should be skipped
      },
    ],
    screenshot_paths: [],
    adjacency_audit: {
      score: 82,
      summary: "Solid adjacencies with one major acoustic risk.",
      violations: [
        {
          rule_id: "acoustic.open_desks_next_to_boardroom",
          severity: "major",
          zones: ["cluster_A", "boardroom_main"],
          description: "12 desks share a wall with the 10-pax boardroom.",
          suggestion: "Insert a focus room between.",
          source: "WELL v2 Feature S02",
        },
      ],
      recommendations: [],
    },
    ...overrides,
  };
}

describe("variantAdapter", () => {
  it("maps an Atelier variant with 4 sketchup entries into 4 zones (skips unknowns without bbox)", () => {
    const v = makeVariant();
    const designed = variantToDesign(v, LUMEN_PLAN);
    // 5 trace entries, 4 with bbox, 1 with empty params → 4 zones
    expect(designed.zones).toHaveLength(4);
  });

  it("categorises tools consistently (work / collab / support / biophilic)", () => {
    const v = makeVariant();
    const designed = variantToDesign(v, LUMEN_PLAN);
    const kinds = designed.zones.map((z) => z.kind);
    expect(kinds).toEqual(["work", "collab", "support", "biophilic"]);
  });

  it("emits zones in normalised 88 × 62 space", () => {
    const v = makeVariant();
    const designed = variantToDesign(v, LUMEN_PLAN);
    // First zone bbox was (2000, 2000, 30000, 5000) mm on 60×40 m plate.
    // In norm : x = 2000/60000*88 = 2.933, y = 2000/40000*62 = 3.1,
    //          w = 30000/60000*88 = 44, h = 5000/40000*62 = 7.75
    const z0 = designed.zones[0];
    expect(z0.x).toBeCloseTo(2.933, 2);
    expect(z0.y).toBeCloseTo(3.1, 2);
    expect(z0.w).toBeCloseTo(44, 2);
    expect(z0.h).toBeCloseTo(7.75, 2);
  });

  it("uses studio-visible metrics (desks / density / flex / adjacency%)", () => {
    const v = makeVariant();
    const designed = variantToDesign(v, LUMEN_PLAN);
    expect(designed.metrics.desks).toBe(130);
    expect(designed.metrics.flex).toBe("0.76");
    expect(designed.metrics.adjacency).toBe("82%");
    expect(designed.metrics.density).toMatch(/m²\/FTE$/);
  });

  it("surfaces adjacency violations as warnings", () => {
    const v = makeVariant();
    const designed = variantToDesign(v, LUMEN_PLAN);
    expect(designed.warnings).toHaveLength(1);
    expect(designed.warnings[0].kind).toBe("adjacency");
    expect(designed.warnings[0].text).toContain("boardroom");
  });

  it("appends a Reviewer issue when there's headroom in the warnings", () => {
    const v = makeVariant({ adjacency_audit: null });
    const verdict: ReviewerVerdict = {
      style: "atelier",
      pmr_ok: true,
      erp_ok: true,
      programme_coverage_ok: false,
      issues: ["Programme short 10 desks vs target"],
      verdict: "approved_with_notes",
    };
    const designed = variantToDesign(v, LUMEN_PLAN, verdict);
    expect(designed.warnings).toHaveLength(1);
    expect(designed.warnings[0].kind).toBe("reviewer");
  });

  it("variantsToDesign pairs verdicts with their style", () => {
    const v1 = makeVariant({ style: "villageois" });
    const v2 = makeVariant({ style: "atelier" });
    const verdicts: ReviewerVerdict[] = [
      {
        style: "villageois",
        pmr_ok: true,
        erp_ok: true,
        programme_coverage_ok: true,
        issues: [],
        verdict: "approved",
      },
      {
        style: "atelier",
        pmr_ok: true,
        erp_ok: true,
        programme_coverage_ok: false,
        issues: ["x"],
        verdict: "approved_with_notes",
      },
    ];
    const designed = variantsToDesign([v1, v2], LUMEN_PLAN, verdicts);
    expect(designed.map((d) => d.id)).toEqual(["villageois", "atelier"]);
  });

  it("never produces negative-sized or zero-sized zones", () => {
    const bad = makeVariant({
      sketchup_trace: [
        {
          tool: "create_workstation_cluster",
          params: { bbox_mm: [100, 100, 0, 0] }, // degenerate
        },
      ],
    });
    const designed = variantToDesign(bad, LUMEN_PLAN);
    expect(designed.zones).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────
// dashboardSummary
// ─────────────────────────────────────────────────────────────

function makeProjectState(overrides: Partial<ProjectState> = {}): ProjectState {
  return {
    version: 2,
    project_id: "lumen-test",
    client: { name: "Lumen", industry: "tech_startup", logo_data_url: null },
    brief: "A brief",
    programme: {
      markdown: "# Programme\n\nSome content",
      headcount: 120,
      growth_target: 170,
      flex_policy: "3/2",
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
    ...overrides,
  };
}

describe("dashboardSummary", () => {
  it("reports brief done when programme markdown + headcount are set", () => {
    const ps = makeProjectState();
    const s = projectSurfacesFromState(ps);
    expect(s.brief.state).toBe("done");
    expect(s.brief.note).toMatch(/120 → 170/);
  });

  it("reports testfit pending when no macro runs yet", () => {
    const ps = makeProjectState();
    const s = projectSurfacesFromState(ps);
    expect(s.testfit.state).toBe("pending");
  });

  it("reports testfit active when a run exists but no retained variant", () => {
    const ps = makeProjectState({
      macro_zoning_runs: [
        {
          run_id: "macro-1",
          timestamp: new Date().toISOString(),
          floor_plan: LUMEN_PLAN,
          variants: [makeVariant()],
          verdicts: [],
          live_screenshots: {},
          retained_style: null,
        },
      ],
      active_macro_run_id: "macro-1",
    });
    const s = projectSurfacesFromState(ps);
    expect(s.testfit.state).toBe("active");
  });

  it("progress counts 1.0 per done, 0.6 per active, 0.4 per draft", () => {
    const s = {
      brief: { state: "done", updatedAt: "", note: "" } as const,
      testfit: { state: "active", updatedAt: "", note: "" } as const,
      moodboard: { state: "done", updatedAt: "", note: "" } as const,
      justify: { state: "draft", updatedAt: "", note: "" } as const,
      export: { state: "pending", updatedAt: "", note: "" } as const,
    };
    expect(projectProgressPct(s)).toBe(
      Math.round(((1 + 0.6 + 1 + 0.4 + 0) / 5) * 100),
    );
  });

  it("stateFromSurfaces picks active > draft > done", () => {
    expect(
      stateFromSurfaces({
        brief: { state: "done", updatedAt: "", note: "" },
        testfit: { state: "active", updatedAt: "", note: "" },
        moodboard: { state: "done", updatedAt: "", note: "" },
        justify: { state: "draft", updatedAt: "", note: "" },
        export: { state: "pending", updatedAt: "", note: "" },
      }),
    ).toBe("active");
    expect(
      stateFromSurfaces({
        brief: { state: "done", updatedAt: "", note: "" },
        testfit: { state: "done", updatedAt: "", note: "" },
        moodboard: { state: "done", updatedAt: "", note: "" },
        justify: { state: "draft", updatedAt: "", note: "" },
        export: { state: "pending", updatedAt: "", note: "" },
      }),
    ).toBe("draft");
    expect(
      stateFromSurfaces({
        brief: { state: "done", updatedAt: "", note: "" },
        testfit: { state: "done", updatedAt: "", note: "" },
        moodboard: { state: "done", updatedAt: "", note: "" },
        justify: { state: "done", updatedAt: "", note: "" },
        export: { state: "done", updatedAt: "", note: "" },
      }),
    ).toBe("done");
  });
});
