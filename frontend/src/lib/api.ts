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

// ---------------------------------------------------------------------------
// Integration status (live MCP connectivity)
// ---------------------------------------------------------------------------

export type IntegrationStatus = {
  sketchup: { reachable: boolean; host: string; port: number };
  autocad: { mode: "ezdxf_headless" | "file_ipc_live" };
  anthropic: { api_key_loaded: boolean; model: string };
};

export async function fetchIntegrationStatus(signal?: AbortSignal): Promise<IntegrationStatus> {
  const r = await fetch("/api/integrations/status", { signal });
  if (!r.ok) throw new Error(`Status fetch failed: ${r.status}`);
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

// iter-21b — existing interior partitioning extracted by Vision HD.
// Optional on the type so legacy fixtures (shell-only) deserialise
// cleanly. PlanSvg tolerates missing arrays.

export type Room = {
  polygon: Polygon2D;
  label: string | null;
  kind:
    | "room"
    | "corridor"
    | "wc"
    | "kitchen"
    | "stairwell"
    | "terrace"
    | "utility"
    | "unknown";
  area_m2: number | null;
};

export type InteriorWall = {
  start: Point2D;
  end: Point2D;
  thickness_mm: number;
  is_load_bearing: boolean | null;
};

export type WallOpening = {
  wall_index: number | null;
  center: Point2D;
  width_mm: number;
  kind: "door" | "passage" | "sliding" | "double_door" | "unknown";
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
  rooms?: Room[];
  interior_walls?: InteriorWall[];
  openings?: WallOpening[];
  text_labels: string[];
  source_confidence: number;
  source_notes?: string | null;
  // iter-21d (Phase B) — content-hash id of the source PDF so the
  // SketchUp reference-layer import can find it, plus the real
  // envelope dimensions Vision extracted at parse time.
  plan_source_id?: string | null;
  real_width_m?: number | null;
  real_height_m?: number | null;
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

export type VariantStyle = "villageois" | "atelier" | "hybride_flex";

export type AdjacencyViolation = {
  rule_id: string;
  severity: "info" | "minor" | "major" | "critical";
  zones: string[];
  description: string;
  suggestion: string;
  source: string;
};

export type AdjacencyAudit = {
  score: number;
  summary: string;
  violations: AdjacencyViolation[];
  recommendations: string[];
};

export type VariantOutput = {
  style: VariantStyle;
  title: string;
  narrative: string;
  metrics: VariantMetrics;
  sketchup_trace: Array<{ tool: string; params: Record<string, unknown> }>;
  screenshot_paths: string[];
  /** iter-24 P1 : backend-served URL for the freshly captured iso
   *  render. Null when the mock backend or SketchUp-down path is taken ;
   *  the frontend should then fall back to `live_screenshots` (post-
   *  iterate state) or a Lumen fixture if the project IS Lumen. */
  sketchup_shot_url?: string | null;
  /** iter-17 B : optional adjacency audit (null on pre-iter-17 fixtures). */
  adjacency_audit?: AdjacencyAudit | null;
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

export async function fetchTestFitSample(signal?: AbortSignal): Promise<TestFitResponse> {
  const r = await fetch("/api/testfit/sample", { signal });
  if (!r.ok) throw new Error(`Sample fetch failed: ${r.status}`);
  return r.json();
}

// ---------------------------------------------------------------------------
// Mood board
// ---------------------------------------------------------------------------

export type MoodBoardClient = {
  name: string;
  industry: string;
  logo_data_url?: string | null;
  tagline?: string | null;
};

export type MoodBoardRequest = {
  client: MoodBoardClient;
  brief: string;
  programme_markdown: string;
  variant: VariantOutput;
  project_reference?: string;
};

export type MoodBoardResponse = {
  pdf_id: string;
  selection: Record<string, unknown>;
  tokens: { input: number; output: number };
  duration_ms: number;
};

export async function generateMoodBoard(req: MoodBoardRequest): Promise<MoodBoardResponse> {
  const r = await fetch("/api/moodboard/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export function moodBoardPdfUrl(pdfId: string): string {
  return `/api/moodboard/pdf/${pdfId}`;
}

// ---------------------------------------------------------------------------
// Visual mood board + gallery (NanoBanana) — iter-17 + iter-20d
// ---------------------------------------------------------------------------

export type VisualMoodBoardGalleryTile = {
  label: "atmosphere" | "materials" | "furniture" | "biophilic";
  visual_image_id: string;
  path_rel: string;
  cache_hit: boolean;
  prompt: string;
};

export type VisualMoodBoardGalleryResponse = {
  tiles: VisualMoodBoardGalleryTile[];
  hero: { visual_image_id: string; path_rel: string } | null;
  total_bytes: number;
  cache_hits: number;
};

export type VisualMoodBoardRequest = {
  client_name: string;
  industry: string;
  variant: VariantOutput;
  mood_board_selection?: Record<string, unknown> | null;
  macro_zoning_summary?: string | null;
  micro_zoning_summary?: string | null;
  aspect_ratio?: "3:2" | "16:9" | "4:3" | "1:1";
};

export async function generateMoodBoardGallery(
  req: VisualMoodBoardRequest,
  signal?: AbortSignal,
): Promise<VisualMoodBoardGalleryResponse> {
  const r = await fetch("/api/moodboard/generate-gallery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// iter-20e (Saad #10) — re-render the A3 PDF once gallery tiles land,
// embedding the atmosphere photograph in the hero block. The backend
// resolves ids to absolute paths server-side; the frontend only sends
// the cache ids so the request stays small.
export type MoodBoardRerenderRequest = {
  client: { name: string; industry: string; logo_data_url?: string | null; tagline?: string | null };
  variant: VariantOutput;
  selection: Record<string, unknown>;
  project_reference?: string | null;
  gallery_tile_ids: Record<string, string>;
};

export type MoodBoardRerenderResponse = { pdf_id: string };

export async function rerenderMoodBoardPdf(
  req: MoodBoardRerenderRequest,
): Promise<MoodBoardRerenderResponse> {
  const r = await fetch("/api/moodboard/rerender-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/** Serve a generated NanoBanana image by id. Backend whitelists the
 *  cache-key pattern, so arbitrary ids 404 cleanly. */
export function generatedImageUrl(imageId: string): string {
  return `/api/generated-images/${imageId}`;
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
  // iter-21a (Saad, 2026-04-24) : raw brief + client industry feed the
  // Parti Pris Proposer stage so the 3 variants reflect THIS project's
  // use case and vocabulary — not the hardcoded tertiary-office moulds.
  brief?: string;
  client_industry?: string;
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

export type IterateRequest = {
  instruction: string;
  floor_plan: FloorPlan;
  variant: VariantOutput;
  programme_markdown?: string;
  client_name?: string;
};

export type IterateResponse = {
  variant: VariantOutput;
  tokens: { input: number; output: number };
  duration_ms: number;
  screenshot_url?: string | null;
};

// ---------------------------------------------------------------------------
// Structured micro-zoning (iter-18i)
// ---------------------------------------------------------------------------

export type StructuredFurniturePiece = {
  brand: string;
  name: string;
  quantity: number;
  dimensions_mm: string;
  catalog_id?: string | null;
};

export type StructuredMaterial = {
  surface: "floor" | "walls" | "ceiling" | "joinery" | "textile" | "other";
  brand: string;
  name: string;
  note: string;
};

export type AcousticTarget = {
  rw_target_db?: number | null;
  dnt_a_target_db?: number | null;
  tr60_target_s?: number | null;
  source: string;
};

export type StructuredAdjacencyCheck = {
  ok: boolean;
  note: string;
  rule_ids: string[];
};

export type StructuredZone = {
  n: number;
  name: string;
  surface_m2: number;
  icon: string;
  status: "ok" | "warn" | "error";
  furniture: StructuredFurniturePiece[];
  materials: StructuredMaterial[];
  acoustic?: AcousticTarget | null;
  adjacency: StructuredAdjacencyCheck;
  narrative: string;
};

export type StructuredMicroZoningResponse = {
  variant_style: VariantStyle;
  zones: StructuredZone[];
  markdown: string;
  tokens: { input: number; output: number };
  duration_ms: number;
};

export async function runMicroZoningStructured(
  req: {
    client_name: string;
    client_industry: string;
    floor_plan: FloorPlan;
    variant: VariantOutput;
    programme_markdown: string;
  },
  signal?: AbortSignal,
): Promise<StructuredMicroZoningResponse> {
  const r = await fetch("/api/testfit/microzoning/structured", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(body || `Structured micro-zoning failed: ${r.status}`);
  }
  return r.json();
}

export async function iterateVariant(req: IterateRequest): Promise<IterateResponse> {
  const r = await fetch("/api/testfit/iterate", {
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
  client_logo_data_url?: string | null;
  sketchup_iso_path?: string | null;
  // iter-20e — magazine pitch deck inputs (all optional). When
  // supplied, the PPT renders the new Vision / Programme / Three
  // variants / Atmosphere / Materials slides with real mood content.
  mood_board_selection?: Record<string, unknown> | null;
  other_variants?: VariantOutput[] | null;
  sketchup_iso_by_style?: Record<string, string> | null;
  gallery_tile_paths?: Record<string, string> | null;
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
