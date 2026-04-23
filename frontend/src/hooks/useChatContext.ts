import { useLocation } from "react-router-dom";

import type { PageContext, PageName } from "../lib/chat";

/**
 * Derive the page-aware context the backend chat agent needs.
 *
 * The hook reads :
 * - the current route (from react-router)
 * - the relevant localStorage keys each page persists
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
    const brief = localStorage.getItem("design-office.brief");
    if (brief) data.brief = brief;

    const programme = localStorage.getItem("design-office.programme");
    if (programme) data.programme_markdown = programme;

    const testfitRaw = localStorage.getItem("design-office.testfit.result");
    if (testfitRaw) {
      const parsed = JSON.parse(testfitRaw);
      if (parsed?.variants?.length) {
        // Only expose metrics + verdicts + style + title — the full zone
        // trace is too heavy and rarely useful for Q&A.
        data.variants = parsed.variants.map((v: {
          style: string;
          title: string;
          narrative: string;
          metrics: Record<string, unknown>;
        }) => ({
          style: v.style,
          title: v.title,
          narrative_head: typeof v.narrative === "string" ? v.narrative.slice(0, 800) : "",
          metrics: v.metrics,
        }));
        data.verdicts = parsed.verdicts;
        data.floor_plan_summary = parsed.floor_plan
          ? {
              name: parsed.floor_plan.name,
              columns: parsed.floor_plan.columns?.length ?? 0,
              cores: parsed.floor_plan.cores?.length ?? 0,
              stairs: parsed.floor_plan.stairs?.length ?? 0,
              windows: parsed.floor_plan.windows?.length ?? 0,
              source_confidence: parsed.floor_plan.source_confidence,
            }
          : null;
      }
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
