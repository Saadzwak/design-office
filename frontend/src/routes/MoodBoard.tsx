import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  Card,
  Drawer,
  Eyebrow,
  Icon,
  Placeholder,
  Pill,
  type IconName,
} from "../components/ui";
import { useProjectState } from "../hooks/useProjectState";
import {
  fetchMoodBoardDirections,
  fetchTestFitSample,
  generateMoodBoard,
  generateMoodBoardGallery,
  generateMoodBoardItemTiles,
  generatedImageUrl,
  moodBoardPdfUrl,
  rerenderMoodBoardPdf,
  type MoodBoardDirection,
  type MoodBoardResponse,
  type VisualMoodBoardGalleryResponse,
  type VisualMoodBoardGalleryTile,
  type VisualMoodBoardItemTile,
} from "../lib/api";
import { INDUSTRY_LABEL, setMoodBoard } from "../lib/projectState";

/**
 * Iter-30B Stage 2.1 — persist the heavy per-direction mood-board state
 * to localStorage so leaving and re-entering `/moodboard` (or refreshing)
 * shows the previously-generated images instantly without re-firing the
 * backend. The structured `projectState.moodboard_runs` only stores the
 * pdf_id/palette ; the raw gallery + item-tile maps live here.
 *
 * Keyed by project_id so concurrent projects don't bleed into each
 * other. Single JSON blob (~few KB even with 3 directions × 25 tiles).
 */
type MoodBoardCachedTiles = {
  galleryByDir: Record<string, VisualMoodBoardGalleryTile[]>;
  itemTilesByDir: Record<string, Record<string, VisualMoodBoardItemTile>>;
  pdfIdByDir: Record<string, string>;
  selection: Selection | null;
  activeDirection: string;
};

function moodboardCacheKey(projectId: string): string {
  return `design-office.moodboard.tiles.${projectId}`;
}

function loadMoodBoardCache(projectId: string): MoodBoardCachedTiles | null {
  if (!projectId) return null;
  try {
    const raw = localStorage.getItem(moodboardCacheKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MoodBoardCachedTiles;
    // Defensive shape check — older payloads or partial writes shouldn't crash.
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.galleryByDir !== "object" ||
      typeof parsed.itemTilesByDir !== "object"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveMoodBoardCache(
  projectId: string,
  tiles: MoodBoardCachedTiles,
): void {
  if (!projectId) return;
  try {
    localStorage.setItem(moodboardCacheKey(projectId), JSON.stringify(tiles));
  } catch {
    /* quota exceeded — UI keeps working in-memory */
  }
}

/**
 * MoodBoard — Claude Design bundle parity (iter-18j).
 *
 * Editorial hero with the tagline quoted in Fraunces italic, a
 * Pinterest-style collage on the left (3-column CSS columns, each
 * tile tinted + rotated ±0.4°), six drill-topic cards on the right,
 * a palette strip at the bottom, and download CTAs.
 *
 * For Lumen atelier the view preloads `/moodboard-fixtures/lumen_atelier.json`
 * so the demo has rich content without paying for a curator run.
 */

type Selection = {
  header?: { tagline?: string; industry_note?: string };
  atmosphere?: {
    hero_image_theme?: string;
    palette?: Array<{ name: string; hex: string; role?: string }>;
  };
  materials?: Array<{
    category?: string;
    name: string;
    brand?: string;
    product_ref?: string;
    application?: string;
    sustainability?: string;
    swatch_hex?: string;
  }>;
  furniture?: Array<{
    category?: string;
    name: string;
    brand?: string;
    product_ref?: string;
    quantity_hint?: string;
    dimensions?: string;
  }>;
  // `planting` may ship as `{strategy, species[]}` (live Lumen fixture)
  // or as a flat array of objects / strings (older fixtures). Handle both.
  planting?:
    | {
        strategy?: string;
        species?: Array<
          | string
          | {
              name?: string;
              common_name?: string;
              latin?: string;
              light?: string;
              care?: string;
              strategy?: string;
            }
        >;
      }
    | Array<string | { common_name?: string; latin?: string; strategy?: string }>
    | string[];
  light?: {
    /** Free-form strategy paragraph (live Lumen uses this). */
    strategy?: string;
    /** "3000 K" — may be embedded in strategy instead. */
    temperature_kelvin?: string;
    fixtures?:
      | Array<{ brand?: string; name?: string; usage?: string }>
      | string[];
  };
  sources?: Array<string | { label?: string }>;
};

type DrillKey = "atmosphere" | "materials" | "furniture" | "planting" | "light" | "sources";

const DRILL_META: Array<{ k: DrillKey; title: string; icon: IconName; label: string }> = [
  { k: "atmosphere", title: "Atmosphere", icon: "feather", label: "pigments + mood" },
  { k: "materials", title: "Materials", icon: "layers", label: "finishes + fabrics" },
  { k: "furniture", title: "Furniture", icon: "armchair", label: "signature pieces" },
  { k: "planting", title: "Planting", icon: "leaf", label: "biophilic strategy" },
  { k: "light", title: "Light", icon: "sun", label: "colour temperature" },
  { k: "sources", title: "Sources", icon: "file-text", label: "citations" },
];

export default function MoodBoard() {
  const project = useProjectState();
  const navigate = useNavigate();
  // Lazy init from localStorage so the user immediately sees the
  // previously-generated mood board on remount/refresh, instead of
  // an empty state followed by a re-fetch round-trip.
  const initialCache = useMemo(
    () => loadMoodBoardCache(project.project_id),
    // Only run on first render — switching projects is handled by a
    // dedicated useEffect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [selection, setSelection] = useState<Selection | null>(
    initialCache?.selection ?? null,
  );
  const [response, setResponse] = useState<MoodBoardResponse | null>(null);
  const [drawer, setDrawer] = useState<DrillKey | null>(null);
  const [phase, setPhase] = useState<"idle" | "running" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  // Iter-30B Stage 2 — three hardcoded directions per industry. We
  // key every NanoBanana / PDF artifact by direction slug so the
  // user can flip between the three views without re-firing the
  // backend. State maps below are populated lazily as each tab is
  // opened.
  const [directions, setDirections] = useState<MoodBoardDirection[]>([]);
  const [activeDirection, setActiveDirection] = useState<string>(
    initialCache?.activeDirection ?? "",
  );
  // Per-direction artefacts (slug → state). Lazy-initialised from
  // localStorage cache so /moodboard rehydrates instantly on remount.
  const [galleryByDir, setGalleryByDir] = useState<
    Record<string, VisualMoodBoardGalleryTile[]>
  >(initialCache?.galleryByDir ?? {});
  const [galleryPhaseByDir, setGalleryPhaseByDir] = useState<
    Record<string, "idle" | "running" | "error">
  >(() => {
    // If we restored gallery tiles from cache, mark those directions
    // as already-loaded so we don't re-fire the request on mount.
    const loaded = initialCache?.galleryByDir ?? {};
    return Object.fromEntries(
      Object.keys(loaded).map((slug) => [slug, "idle" as const]),
    );
  });
  const [itemTilesByDir, setItemTilesByDir] = useState<
    Record<string, Record<string, VisualMoodBoardItemTile>>
  >(initialCache?.itemTilesByDir ?? {});
  const [itemTilesPhaseByDir, setItemTilesPhaseByDir] = useState<
    Record<string, "idle" | "running" | "ready" | "error">
  >(() => {
    const loaded = initialCache?.itemTilesByDir ?? {};
    return Object.fromEntries(
      Object.entries(loaded).map(([slug, tiles]) => [
        slug,
        Object.keys(tiles).length > 0 ? ("ready" as const) : ("idle" as const),
      ]),
    );
  });
  const [pdfIdByDir, setPdfIdByDir] = useState<Record<string, string>>(
    initialCache?.pdfIdByDir ?? {},
  );

  // Convenience views for the active direction (legacy variable
  // names so the JSX further down doesn't churn).
  const gallery = galleryByDir[activeDirection] ?? [];
  const galleryPhase = galleryPhaseByDir[activeDirection] ?? "idle";
  const itemTiles = itemTilesByDir[activeDirection] ?? {};
  const itemTilesPhase = itemTilesPhaseByDir[activeDirection] ?? "idle";

  // Iter-20a (Saad #6, #9) : the Lumen fixture used to preload for
  // every project, making a fresh project look like it already had a
  // curated mood board. Now only Lumen (by project_id / client name)
  // gets the fixture preload ; every other project hits the "Generate
  // mood board" empty state.
  useEffect(() => {
    // Iter-30B dev affordance: `/moodboard?fixture=lumen` force-loads
    // the bundled Lumen fixture even on a non-Lumen project, so the
    // mood-board route can be visually iterated against rich content
    // without paying for a curator run. Gated on `import.meta.env.DEV`
    // so it lives only in the Vite dev server — production builds
    // don't carry the backdoor. (Vite tree-shakes the literal `false`
    // branch out of the bundle entirely.) Documented in
    // docs/MOODBOARD_REFONTE.md §process notes.
    const params = new URLSearchParams(window.location.search);
    const forceFixture = import.meta.env.DEV && params.get("fixture") === "lumen";
    const isLumen =
      forceFixture ||
      (project.project_id || "").toLowerCase().startsWith("lumen") ||
      (project.client.name || "").toLowerCase() === "lumen";
    if (!isLumen) return;
    const ac = new AbortController();
    fetch("/moodboard-fixtures/lumen_atelier.json", { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Selection | null) => {
        if (data) setSelection(data);
      })
      .catch(() => null);
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If projectState already has a mood-board run we bias the UI to
  // "done" without re-fetching.
  useEffect(() => {
    if (project.mood_board?.pdf_id && !response) {
      setResponse({
        pdf_id: project.mood_board.pdf_id,
        selection: {},
        tokens: { input: 0, output: 0 },
        duration_ms: 0,
      });
    }
  }, [project.mood_board, response]);

  // Iter-30B Stage 2.1 — persist the heavy per-direction tile maps so
  // navigating away or refreshing rehydrates the previously-generated
  // mood board instantly. Saves on every change to the maps; load
  // happens once at mount via the lazy initial state above.
  useEffect(() => {
    if (!project.project_id) return;
    saveMoodBoardCache(project.project_id, {
      galleryByDir,
      itemTilesByDir,
      pdfIdByDir,
      selection,
      activeDirection,
    });
  }, [
    project.project_id,
    galleryByDir,
    itemTilesByDir,
    pdfIdByDir,
    selection,
    activeDirection,
  ]);

  // If the active project_id changes mid-session (rare, e.g. user
  // creates a new project from the dashboard while /moodboard is
  // mounted), reload the cache for the new project and reset the in-
  // memory maps to that project's snapshot.
  useEffect(() => {
    const cached = loadMoodBoardCache(project.project_id);
    if (!cached) return;
    setSelection(cached.selection);
    setActiveDirection((prev) => prev || cached.activeDirection || "");
    setGalleryByDir(cached.galleryByDir);
    setItemTilesByDir(cached.itemTilesByDir);
    setPdfIdByDir(cached.pdfIdByDir);
    setGalleryPhaseByDir(
      Object.fromEntries(
        Object.keys(cached.galleryByDir).map((slug) => [slug, "idle" as const]),
      ),
    );
    setItemTilesPhaseByDir(
      Object.fromEntries(
        Object.entries(cached.itemTilesByDir).map(([slug, tiles]) => [
          slug,
          Object.keys(tiles).length > 0 ? ("ready" as const) : ("idle" as const),
        ]),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.project_id]);

  // Active-direction palette REPLACES the curator's atmosphere
  // palette in the displayed swatch strip and labels. Keeps Stage 2
  // visual identity consistent between gallery (which uses the
  // overlay) and the printed palette block at the bottom of the page.
  const activeDirectionObj = useMemo(
    () => directions.find((d) => d.slug === activeDirection) ?? null,
    [directions, activeDirection],
  );
  const palette = useMemo(() => {
    if (activeDirectionObj?.palette_overlay?.length) {
      return activeDirectionObj.palette_overlay;
    }
    return selection?.atmosphere?.palette ?? [];
  }, [activeDirectionObj, selection]);

  // Iter-30B Stage 2 — fetch the 3 directions for the project's
  // industry once, on mount. Defaults to `tech_startup` if no
  // industry is set on the project yet.
  useEffect(() => {
    const ac = new AbortController();
    fetchMoodBoardDirections(
      project.client.industry || "tech_startup",
      ac.signal,
    )
      .then((resp) => {
        if (resp.directions.length === 0) return;
        setDirections(resp.directions);
        setActiveDirection((prev) => prev || resp.directions[0].slug);
      })
      .catch(() => null);
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.client.industry]);

  // Iter-30B Stage 2 — gallery + item-tiles + PDF rerender keyed
  // by direction. Lazy: fires for a direction only when its tab is
  // first opened. Idempotent: re-clicking a loaded tab is a no-op.
  const runGalleryFor = async (directionSlug: string) => {
    if (!selection) return;
    if (galleryPhaseByDir[directionSlug] === "running") return;
    if ((galleryByDir[directionSlug] ?? []).length > 0) return;

    setGalleryPhaseByDir((p) => ({ ...p, [directionSlug]: "running" }));
    try {
      let variant =
        project.testfit?.variants?.find(
          (v) => v.style === project.testfit?.retained_style,
        ) ?? project.testfit?.variants?.[0];
      if (!variant) {
        const sample = await fetchTestFitSample();
        variant =
          sample.variants.find((v) => v.style === "atelier") ??
          sample.variants[0];
      }
      if (!variant) throw new Error("No variant available");
      const resp: VisualMoodBoardGalleryResponse =
        await generateMoodBoardGallery({
          client_name: project.client.name,
          industry: project.client.industry,
          variant,
          mood_board_selection: selection as Record<string, unknown>,
          aspect_ratio: "3:2",
          direction: directionSlug,
        });
      setGalleryByDir((g) => ({ ...g, [directionSlug]: resp.tiles }));
      setGalleryPhaseByDir((p) => ({ ...p, [directionSlug]: "idle" }));

      // Per-item tiles + final PDF rerender for this direction.
      void (async () => {
        setItemTilesPhaseByDir((p) => ({
          ...p,
          [directionSlug]: "running",
        }));
        try {
          const items = await generateMoodBoardItemTiles({
            client_name: project.client.name,
            industry: project.client.industry,
            variant: variant!,
            mood_board_selection: selection as Record<string, unknown>,
            aspect_ratio: "4:3",
            direction: directionSlug,
          });
          const byKey: Record<string, VisualMoodBoardItemTile> = {};
          const itemIdsForPdf: Record<string, string> = {};
          for (const t of items.tiles) {
            byKey[t.item_key] = t;
            itemIdsForPdf[t.item_key] = t.visual_image_id;
          }
          setItemTilesByDir((m) => ({ ...m, [directionSlug]: byKey }));
          setItemTilesPhaseByDir((p) => ({
            ...p,
            [directionSlug]: "ready",
          }));

          // Final PDF rerender for THIS direction — palette overlay,
          // gallery tiles, and per-item product photos all baked in.
          try {
            const galleryIds: Record<string, string> = {};
            for (const t of resp.tiles)
              galleryIds[t.label] = t.visual_image_id;
            const rerender2 = await rerenderMoodBoardPdf({
              client: {
                name: project.client.name,
                industry: project.client.industry,
                logo_data_url: project.client.logo_data_url ?? null,
              },
              variant: variant!,
              selection: selection as Record<string, unknown>,
              gallery_tile_ids: galleryIds,
              item_tile_ids: itemIdsForPdf,
              direction: directionSlug,
            });
            if (rerender2.pdf_id) {
              setPdfIdByDir((m) => ({
                ...m,
                [directionSlug]: rerender2.pdf_id,
              }));
              // Mirror the active direction's PDF into project state
              // so chrome download buttons keep working in legacy
              // call sites.
              if (directionSlug === activeDirection) {
                const hexes = (
                  activeDirectionObj?.palette_overlay ??
                  selection.atmosphere?.palette ??
                  []
                )
                  .map((p) => p.hex)
                  .filter((s): s is string => typeof s === "string");
                setMoodBoard({
                  pdf_id: rerender2.pdf_id,
                  palette: hexes,
                  selection: selection as Record<string, unknown>,
                });
                setResponse((prev) =>
                  prev ? { ...prev, pdf_id: rerender2.pdf_id } : prev,
                );
              }
            }
          } catch (rerenderErr) {
            // eslint-disable-next-line no-console
            console.warn(
              `Mood-board PDF rerender failed for ${directionSlug}`,
              rerenderErr,
            );
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(
            `Mood-board item-tiles failed for ${directionSlug}`,
            err,
          );
          setItemTilesPhaseByDir((p) => ({
            ...p,
            [directionSlug]: "error",
          }));
        }
      })();
    } catch (err) {
      // Non-fatal: the page still renders Placeholder tiles for
      // this direction. Engineering can see the failure in the
      // console; users can pick another tab.
      // eslint-disable-next-line no-console
      console.warn(`Mood-board gallery failed for ${directionSlug}`, err);
      setGalleryPhaseByDir((p) => ({ ...p, [directionSlug]: "error" }));
    }
  };

  useEffect(() => {
    // Auto-fire the active direction's gallery when both the
    // selection and the directions list are ready, OR when the
    // user switches tabs to a direction not yet loaded. Lazy by
    // design: untouched tabs cost nothing.
    if (
      selection &&
      activeDirection &&
      (galleryByDir[activeDirection] ?? []).length === 0 &&
      (galleryPhaseByDir[activeDirection] ?? "idle") === "idle"
    ) {
      runGalleryFor(activeDirection);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, activeDirection]);

  // When the user switches tabs, mirror that direction's PDF (if
  // already rendered) into projectState so the download buttons
  // and the legacy `response.pdf_id` path keep producing the
  // direction-correct file.
  useEffect(() => {
    const pdfId = pdfIdByDir[activeDirection];
    if (!pdfId || !selection) return;
    const hexes = (
      activeDirectionObj?.palette_overlay ??
      selection.atmosphere?.palette ??
      []
    )
      .map((p) => p.hex)
      .filter((s): s is string => typeof s === "string");
    setMoodBoard({
      pdf_id: pdfId,
      palette: hexes,
      selection: selection as Record<string, unknown>,
    });
    setResponse((prev) => (prev ? { ...prev, pdf_id: pdfId } : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDirection, pdfIdByDir]);

  const tiles = useMemo(() => buildTiles(selection), [selection]);
  // Iter-30B Stage 2 — the active direction's tagline takes
  // precedence over the curator's. Each tab shows its own pull-quote.
  const tagline =
    activeDirectionObj?.tagline ||
    selection?.header?.tagline ||
    "An atelier of focus on the north light, a bright social forge on the south.";

  const run = async () => {
    setPhase("running");
    setErrorMsg("");
    try {
      let variant = project.testfit?.variants?.find(
        (v) => v.style === project.testfit?.retained_style,
      );
      if (!variant) {
        // Fall back to the saved sample so we always have a variant.
        const sample = await fetchTestFitSample();
        variant = sample.variants.find((v) => v.style === "atelier") ??
          sample.variants[0];
      }
      if (!variant) {
        throw new Error("No variant available — run Test fit first.");
      }
      const resp = await generateMoodBoard({
        client: {
          name: project.client.name,
          industry: project.client.industry,
          logo_data_url: project.client.logo_data_url ?? null,
        },
        brief: project.brief,
        programme_markdown: project.programme.markdown,
        variant,
      });
      setResponse(resp);
      setSelection(resp.selection as Selection);
      const hexes = (
        (resp.selection as Selection)?.atmosphere?.palette ?? []
      )
        .map((p) => p.hex)
        .filter((s): s is string => typeof s === "string");
      // iter-20e (Saad #19-#22) : persist the full selection JSON so
      // Justify's PPT renderer can reuse tagline / palette / materials
      // / furniture verbatim — no re-curation needed.
      setMoodBoard({
        pdf_id: resp.pdf_id,
        palette: hexes,
        selection: resp.selection as Record<string, unknown>,
      });
      setPhase("idle");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  };

  return (
    <div className="space-y-12 pb-8">
      {/* Hero */}
      <header>
        <Eyebrow style={{ marginBottom: 12 }}>
          III · MOOD BOARD · {(project.testfit?.retained_style ?? "atelier").toUpperCase()}
        </Eyebrow>
        <h1
          className="m-0 font-display italic"
          style={{
            fontSize: 56,
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            maxWidth: 1200,
            fontWeight: 300,
            fontVariationSettings: '"opsz" 144, "wght" 300, "SOFT" 100',
          }}
        >
          "{tagline}"
        </h1>
        <div className="mt-4 flex flex-wrap gap-2">
          <Pill>
            {INDUSTRY_LABEL[project.client.industry]}
          </Pill>
          <Pill>{palette.length} pigments</Pill>
          <Pill>{selection?.materials?.length ?? 0} materials</Pill>
          <Pill>{selection?.furniture?.length ?? 0} signature pieces</Pill>
        </div>

        {/* Iter-30B Stage 2 — three direction tabs. Each tab shows
            the direction name + a tiny dot in its dominant accent
            colour (last palette entry, falling back to the first).
            Switching tabs lazily fires gallery + items + rerender
            for that direction; already-loaded tabs are instant. */}
        {directions.length > 0 && selection && (
          <div className="mt-7 flex flex-wrap items-center gap-2">
            <span className="mono text-[10px] uppercase tracking-[0.18em] text-mist-500">
              Direction
            </span>
            {directions.map((d) => {
              const isActive = d.slug === activeDirection;
              const dot =
                d.palette_overlay.find((p) => p.role === "accent")?.hex ??
                d.palette_overlay.find((p) => p.role === "highlight")?.hex ??
                d.palette_overlay[d.palette_overlay.length - 1]?.hex ??
                d.palette_overlay[0]?.hex ??
                "#2F4A3F";
              const phaseLabel = (() => {
                const gp = galleryPhaseByDir[d.slug] ?? "idle";
                const ip = itemTilesPhaseByDir[d.slug] ?? "idle";
                if (gp === "running" || ip === "running") return "loading…";
                if (gp === "error" || ip === "error") return "error";
                if (ip === "ready") return "ready";
                return "";
              })();
              return (
                <button
                  key={d.slug}
                  type="button"
                  onClick={() => setActiveDirection(d.slug)}
                  className="group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] transition-all"
                  style={{
                    borderColor: isActive ? "var(--ink)" : "var(--hairline)",
                    background: isActive
                      ? "var(--canvas-alt)"
                      : "var(--raised, white)",
                    color: isActive ? "var(--ink)" : "var(--mist-600)",
                    fontWeight: isActive ? 500 : 400,
                  }}
                  title={d.tagline}
                >
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: dot, flex: "0 0 auto" }}
                  />
                  <span
                    className="font-display"
                    style={{
                      fontVariationSettings:
                        '"opsz" 72, "wght" 460, "SOFT" 60',
                      fontSize: 13,
                    }}
                  >
                    {d.name}
                  </span>
                  {phaseLabel && (
                    <span className="mono text-[9px] uppercase tracking-[0.14em] text-mist-500">
                      · {phaseLabel}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* Iter-20a (Saad #9) : explicit Generate CTA when there's no
          selection yet AND no running state. Before, a fresh project
          landed on this page with placeholder tiles and no action —
          user couldn't tell what to do. */}
      {!selection && phase !== "running" && phase !== "error" && (
        <Card>
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1">
              <Eyebrow style={{ marginBottom: 6 }}>NO MOOD BOARD YET</Eyebrow>
              <p className="m-0 max-w-xl text-[13px] leading-relaxed text-mist-600">
                Run the <em>Mood Board Curator</em> agent to compose the
                palette, materials, furniture, planting and light for this
                project's retained variant. Takes ~35 s.
              </p>
            </div>
            <button
              onClick={run}
              className="btn-primary"
            >
              <Icon name="sparkles" size={14} /> Generate mood board
            </button>
          </div>
        </Card>
      )}

      {phase === "running" && (
        <Card>
          <div className="flex items-center gap-4">
            <span
              className="inline-block h-3 w-3 animate-[dot-pulse_1.1s_var(--ease)_infinite] rounded-full"
              style={{ background: "var(--forest)" }}
            />
            <div>
              <Eyebrow style={{ marginBottom: 4 }}>OPUS · CURATING</Eyebrow>
              <p className="text-[13px] text-mist-600">
                Composing palette, materials, furniture, planting and light
                — usually 30-45 seconds.
              </p>
            </div>
          </div>
        </Card>
      )}

      {phase === "error" && (
        <Card>
          <Eyebrow>ERROR</Eyebrow>
          <p className="mt-2 text-[13px] text-clay">{errorMsg}</p>
          <button className="btn-ghost btn-sm mt-3" onClick={run}>
            Retry
          </button>
        </Card>
      )}

      {/* Collage + drill topics */}
      <section
        className="grid gap-12"
        style={{ gridTemplateColumns: "1.4fr 1fr" }}
      >
        {/* Pinterest collage — iter-20d mixes the NanoBanana gallery
            tiles (real images at the top of the stack) with the
            tinted material-swatch placeholders below. */}
        <div style={{ columnCount: 3, columnGap: 14 }}>
          {gallery.map((g, i) => (
            <div
              key={`g-${g.visual_image_id}`}
              className="shadow-soft"
              style={{
                breakInside: "avoid",
                marginBottom: 14,
                transform: `rotate(${(i % 3 - 1) * 0.4}deg)`,
                background: "white",
                padding: 6,
                borderRadius: 4,
              }}
            >
              <img
                src={generatedImageUrl(g.visual_image_id)}
                alt={`Mood board · ${g.label}`}
                className="block w-full rounded"
                style={{ aspectRatio: "3/2", objectFit: "cover" }}
                loading="lazy"
              />
              <div className="mono mt-1.5 text-center text-[9px] uppercase tracking-[0.12em] text-mist-500">
                {g.label}
              </div>
            </div>
          ))}
          {galleryPhase === "running" && gallery.length === 0 && (
            <div
              className="shadow-soft"
              style={{
                breakInside: "avoid",
                marginBottom: 14,
                background: "white",
                padding: 6,
                borderRadius: 4,
              }}
            >
              <div
                className="flex items-center justify-center rounded"
                style={{
                  aspectRatio: "3/2",
                  background: "var(--canvas-alt)",
                }}
              >
                <div className="text-center">
                  <div
                    className="mx-auto mb-2 h-2 w-2 animate-[dot-pulse_1.1s_var(--ease)_infinite] rounded-full"
                    style={{ background: "var(--forest)" }}
                  />
                  <div className="mono text-[9px] uppercase tracking-[0.12em] text-mist-500">
                    NanoBanana · 4 tiles composing…
                  </div>
                </div>
              </div>
            </div>
          )}
          {tiles.map((t, i) => {
            const resolved = t.itemKey ? itemTiles[t.itemKey] : undefined;
            const stillLoading =
              !resolved && itemTilesPhase === "running" && !!t.itemKey;
            return (
              <div
                key={`p-${i}`}
                className="shadow-soft group"
                style={{
                  breakInside: "avoid",
                  marginBottom: 14,
                  transform: `rotate(${((i + gallery.length) % 3 - 1) * 0.4}deg)`,
                  background: "white",
                  padding: 6,
                  borderRadius: 4,
                  transition: "transform 250ms cubic-bezier(0.22, 1, 0.36, 1)",
                  opacity: stillLoading ? 0.55 : 1,
                }}
              >
                {resolved ? (
                  <>
                    <img
                      src={generatedImageUrl(resolved.visual_image_id)}
                      alt={resolved.label}
                      className="block w-full rounded animate-fade-rise"
                      style={{
                        aspectRatio: t.ratio.replace("/", " / "),
                        objectFit: "cover",
                      }}
                      loading="lazy"
                    />
                    <div className="mono mt-1.5 text-center text-[9px] uppercase tracking-[0.12em] text-mist-500">
                      {resolved.label}
                    </div>
                  </>
                ) : (
                  <Placeholder tag={t.tag} tint={t.tint} ratio={t.ratio} />
                )}
              </div>
            );
          })}
        </div>

        {/* Drill topic cards */}
        <div className="flex flex-col gap-3.5">
          {DRILL_META.map((c) => (
            <Card
              key={c.k}
              as="button"
              onClick={() => setDrawer(c.k)}
              className="!p-5 !flex items-center gap-4"
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-md"
                style={{
                  background: "var(--forest-ghost)",
                  color: "var(--forest)",
                }}
              >
                <Icon name={c.icon} size={18} />
              </div>
              <div className="flex-1 text-left">
                <div
                  className="font-display"
                  style={{
                    fontSize: 22,
                    fontWeight: 400,
                    fontVariationSettings: '"opsz" 72, "wght" 440, "SOFT" 100',
                  }}
                >
                  {c.title}
                </div>
                <div className="text-[13px] text-mist-600">
                  {summariseTopic(c.k, selection)}
                </div>
              </div>
              <Icon
                name="chevron-right"
                size={16}
                style={{ color: "var(--mist-400)" }}
              />
            </Card>
          ))}
        </div>
      </section>

      {/* Palette strip */}
      {palette.length > 0 && (
        <section>
          <Eyebrow style={{ marginBottom: 14 }}>
            PALETTE · {palette.length} PIGMENTS
          </Eyebrow>
          <div
            className="grid overflow-hidden rounded-[10px] border border-mist-200"
            style={{ gridTemplateColumns: `repeat(${palette.length}, 1fr)` }}
          >
            {palette.map((p) => {
              const isLight = isLightColour(p.hex);
              return (
                <div
                  key={p.name}
                  className="px-5 pb-4 pt-9"
                  style={{
                    background: p.hex,
                    color: isLight ? "var(--ink)" : "white",
                  }}
                >
                  <div
                    className="font-display italic"
                    style={{
                      fontSize: 20,
                      fontWeight: 400,
                      fontVariationSettings:
                        '"opsz" 96, "wght" 420, "SOFT" 100',
                    }}
                  >
                    {p.name}
                  </div>
                  <div className="mono mt-1 opacity-75">
                    {p.hex.toUpperCase()}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* CTAs */}
      <div className="flex flex-wrap gap-3">
        {/* Iter-30B Stage 2 — prefer the active direction's PDF id
            over the legacy `response.pdf_id` so each tab downloads
            its own A3. Falls back to the legacy path when no
            direction has rendered yet. */}
        {(pdfIdByDir[activeDirection] || response?.pdf_id) ? (
          <a
            href={moodBoardPdfUrl(
              pdfIdByDir[activeDirection] || (response?.pdf_id ?? ""),
            )}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost"
            title={
              activeDirectionObj
                ? `Download A3 — ${activeDirectionObj.name}`
                : "Download A3 PDF"
            }
          >
            <Icon name="download" size={12} />{" "}
            {activeDirectionObj
              ? `Download A3 — ${activeDirectionObj.name}`
              : "Download A3 PDF"}
          </a>
        ) : (
          <button
            onClick={run}
            disabled={phase === "running"}
            className="btn-ghost"
          >
            <Icon name="sparkles" size={12} />
            {phase === "running" ? "Composing…" : "Generate A3 PDF"}
          </button>
        )}
        <button
          onClick={() => navigate("/justify")}
          className="btn-ghost"
          title="Open Justify — compose the client deck (PPTX, includes this mood board)"
        >
          <Icon name="presentation" size={12} /> Compose client deck
        </button>
      </div>

      {/* Topic drawer */}
      <Drawer open={!!drawer} onClose={() => setDrawer(null)} width={560}>
        {drawer && (
          <MoodDrawerContent
            k={drawer}
            selection={selection}
            itemTiles={itemTiles}
            onClose={() => setDrawer(null)}
          />
        )}
      </Drawer>
    </div>
  );
}

// ─────────────────────────────────────── helpers ──

/**
 * Slugify identical to backend `_slug()` in
 * `app/surfaces/visual_moodboard.py` — ASCII `[a-z0-9]` + hyphens.
 *
 * Iter-30B note: this is **intentionally ASCII-restricted** to match
 * the backend exactly. Python's `str.isalnum()` accepts Unicode
 * letters (`é`, `ñ`, `ç`…) but JS `/[a-z0-9]/` does not — we picked
 * the JS-compatible subset so accented client / brand names produce
 * the same key on both sides and the `itemKey → image` lookup
 * cannot silently miss. If you ever change one, change the other.
 */
function slugifyItemKey(s: string): string {
  if (!s) return "";
  let last = "-";
  let out = "";
  for (const ch of s.toLowerCase()) {
    if (/[a-z0-9]/.test(ch)) {
      out += ch;
      last = ch;
    } else if (last !== "-") {
      out += "-";
      last = "-";
    }
  }
  return out.replace(/^-+|-+$/g, "");
}

/**
 * Per-category item-key helpers — single source of truth used by both
 * the main collage (`buildTiles`) and the drawer panels (so the
 * Materials / Furniture / Planting / Light tabs can look up the same
 * NanoBanana photographs that appear in the collage).
 *
 * MUST stay in lock-step with the backend `_slug()` in
 * `app.surfaces.visual_moodboard` — same slug → same cache key →
 * same image.
 */
export function keyForMaterial(m: {
  material?: string;
  name?: string;
  finish?: string;
}): string {
  const matName = m.material ?? m.name ?? "";
  if (!matName) return "";
  const finish = m.finish ?? "";
  return `mat:${slugifyItemKey(matName)}${finish ? `:${slugifyItemKey(finish)}` : ""}`;
}

export function keyForFurniture(f: {
  product_id?: string;
  brand?: string;
  name?: string;
}): string {
  if (f.product_id) return `fur:${slugifyItemKey(f.product_id)}`;
  const parts = [slugifyItemKey(f.brand ?? ""), slugifyItemKey(f.name ?? "")].filter(Boolean);
  return parts.length ? `fur:${parts.join("-")}` : "";
}

export function keyForLight(fx: {
  brand?: string;
  model?: string;
  name?: string;
}): string {
  const brand = fx.brand ?? "";
  const model = fx.model ?? fx.name ?? "";
  const parts = [slugifyItemKey(brand), slugifyItemKey(model)].filter(Boolean);
  return parts.length ? `lig:${parts.join("-")}` : "";
}

export function keyForPlant(p: { name?: string; latin?: string } | string): string {
  const nm = typeof p === "string" ? p : p.name ?? p.latin ?? "";
  return nm ? `pla:${slugifyItemKey(nm)}` : "";
}

type CollageTile = {
  tag: string;
  tint: string;
  ratio: string;
  /** Canonical item_key matching the backend — used for image lookup. */
  itemKey?: string;
  category?: "material" | "furniture" | "plant" | "light";
};

function buildTiles(selection: Selection | null): CollageTile[] {
  if (!selection) {
    // Fallback fixture tiles (no selection yet) — no item_key, the
    // collage just shows hatched <Placeholder> for the empty state.
    return [
      { tag: "NORTH LIGHT", tint: "#B89068", ratio: "4/5" },
      { tag: "OAK JOINERY", tint: "#8B6B44", ratio: "1/1" },
      { tag: "LINEN & WOOL", tint: "#C9B79C", ratio: "3/4" },
      { tag: "BRASS DETAIL", tint: "#A88B5B", ratio: "1/1" },
      { tag: "BIOPHILIC CORE", tint: "#6B8F7F", ratio: "4/5" },
      { tag: "PENDANT LIGHT", tint: "#2A2E28", ratio: "3/4" },
      { tag: "SOCIAL STAIR", tint: "#3C5D50", ratio: "4/3" },
      { tag: "WOOD-WOOL ACOUSTIC", tint: "#D4C3A3", ratio: "1/1" },
      { tag: "CLIENT LOUNGE", tint: "#8A7555", ratio: "3/4" },
      { tag: "TERRACE", tint: "#6B8F7F", ratio: "4/5" },
    ];
  }
  const tiles: CollageTile[] = [];
  const ratios = ["4/5", "1/1", "3/4", "1/1", "4/5", "3/4", "4/3", "1/1", "3/4", "4/5"];
  // Materials first (they carry the richest swatches).
  for (const m of selection.materials ?? []) {
    if (tiles.length >= 12) break;
    const matName = (m as { material?: string }).material ?? m.name ?? "";
    tiles.push({
      tag: (matName || m.name || "MATERIAL").toUpperCase(),
      tint: m.swatch_hex ?? "#A89775",
      ratio: ratios[tiles.length % ratios.length],
      itemKey: keyForMaterial(m as { material?: string; name?: string; finish?: string }),
      category: "material",
    });
  }
  // Furniture next.
  for (const f of selection.furniture ?? []) {
    if (tiles.length >= 16) break;
    const key = keyForFurniture(f as { product_id?: string; brand?: string; name?: string });
    tiles.push({
      tag: (f.name || "PIECE").toUpperCase(),
      tint: "#2A2E28",
      ratio: ratios[tiles.length % ratios.length],
      itemKey: key || undefined,
      category: "furniture",
    });
  }
  // Light fixtures + plants seeded after, so the collage stays full
  // and visually varied even when the curator emits a thin selection.
  const lightFixtures = (() => {
    const lt = selection.light;
    if (!lt) return [] as Array<{ brand?: string; model?: string; name?: string }>;
    const fx = (lt as { fixtures?: unknown }).fixtures;
    if (!Array.isArray(fx)) return [];
    return fx.filter((x): x is { brand?: string; model?: string; name?: string } =>
      typeof x === "object" && x !== null,
    );
  })();
  for (const fx of lightFixtures) {
    if (tiles.length >= 18) break;
    const key = keyForLight(fx);
    const brand = fx.brand ?? "";
    const model = fx.model ?? fx.name ?? "";
    tiles.push({
      tag: `${brand} ${model}`.trim().toUpperCase() || "PENDANT",
      tint: "#3C5D50",
      ratio: ratios[tiles.length % ratios.length],
      itemKey: key || undefined,
      category: "light",
    });
  }
  const plantSpecies = (() => {
    const p = selection.planting;
    if (!p) return [] as Array<{ name?: string; latin?: string }>;
    const sp = (p as { species?: unknown }).species;
    if (!Array.isArray(sp)) return [];
    return sp.flatMap((s) => {
      if (typeof s === "string") return [{ name: s }];
      if (s && typeof s === "object")
        return [s as { name?: string; latin?: string }];
      return [];
    });
  })();
  for (const sp of plantSpecies) {
    if (tiles.length >= 20) break;
    const nm = sp.name ?? sp.latin ?? "";
    if (!nm) continue;
    tiles.push({
      tag: nm.toUpperCase(),
      tint: "#6B8F7F",
      ratio: ratios[tiles.length % ratios.length],
      itemKey: keyForPlant(sp),
      category: "plant",
    });
  }
  return tiles.slice(0, 14);
}

function summariseTopic(k: DrillKey, s: Selection | null): string {
  if (!s) return "—";
  switch (k) {
    case "atmosphere": {
      const n = s.atmosphere?.palette?.length ?? 0;
      return `${n} pigments · ${s.header?.industry_note?.split(",")[0] ?? "industry profile"}`.toLowerCase();
    }
    case "materials": {
      const n = s.materials?.length ?? 0;
      const brands = new Set((s.materials ?? []).map((m) => m.brand).filter(Boolean));
      return `${n} finishes · ${[...brands].slice(0, 3).join(" · ") || "sourced"}`;
    }
    case "furniture": {
      const n = s.furniture?.length ?? 0;
      const brands = new Set((s.furniture ?? []).map((f) => f.brand).filter(Boolean));
      return `${n} pieces · ${[...brands].slice(0, 3).join(" · ") || "signature"}`;
    }
    case "planting": {
      const count = countPlantings(s.planting);
      if (count === 0) return "biophilic strategy";
      return `${count} species · biophilic strategy`;
    }
    case "light": {
      const light = s.light ?? {};
      const kelvin =
        light.temperature_kelvin ||
        (light.strategy?.match(/(\d{3,4}\s?K)/)?.[1] ?? "");
      const fixtureCount = Array.isArray(light.fixtures) ? light.fixtures.length : 0;
      if (kelvin && fixtureCount > 0) return `${kelvin} · ${fixtureCount} fixtures`;
      if (kelvin) return `${kelvin} · colour temperature strategy`;
      if (fixtureCount) return `${fixtureCount} fixtures · kelvin strategy`;
      return "colour temperature & fixture strategy";
    }
    case "sources":
      return `${s.sources?.length ?? 0} citations · MCP + adjacency rules`;
  }
}

function countPlantings(p: Selection["planting"]): number {
  if (!p) return 0;
  if (Array.isArray(p)) return p.length;
  if (typeof p === "object" && Array.isArray(p.species)) return p.species.length;
  return 0;
}

function plantingEntries(
  p: Selection["planting"],
): Array<{ label: string; strategy?: string }> {
  if (!p) return [];
  if (Array.isArray(p)) {
    return p.map((item) =>
      typeof item === "string"
        ? { label: item }
        : {
            label:
              (item.common_name ?? "") +
              (item.latin ? ` — ${item.latin}` : "") ||
              item.common_name ||
              "—",
            strategy: item.strategy,
          },
    );
  }
  const list = Array.isArray(p.species) ? p.species : [];
  return list.map((item) =>
    typeof item === "string"
      ? { label: item }
      : {
          label:
            (item.common_name ?? item.name ?? "") +
              ((item as { latin?: string }).latin
                ? ` — ${(item as { latin?: string }).latin}`
                : "") || "—",
          strategy: (item as { strategy?: string }).strategy,
        },
  );
}

function isLightColour(hex: string): boolean {
  const s = hex.replace("#", "");
  if (s.length !== 6) return false;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  // Luma per Rec 601.
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.55;
}

// ─────────────────────────────────────── drawer ──

function MoodDrawerContent({
  k,
  selection,
  itemTiles,
  onClose,
}: {
  k: DrillKey;
  selection: Selection | null;
  itemTiles: Record<string, VisualMoodBoardItemTile>;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-9">
      <div className="mb-6 flex justify-between">
        <Eyebrow>MOOD BOARD · {k.toUpperCase()}</Eyebrow>
        <button onClick={onClose} className="text-mist-500 hover:text-ink">
          <Icon name="x" size={18} />
        </button>
      </div>

      {k === "atmosphere" && <AtmospherePanel selection={selection} />}
      {k === "materials" && (
        <MaterialsPanel selection={selection} itemTiles={itemTiles} />
      )}
      {k === "furniture" && (
        <FurniturePanel selection={selection} itemTiles={itemTiles} />
      )}
      {k === "planting" && (
        <PlantingPanel selection={selection} itemTiles={itemTiles} />
      )}
      {k === "light" && (
        <LightPanel selection={selection} itemTiles={itemTiles} />
      )}
      {k === "sources" && <SourcesPanel selection={selection} />}
    </div>
  );
}

function AtmospherePanel({ selection }: { selection: Selection | null }) {
  const palette = selection?.atmosphere?.palette ?? [];
  return (
    <div>
      <p
        className="font-display"
        style={{
          fontSize: 20,
          color: "var(--mist-700)",
          fontVariationSettings: '"opsz" 72, "wght" 380, "SOFT" 100',
        }}
      >
        {selection?.atmosphere?.hero_image_theme ??
          "A warm-ivory canvas held by forest ink. Sand neutrals soften transitions; sun glints punctuate ritual moments."}
      </p>
      <div
        className="mt-5 grid gap-2"
        style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
      >
        {palette.map((p) => (
          <div
            key={p.name}
            className="h-20 rounded-md"
            style={{ background: p.hex }}
          />
        ))}
      </div>
    </div>
  );
}

function MaterialsPanel({
  selection,
  itemTiles,
}: {
  selection: Selection | null;
  itemTiles: Record<string, VisualMoodBoardItemTile>;
}) {
  const items = selection?.materials ?? [];
  return (
    <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
      {items.map((m, i) => {
        const key = keyForMaterial(m as { material?: string; name?: string; finish?: string });
        const resolved = key ? itemTiles[key] : undefined;
        return (
          <div key={i}>
            {resolved ? (
              <img
                src={generatedImageUrl(resolved.visual_image_id)}
                alt={resolved.label || m.name || "material"}
                className="block w-full rounded animate-fade-rise"
                style={{ aspectRatio: "1 / 1", objectFit: "cover" }}
                loading="lazy"
              />
            ) : (
              <Placeholder
                tag={(m.name ?? "MATERIAL").toUpperCase()}
                tint={m.swatch_hex}
                ratio="1/1"
              />
            )}
            <div className="mt-2 text-[13px]">{m.name}</div>
            <div className="mono text-[10px] text-mist-500">
              SOURCE · {(m.brand ?? "—").toUpperCase()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FurniturePanel({
  selection,
  itemTiles,
}: {
  selection: Selection | null;
  itemTiles: Record<string, VisualMoodBoardItemTile>;
}) {
  const items = selection?.furniture ?? [];
  return (
    <div className="flex flex-col gap-4">
      {items.map((f, i) => {
        const key = keyForFurniture(f as { product_id?: string; brand?: string; name?: string });
        const resolved = key ? itemTiles[key] : undefined;
        return (
          <div
            key={i}
            className="flex gap-3.5 rounded-lg border border-mist-100 p-3.5"
          >
            <div className="w-[120px] shrink-0">
              {resolved ? (
                <img
                  src={generatedImageUrl(resolved.visual_image_id)}
                  alt={resolved.label || f.name || "furniture"}
                  className="block w-full rounded animate-fade-rise"
                  style={{ aspectRatio: "1 / 1", objectFit: "cover" }}
                  loading="lazy"
                />
              ) : (
                <Placeholder tag="PRODUCT" ratio="1/1" />
              )}
            </div>
            <div className="flex-1">
              <div className="mono text-mist-500">
                {(f.brand ?? "BRAND").toUpperCase()}
              </div>
              <div
                className="font-display"
                style={{
                  fontSize: 20,
                  fontVariationSettings: '"opsz" 72, "wght" 440, "SOFT" 100',
                }}
              >
                {f.name}
              </div>
              <div className="mono mt-1.5 text-mist-600">
                {f.dimensions ?? f.product_ref ?? ""}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlantingPanel({
  selection,
  itemTiles,
}: {
  selection: Selection | null;
  itemTiles: Record<string, VisualMoodBoardItemTile>;
}) {
  const items = plantingEntries(selection?.planting);
  const strategy =
    selection?.planting && !Array.isArray(selection.planting)
      ? selection.planting.strategy
      : undefined;
  return (
    <div className="flex flex-col gap-3">
      {strategy && (
        <p
          className="m-0 font-display"
          style={{
            fontSize: 16,
            color: "var(--mist-700)",
            lineHeight: 1.5,
            fontVariationSettings: '"opsz" 72, "wght" 380, "SOFT" 100',
          }}
        >
          {strategy}
        </p>
      )}
      <div className="flex flex-col gap-2.5">
        {items.map((p, i) => {
          const key = keyForPlant(p.label || "");
          const resolved = key ? itemTiles[key] : undefined;
          return (
            <div
              key={`${p.label}-${i}`}
              className="flex gap-3.5 overflow-hidden rounded"
              style={{
                background: "rgba(107, 143, 127, 0.12)",
                borderLeft: "3px solid var(--mint)",
              }}
            >
              {resolved && (
                <div className="w-[100px] shrink-0">
                  <img
                    src={generatedImageUrl(resolved.visual_image_id)}
                    alt={resolved.label || p.label || "plant"}
                    className="block h-full w-full animate-fade-rise"
                    style={{ aspectRatio: "1 / 1", objectFit: "cover" }}
                    loading="lazy"
                  />
                </div>
              )}
              <div
                className="flex-1 p-3.5 font-display italic"
                style={{
                  fontSize: 16,
                  fontVariationSettings: '"opsz" 72, "wght" 380, "SOFT" 100',
                }}
              >
                <div>{p.label || "—"}</div>
                {p.strategy && (
                  <div className="mt-1 text-[12px] font-sans not-italic text-mist-600">
                    {p.strategy}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LightPanel({
  selection,
  itemTiles,
}: {
  selection: Selection | null;
  itemTiles: Record<string, VisualMoodBoardItemTile>;
}) {
  const light = selection?.light ?? {};
  const fixtures = Array.isArray(light.fixtures) ? light.fixtures : [];
  const kelvin =
    light.temperature_kelvin ||
    light.strategy?.match(/(\d{3,4}\s?K)/)?.[1] ||
    "—";
  return (
    <div>
      <div className="mono mb-1.5 text-mist-500">COLOUR TEMPERATURE</div>
      <div
        className="font-display"
        style={{
          fontSize: 36,
          fontVariationSettings: '"opsz" 144, "wght" 480, "SOFT" 100',
        }}
      >
        {kelvin}
      </div>
      {light.strategy && (
        <p
          className="mt-3 font-display"
          style={{
            fontSize: 16,
            color: "var(--mist-700)",
            lineHeight: 1.55,
            fontVariationSettings: '"opsz" 72, "wght" 380, "SOFT" 100',
          }}
        >
          {light.strategy}
        </p>
      )}
      {fixtures.length > 0 && (
        <>
          <Eyebrow style={{ marginBottom: 10, marginTop: 24 }}>FIXTURES</Eyebrow>
          <div className="flex flex-col gap-3">
            {fixtures.map((f, i) => {
              if (typeof f === "string") {
                return (
                  <div key={i} className="text-[14px]">
                    {f}
                  </div>
                );
              }
              const key = keyForLight(f);
              const resolved = key ? itemTiles[key] : undefined;
              return (
                <div
                  key={i}
                  className="flex gap-3.5 rounded-lg border border-mist-100 p-3.5"
                >
                  <div className="w-[100px] shrink-0">
                    {resolved ? (
                      <img
                        src={generatedImageUrl(resolved.visual_image_id)}
                        alt={resolved.label || f.name || "fixture"}
                        className="block w-full rounded animate-fade-rise"
                        style={{ aspectRatio: "1 / 1", objectFit: "cover" }}
                        loading="lazy"
                      />
                    ) : (
                      <Placeholder tag="LIGHT" ratio="1/1" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="mono text-mist-500">
                      {(f.brand ?? "BRAND").toUpperCase()}
                    </div>
                    <div
                      className="font-display"
                      style={{
                        fontSize: 18,
                        fontVariationSettings: '"opsz" 72, "wght" 440, "SOFT" 100',
                      }}
                    >
                      {f.name ?? ""}
                    </div>
                    {f.usage && (
                      <div className="mono mt-1 text-mist-600">{f.usage}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function SourcesPanel({ selection }: { selection: Selection | null }) {
  const items = selection?.sources ?? [
    "Leesman 2024 · Fintech subset",
    "Gensler Workplace Survey EU 2024",
    "Human Spaces Report 2023",
    "Kvadrat · Textiles catalogue",
    "BAUX · Wood-wool acoustics spec",
    "Framery · O pod dimensions",
    "Farrow & Ball · Lime Plaster",
    "Amtico · Worn Oak plank",
    "NF S 31-080 · acoustic performance",
    "ERP Type W · Arrêté 25 juin 1980",
    "design://adjacency-rules",
  ];
  return (
    <div className="mono leading-loose text-[12px] text-mist-700">
      {items.map((s, i) => {
        const label = typeof s === "string" ? s : s.label ?? "";
        return (
          <div key={i}>
            → {label}
          </div>
        );
      })}
    </div>
  );
}
