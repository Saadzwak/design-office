export type BriefManifest = {
  resources_dir: string;
  files: string[];
  ratios_json_size_bytes: number;
  benchmarks_version: string;
};

export type SubAgentTrace = {
  name: string;
  text: string;
  tokens: { input: number; output: number };
  duration_ms: number;
};

export type BriefResponse = {
  programme: string;
  trace: SubAgentTrace[];
  tokens: { input: number; output: number };
};

export type BriefRequest = {
  brief: string;
  client_name?: string;
  language?: "fr" | "en";
};

export async function fetchBriefManifest(signal?: AbortSignal): Promise<BriefManifest> {
  const r = await fetch("/api/brief/manifest", { signal });
  if (!r.ok) throw new Error(`Manifest fetch failed: ${r.status}`);
  return r.json();
}

export async function synthesizeBrief(
  req: BriefRequest,
  signal?: AbortSignal,
): Promise<BriefResponse> {
  const r = await fetch("/api/brief/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(body || `Synthesize failed: ${r.status}`);
  }
  return r.json();
}

// ---------------------------------------------------------------------------
// Test Fit surface (Phase 3)
// ---------------------------------------------------------------------------

export type Point2D = { x: number; y: number };
export type Polygon2D = { points: Point2D[] };
export type Column = { center: Point2D; radius_mm: number; square?: boolean; label?: string | null };
export type TechnicalCore = { kind: string; outline: Polygon2D; label?: string | null };
export type Window = {
  start: Point2D;
  end: Point2D;
  facade: string;
  sill_height_mm?: number | null;
  note?: string | null;
};
export type Stair = {
  outline: Polygon2D;
  connects_levels: number[];
  is_fire_escape?: boolean;
  label?: string | null;
};

export type FloorPlan = {
  level: number;
  name: string | null;
  scale_unit: "mm" | "cm" | "m";
  envelope: Polygon2D;
  gross_area_m2?: number | null;
  net_area_m2?: number | null;
  columns: Column[];
  cores: TechnicalCore[];
  windows: Window[];
  doors: unknown[];
  stairs: Stair[];
  text_labels: string[];
  source_confidence: number;
  source_notes?: string | null;
};

export type VariantMetrics = {
  workstation_count: number;
  meeting_room_count: number;
  phone_booth_count: number;
  collab_surface_m2: number;
  amenity_surface_m2: number;
  circulation_m2: number;
  total_programmed_m2: number;
  flex_ratio_applied: number;
  notes: string[];
};

export type VariantOutput = {
  style: "villageois" | "atelier" | "hybride_flex";
  title: string;
  narrative: string;
  metrics: VariantMetrics;
  sketchup_trace: Array<{ tool: string; params: Record<string, unknown> }>;
  screenshot_paths: string[];
};

export type ReviewerVerdict = {
  style: string;
  pmr_ok: boolean;
  erp_ok: boolean;
  programme_coverage_ok: boolean;
  issues: string[];
  verdict: "approved" | "approved_with_notes" | "rejected";
};

export type TestFitResponse = {
  floor_plan: FloorPlan;
  variants: VariantOutput[];
  verdicts: ReviewerVerdict[];
  tokens: { input: number; output: number };
};

export type CatalogPreview = {
  version: string;
  count: number;
  types: string[];
};

export async function fetchCatalogPreview(signal?: AbortSignal): Promise<CatalogPreview> {
  const r = await fetch("/api/testfit/catalog", { signal });
  if (!r.ok) throw new Error(`Catalog fetch failed: ${r.status}`);
  return r.json();
}

export async function fetchLumenFixture(signal?: AbortSignal): Promise<FloorPlan> {
  const r = await fetch("/api/testfit/fixture", { signal });
  if (!r.ok) throw new Error(`Fixture fetch failed: ${r.status}`);
  return r.json();
}

export async function uploadPlanPdf(file: File, useVision: boolean): Promise<FloorPlan> {
  const form = new FormData();
  form.append("file", file);
  form.append("use_vision", String(useVision));
  const r = await fetch("/api/testfit/parse", { method: "POST", body: form });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export type TestFitGenerateRequest = {
  floor_plan: FloorPlan;
  programme_markdown: string;
  client_name?: string;
  styles?: Array<"villageois" | "atelier" | "hybride_flex">;
};

export async function generateTestFit(req: TestFitGenerateRequest): Promise<TestFitResponse> {
  const r = await fetch("/api/testfit/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ---------------------------------------------------------------------------
// Justify surface (Phase 4)
// ---------------------------------------------------------------------------

export type JustifySubOutput = {
  name: string;
  text: string;
  tokens: { input: number; output: number };
  duration_ms: number;
};

export type JustifyResponse = {
  argumentaire: string;
  sub_outputs: JustifySubOutput[];
  tokens: { input: number; output: number };
  pdf_id: string | null;
  pptx_id: string | null;
};

export type JustifyRequest = {
  client_name: string;
  brief: string;
  programme_markdown: string;
  floor_plan: FloorPlan;
  variant: VariantOutput;
  language?: "fr" | "en";
};

export async function generateJustify(req: JustifyRequest): Promise<JustifyResponse> {
  const r = await fetch("/api/justify/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export function justifyPdfUrl(pdfId: string): string {
  return `/api/justify/pdf/${pdfId}`;
}

export function justifyPptxUrl(pptxId: string): string {
  return `/api/justify/pptx/${pptxId}`;
}

// ---------------------------------------------------------------------------
// Export surface (Phase 5)
// ---------------------------------------------------------------------------

export type ExportRequest = {
  client_name?: string;
  floor_plan: FloorPlan;
  variant: VariantOutput;
  scale?: number;
  project_reference?: string;
  drawer_initials?: string;
};

export type ExportResponse = {
  export_id: string;
  dxf_filename: string;
  dxf_bytes: number;
  sheet: string;
  scale: string;
  layers: string[];
  trace_length: number;
  plot_pdf_available: boolean;
};

export async function generateExport(req: ExportRequest): Promise<ExportResponse> {
  const r = await fetch("/api/export/dwg", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export function exportDxfUrl(exportId: string): string {
  return `/api/export/dxf/${exportId}`;
}
