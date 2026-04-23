import { useLocation } from "react-router-dom";

import type { PageContext, PageName } from "../lib/chat";
import { loadProjectState } from "../lib/projectState";

/**
 * Derive the page-aware context the backend chat agent needs.
 *
 * The hook reads :
 * - the current route (from react-router)
 * - the unified project state (`design-office.project_state.v1`)
 *
 * Returns a `PageContext` ready to POST to /api/chat/message. The structure
 * of `data` intentionally mirrors what the agent needs to answer intelligently
 * without hammering the backend with extra fetches.
 */
export function useChatContext(): PageContext {
  const location = useLocation();
  const page = routeToPage(location.pathname);

  const data: Record<string, unknown> = {};

  try {
    const project = loadProjectState();

    data.client = project.client;
    data.view_mode = project.view_mode;

    if (project.brief) data.brief = project.brief;
    if (project.programme.markdown) {
      data.programme_markdown = project.programme.markdown;
      data.programme = {
        headcount: project.programme.headcount,
        growth_target: project.programme.growth_target,
        flex_policy: project.programme.flex_policy,
        constraints: project.programme.constraints,
      };
    }

    if (project.testfit?.variants?.length) {
      data.variants = project.testfit.variants.map((v) => ({
        style: v.style,
        title: v.title,
        narrative_head:
          typeof v.narrative === "string" ? v.narrative.slice(0, 800) : "",
        metrics: v.metrics,
      }));
      data.verdicts = project.testfit.verdicts;
      data.retained_style = project.testfit.retained_style;
      data.floor_plan_summary = project.testfit.floor_plan
        ? {
            name: project.testfit.floor_plan.name,
            columns: project.testfit.floor_plan.columns?.length ?? 0,
            cores: project.testfit.floor_plan.cores?.length ?? 0,
            stairs: project.testfit.floor_plan.stairs?.length ?? 0,
            windows: project.testfit.floor_plan.windows?.length ?? 0,
            source_confidence: project.testfit.floor_plan.source_confidence,
          }
        : null;
    }

    if (project.justify?.argumentaire_markdown) {
      data.argumentaire_excerpt = project.justify.argumentaire_markdown.slice(0, 2000);
      data.justify = {
        pdf_id: project.justify.pdf_id,
        pptx_id: project.justify.pptx_id,
      };
    }

    if (project.mood_board) {
      data.mood_board = project.mood_board;
    }
  } catch {
    // localStorage disabled or corrupted — fall through with partial data.
  }

  return { page, data };
}

function routeToPage(pathname: string): PageName {
  if (pathname === "/" || pathname === "") return "landing";
  if (pathname.startsWith("/brief")) return "brief";
  if (pathname.startsWith("/testfit")) return "testfit";
  if (pathname.startsWith("/moodboard")) return "moodboard";
  if (pathname.startsWith("/justify")) return "justify";
  if (pathname.startsWith("/export")) return "export";
  if (pathname.startsWith("/chat")) return "chat";
  return "landing";
}
