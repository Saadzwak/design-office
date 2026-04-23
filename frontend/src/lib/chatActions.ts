/**
 * Chat action dispatcher — translates a `SuggestedAction` emitted by the
 * chat agent into a real backend call, updates the unified project state
 * accordingly, and returns a human-readable status string.
 *
 * This is the thin layer that makes the chat *actually useful* rather
 * than a floating Q&A widget.
 */

import {
  exportDxfUrl,
  generateExport,
  generateJustify,
  generateTestFit,
  iterateVariant,
  synthesizeBrief,
  type FloorPlan,
  type VariantOutput,
} from "./api";
import type { SuggestedAction } from "./chat";
import {
  loadProjectState,
  setClient,
  setFloorPlan,
  setJustify,
  setProgramme,
  setTestFit,
  setTestFitRetained,
  upsertVariant,
  type Industry,
  type VariantStyle,
} from "./projectState";

// Known action types — mirrors the allow-list in `chat_assistant.md`.
// Anything else gets dropped at the call site with a console.warn.
export type ActionType = SuggestedAction["type"];

export type ActionOutcome =
  | { kind: "ok"; message: string; navigate?: string }
  | { kind: "error"; message: string };

type EnrichField =
  | "headcount"
  | "growth_target"
  | "flex_policy"
  | "industry"
  | "constraints";

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asInt(v: unknown): number | null {
  if (typeof v === "number") return Math.round(v);
  if (typeof v === "string") {
    const m = v.match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  }
  return null;
}

function asIndustry(v: unknown): Industry {
  const s = asString(v);
  const allowed: Industry[] = [
    "tech_startup",
    "law_firm",
    "bank_insurance",
    "consulting",
    "creative_agency",
    "healthcare",
    "public_sector",
    "other",
  ];
  return (allowed as string[]).includes(s) ? (s as Industry) : "other";
}

function isStyle(v: unknown): v is VariantStyle {
  return v === "villageois" || v === "atelier" || v === "hybride_flex";
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function doStartBrief(): Promise<ActionOutcome> {
  const project = loadProjectState();
  if (!project.brief || project.brief.length < 50) {
    return {
      kind: "error",
      message: "Brief is too short. Open /brief and describe the client first.",
    };
  }
  try {
    const resp = await synthesizeBrief({
      brief: project.brief,
      client_name: project.client.name || undefined,
      language: "en",
    });
    setProgramme({ markdown: resp.programme });
    return {
      kind: "ok",
      message: `Programme synthesised (${resp.tokens.input + resp.tokens.output} tok).`,
      navigate: "/brief",
    };
  } catch (exc) {
    return {
      kind: "error",
      message: `Brief failed: ${exc instanceof Error ? exc.message : String(exc)}`,
    };
  }
}

async function doStartMacroZoning(): Promise<ActionOutcome> {
  const project = loadProjectState();
  let plan: FloorPlan | null = project.floor_plan ?? project.testfit?.floor_plan ?? null;
  if (!plan) {
    // Fall back to the fixture so the first-time user doesn't dead-end.
    try {
      const r = await fetch("/api/testfit/fixture");
      if (r.ok) {
        plan = (await r.json()) as FloorPlan;
        setFloorPlan(plan);
      }
    } catch {
      /* ignore */
    }
  }
  if (!plan) {
    return {
      kind: "error",
      message: "No floor plan yet. Upload a plan on /brief or /testfit.",
    };
  }
  try {
    const result = await generateTestFit({
      floor_plan: plan,
      programme_markdown: project.programme.markdown,
      client_name: project.client.name || "Lumen",
      styles: ["villageois", "atelier", "hybride_flex"],
      // iter-21a : feed the proposer stage with real project context.
      brief: project.brief ?? "",
      client_industry: project.client.industry ?? "",
    });
    setTestFit({
      floor_plan: result.floor_plan,
      variants: result.variants,
      verdicts: result.verdicts,
      live_screenshots: project.testfit?.live_screenshots ?? {},
      retained_style: project.testfit?.retained_style ?? null,
    });
    return {
      kind: "ok",
      message: `Three macro-zoning variants drafted and reviewed.`,
      navigate: "/testfit",
    };
  } catch (exc) {
    return {
      kind: "error",
      message: `Macro zoning failed: ${exc instanceof Error ? exc.message : String(exc)}`,
    };
  }
}

async function doStartMicroZoning(params: Record<string, unknown>): Promise<ActionOutcome> {
  const style = isStyle(params.style) ? params.style : null;
  const project = loadProjectState();
  if (!style || !project.testfit) {
    return {
      kind: "error",
      message: "Generate the three macro variants first, then pick one to drill into.",
    };
  }
  setTestFitRetained(style);
  return {
    kind: "ok",
    message: `${styleLabel(style)} selected as the retained variant. Micro-zoning opens on /testfit?tab=micro.`,
    navigate: "/testfit?tab=micro",
  };
}

async function doStartMoodBoard(): Promise<ActionOutcome> {
  const project = loadProjectState();
  if (!project.testfit || !project.testfit.retained_style) {
    const fallback = project.testfit?.variants?.[0]?.style ?? null;
    if (fallback) setTestFitRetained(fallback);
  }
  return {
    kind: "ok",
    message: "Open /moodboard to curate materials and compose the A3 PDF.",
    navigate: "/moodboard",
  };
}

async function doStartJustify(params: Record<string, unknown>): Promise<ActionOutcome> {
  const project = loadProjectState();
  if (!project.testfit || !project.floor_plan) {
    return {
      kind: "error",
      message: "Run the three macro variants first — Justify needs a retained variant.",
    };
  }
  const style = isStyle(params.style)
    ? params.style
    : project.testfit.retained_style ??
      pickPreferredStyle(project.testfit.variants, project.testfit.verdicts);
  const variant = project.testfit.variants.find((v) => v.style === style);
  if (!variant) {
    return {
      kind: "error",
      message: `Variant '${style}' not found in the current project.`,
    };
  }
  try {
    const resp = await generateJustify({
      client_name: project.client.name || "Lumen",
      brief: project.brief,
      programme_markdown: project.programme.markdown,
      floor_plan: project.floor_plan,
      variant,
      language: "en",
    });
    setJustify({
      argumentaire_markdown: resp.argumentaire,
      pdf_id: resp.pdf_id ?? null,
      pptx_id: resp.pptx_id ?? null,
    });
    setTestFitRetained(style);
    return {
      kind: "ok",
      message: `Sourced argumentaire ready (${resp.sub_outputs.length} agents, ${
        resp.tokens.input + resp.tokens.output
      } tok).`,
      navigate: "/justify",
    };
  } catch (exc) {
    return {
      kind: "error",
      message: `Justify failed: ${exc instanceof Error ? exc.message : String(exc)}`,
    };
  }
}

async function doIterateVariant(params: Record<string, unknown>): Promise<ActionOutcome> {
  const project = loadProjectState();
  const style = isStyle(params.style) ? params.style : project.testfit?.retained_style ?? null;
  const instruction = asString(params.instruction).trim();
  if (!style || !project.testfit || !project.floor_plan) {
    return { kind: "error", message: "Run the macro zoning first." };
  }
  if (instruction.length < 3) {
    return { kind: "error", message: "Please phrase the instruction more fully." };
  }
  const variant = project.testfit.variants.find((v) => v.style === style);
  if (!variant) return { kind: "error", message: `Variant '${style}' not found.` };
  try {
    const resp = await iterateVariant({
      instruction,
      floor_plan: project.floor_plan,
      variant,
      programme_markdown: project.programme.markdown,
      client_name: project.client.name || "Lumen",
    });
    upsertVariant(resp.variant);
    if (resp.screenshot_url) {
      // Write via both the legacy + unified path — upsertVariant updates
      // variants but the screenshot map lives under testfit.live_screenshots.
      try {
        const raw = localStorage.getItem("design-office.testfit.live_screenshots");
        const map: Record<string, string> = raw ? JSON.parse(raw) : {};
        map[style] = resp.screenshot_url;
        localStorage.setItem(
          "design-office.testfit.live_screenshots",
          JSON.stringify(map),
        );
      } catch {
        /* ignore */
      }
    }
    return {
      kind: "ok",
      message: `Iteration applied on ${styleLabel(style)} (${
        resp.tokens.input + resp.tokens.output
      } tok, ${(resp.duration_ms / 1000).toFixed(1)}s).`,
    };
  } catch (exc) {
    return {
      kind: "error",
      message: `Iteration failed: ${exc instanceof Error ? exc.message : String(exc)}`,
    };
  }
}

async function doExportDwg(params: Record<string, unknown>): Promise<ActionOutcome> {
  const project = loadProjectState();
  if (!project.testfit || !project.floor_plan) {
    return { kind: "error", message: "Run the macro zoning first." };
  }
  const style = project.testfit.retained_style ??
    pickPreferredStyle(project.testfit.variants, project.testfit.verdicts);
  const variant = project.testfit.variants.find((v) => v.style === style);
  if (!variant) return { kind: "error", message: "No retained variant." };
  const scale = asInt(params.scale) ?? 100;
  const projectRef = asString(params.project_reference) || undefined;
  try {
    const resp = await generateExport({
      client_name: project.client.name || "Lumen",
      floor_plan: project.floor_plan,
      variant,
      scale,
      project_reference: projectRef,
    });
    // Kick off the download.
    try {
      const a = document.createElement("a");
      a.href = exportDxfUrl(resp.export_id);
      a.download = resp.dxf_filename;
      a.click();
    } catch {
      /* ignore */
    }
    return {
      kind: "ok",
      message: `A1 DXF ready (${(resp.dxf_bytes / 1024).toFixed(1)} KB, ${resp.trace_length} ops).`,
      navigate: "/export",
    };
  } catch (exc) {
    return {
      kind: "error",
      message: `Export failed: ${exc instanceof Error ? exc.message : String(exc)}`,
    };
  }
}

async function doGeneratePitchDeck(): Promise<ActionOutcome> {
  const project = loadProjectState();
  if (!project.justify) {
    return {
      kind: "error",
      message: "Generate the argumentaire first — the PPTX is rendered from it.",
    };
  }
  if (!project.justify.pptx_id) {
    return {
      kind: "error",
      message: "This argumentaire was rendered without a PPTX. Re-run Justify to get a pitch deck.",
    };
  }
  try {
    const a = document.createElement("a");
    a.href = `/api/justify/pptx/${project.justify.pptx_id}`;
    a.download = `${project.client.name || "client"}-pitch-deck.pptx`;
    a.click();
  } catch {
    /* ignore */
  }
  return {
    kind: "ok",
    message: "Pitch deck download triggered.",
    navigate: "/justify",
  };
}

function doUpdateProjectField(params: Record<string, unknown>): ActionOutcome {
  const field = asString(params.field) as EnrichField;
  const value = params.value;
  switch (field) {
    case "headcount": {
      const n = asInt(value);
      if (n === null) return { kind: "error", message: "headcount must be a number." };
      setProgramme({ headcount: n });
      return { kind: "ok", message: `Headcount updated to ${n}.` };
    }
    case "growth_target": {
      const n = asInt(value);
      if (n === null) return { kind: "error", message: "growth_target must be a number." };
      setProgramme({ growth_target: n });
      return { kind: "ok", message: `Growth target updated to ${n}.` };
    }
    case "flex_policy": {
      const s = asString(value);
      if (!s) return { kind: "error", message: "flex_policy must be a non-empty string." };
      setProgramme({ flex_policy: s });
      return { kind: "ok", message: `Flex policy updated: ${s}` };
    }
    case "industry": {
      const ind = asIndustry(value);
      setClient({ industry: ind });
      return { kind: "ok", message: `Industry set to ${ind.replace(/_/g, " ")}.` };
    }
    case "constraints": {
      const s = asString(value);
      if (!s) return { kind: "error", message: "constraints must be a non-empty string." };
      const current = loadProjectState();
      setProgramme({ constraints: [...current.programme.constraints, s] });
      return { kind: "ok", message: "Constraint noted." };
    }
    default:
      return { kind: "error", message: `Unknown enrichment field: ${field}` };
  }
}

// ---------------------------------------------------------------------------
// Public dispatch
// ---------------------------------------------------------------------------

export async function dispatchChatAction(
  action: SuggestedAction,
): Promise<ActionOutcome> {
  const params = (action.params as Record<string, unknown>) ?? {};
  switch (action.type) {
    case "start_brief":
    case "regenerate_programme":
      return doStartBrief();
    case "start_macro_zoning":
    case "regenerate_variants":
      return doStartMacroZoning();
    case "start_micro_zoning":
      return doStartMicroZoning(params);
    case "start_mood_board":
      return doStartMoodBoard();
    case "start_justify":
    case "regenerate_argumentaire":
      return doStartJustify(params);
    case "iterate_variant":
      return doIterateVariant(params);
    case "export_dwg":
    case "export_dxf":
      return doExportDwg(params);
    case "generate_pitch_deck":
      return doGeneratePitchDeck();
    case "update_project_field":
      return doUpdateProjectField(params);
    default:
      return {
        kind: "error",
        message: `Unknown action type: ${action.type}`,
      };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickPreferredStyle(
  variants: VariantOutput[],
  verdicts: Array<{ style: string; verdict: string }>,
): VariantStyle {
  const approved = variants.find((v) => {
    const verdict = verdicts.find((r) => r.style === v.style)?.verdict;
    return verdict === "approved" || verdict === "approved_with_notes";
  });
  const fallback = approved ?? variants[0];
  return (fallback?.style as VariantStyle) ?? "atelier";
}

export function styleLabel(style: VariantStyle): string {
  switch (style) {
    case "villageois":
      return "Neighbourhood";
    case "atelier":
      return "Atelier";
    case "hybride_flex":
      return "Hybrid flex";
  }
}

// ---------------------------------------------------------------------------
// Enrichment detection (regex — hardcoded patterns, no LLM call)
// ---------------------------------------------------------------------------

export type EnrichmentSuggestion = {
  field: EnrichField;
  newValue: string | number;
  currentValue: string | number | null;
  source: string;  // the sentence fragment that matched
};

/**
 * Scan the most recent user message for explicit project-parameter updates.
 * Returns a suggestion ONLY if the user used an unambiguous cue; otherwise
 * nothing. The chat backend still proposes `update_project_field` actions
 * via the LLM — this local scan fires earlier (before the network round-trip)
 * so the UI can show a confirmation card on the next render.
 */
export function detectEnrichment(
  userMessage: string,
): EnrichmentSuggestion | null {
  const project = loadProjectState();

  // Headcount — "we have 120 staff / people / employees / team / FTE"
  const headMatch = userMessage.match(
    /\b(?:we|now)\s+(?:have|are|count)\s+(\d{2,4})\s+(?:people|staff|employees|team members|fte|heads|persons)\b/i,
  );
  if (headMatch) {
    const n = parseInt(headMatch[1], 10);
    if (n !== project.programme.headcount) {
      return {
        field: "headcount",
        newValue: n,
        currentValue: project.programme.headcount,
        source: headMatch[0],
      };
    }
  }

  // Growth target — "grow to 170" / "170 by end of 2026"
  const growthMatch = userMessage.match(
    /\b(?:grow(?:ing)?\s+to|target(?:ing)?|scale(?:\s+up)?\s+to|project(?:ed|ing)?\s+(?:to\s+)?reach)\s+(\d{2,4})\b/i,
  );
  if (growthMatch) {
    const n = parseInt(growthMatch[1], 10);
    if (n !== project.programme.growth_target) {
      return {
        field: "growth_target",
        newValue: n,
        currentValue: project.programme.growth_target,
        source: growthMatch[0],
      };
    }
  }

  // Industry — "we are a [law firm / fintech / bank / consulting firm / …]"
  const industryPatterns: Array<[RegExp, Industry]> = [
    [/\b(?:law firm|legal practice|barristers|avocats)\b/i, "law_firm"],
    [/\b(?:fintech|tech startup|software company|SaaS|scaleup)\b/i, "tech_startup"],
    [/\b(?:bank|banking|insurance|wealth management|assurance|banque)\b/i, "bank_insurance"],
    [/\b(?:consulting|advisory|management consultancy)\b/i, "consulting"],
    [/\b(?:creative agency|design studio|advertising agency|ad agency)\b/i, "creative_agency"],
    [/\b(?:healthcare|hospital|medical|clinic|pharma)\b/i, "healthcare"],
    [/\b(?:government|public sector|ministry|agency|municipality)\b/i, "public_sector"],
  ];
  for (const [re, key] of industryPatterns) {
    if (re.test(userMessage) && project.client.industry !== key) {
      return {
        field: "industry",
        newValue: key,
        currentValue: project.client.industry,
        source: userMessage.match(re)?.[0] ?? "",
      };
    }
  }

  // Flex policy — "3 days in the office, 2 remote" / "hybrid 3/2" / "4 days on-site"
  const flexMatch = userMessage.match(
    /\b(\d)\s*(?:days?|d)\s+(?:on[-\s]?site|in\s+the\s+office|au\s+bureau)(?:\s*[,/\-]\s*\s*(\d)\s*(?:days?|d)?\s*(?:remote|télétravail|home))?\b/i,
  );
  if (flexMatch) {
    const onsite = parseInt(flexMatch[1], 10);
    const remote = flexMatch[2] ? parseInt(flexMatch[2], 10) : 5 - onsite;
    const label = `${onsite} days on-site, ${remote} remote`;
    if (project.programme.flex_policy !== label) {
      return {
        field: "flex_policy",
        newValue: label,
        currentValue: project.programme.flex_policy,
        source: flexMatch[0],
      };
    }
  }

  return null;
}
