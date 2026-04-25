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
  fetchTestFitSample,
  generateMoodBoard,
  generateMoodBoardGallery,
  generateMoodBoardItemTiles,
  generatedImageUrl,
  moodBoardPdfUrl,
  rerenderMoodBoardPdf,
  type MoodBoardResponse,
  type VisualMoodBoardGalleryResponse,
  type VisualMoodBoardGalleryTile,
  type VisualMoodBoardItemTile,
} from "../lib/api";
import { INDUSTRY_LABEL, setMoodBoard } from "../lib/projectState";

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
  const [selection, setSelection] = useState<Selection | null>(null);
  const [response, setResponse] = useState<MoodBoardResponse | null>(null);
  const [drawer, setDrawer] = useState<DrillKey | null>(null);
  const [phase, setPhase] = useState<"idle" | "running" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  // Iter-20d (Saad #9, #10, #26) : per-tile NanoBanana gallery.
  // Fetched after `selection` lands. Tiles replace the tinted
  // Placeholder hatches in the Pinterest collage.
  const [gallery, setGallery] = useState<VisualMoodBoardGalleryTile[]>([]);
  const [galleryPhase, setGalleryPhase] = useState<
    "idle" | "running" | "error"
  >("idle");
  // Iter-30B : per-item editorial product photos (one per material,
  // furniture piece, plant, fixture). Resolved by `item_key` from a
  // slug computed identically to the backend (see `slugifyItemKey`).
  const [itemTiles, setItemTiles] = useState<
    Record<string, VisualMoodBoardItemTile>
  >({});
  const [itemTilesPhase, setItemTilesPhase] =
    useState<"idle" | "running" | "ready" | "error">("idle");

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

  const palette = useMemo(
    () => selection?.atmosphere?.palette ?? [],
    [selection],
  );

  // Iter-20d : once a selection is known (whether from the preload
  // fixture or a live curator run), fire the NanoBanana gallery to
  // replace the Pinterest Placeholder hatches with 4 real images.
  // Cached on the backend by sha256(prompt + model), so re-visits
  // don't respend tokens.
  const runGallery = async () => {
    if (!selection) return;
    setGalleryPhase("running");
    try {
      let variant = project.testfit?.variants?.find(
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
        });
      setGallery(resp.tiles);
      setGalleryPhase("idle");

      // iter-30B : fire the per-item editorial photo batch in
      // parallel with the PDF re-render. When it completes, fire a
      // SECOND PDF rerender that combines gallery_tile_ids +
      // item_tile_ids — the A3 PDF then embeds real product photos
      // in every material / furniture cell instead of the colour-
      // swatch fallback. Failure is non-fatal: the collage falls
      // back to <Placeholder> tiles for unresolved items, like before.
      void (async () => {
        setItemTilesPhase("running");
        try {
          const items = await generateMoodBoardItemTiles({
            client_name: project.client.name,
            industry: project.client.industry,
            variant,
            mood_board_selection: selection as Record<string, unknown>,
            aspect_ratio: "4:3",
          });
          const byKey: Record<string, VisualMoodBoardItemTile> = {};
          const itemIdsForPdf: Record<string, string> = {};
          for (const t of items.tiles) {
            byKey[t.item_key] = t;
            itemIdsForPdf[t.item_key] = t.visual_image_id;
          }
          setItemTiles(byKey);
          setItemTilesPhase("ready");

          // Second-pass PDF rerender: now that we have ALL imagery
          // (4 hero gallery + N item tiles), regenerate the A3 PDF
          // with everything embedded.
          try {
            const galleryIds: Record<string, string> = {};
            for (const t of resp.tiles) galleryIds[t.label] = t.visual_image_id;
            const rerender2 = await rerenderMoodBoardPdf({
              client: {
                name: project.client.name,
                industry: project.client.industry,
                logo_data_url: project.client.logo_data_url ?? null,
              },
              variant,
              selection: selection as Record<string, unknown>,
              gallery_tile_ids: galleryIds,
              item_tile_ids: itemIdsForPdf,
            });
            if (rerender2.pdf_id) {
              const hexes = (selection.atmosphere?.palette ?? [])
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
          } catch (rerenderErr) {
            // eslint-disable-next-line no-console
            console.warn(
              "Mood-board PDF re-render (with items) failed",
              rerenderErr,
            );
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("Mood-board item-tiles failed", err);
          setItemTilesPhase("error");
        }
      })();

      // iter-20e (Saad #10) : once the tiles are cached, upgrade the
      // A3 PDF so the atmosphere hero uses a real NanoBanana photo
      // instead of the flat palette wash. Fire-and-forget — the page
      // keeps working with the old pdf_id if the re-render fails.
      try {
        const tile_ids: Record<string, string> = {};
        for (const t of resp.tiles) {
          tile_ids[t.label] = t.visual_image_id;
        }
        const rerender = await rerenderMoodBoardPdf({
          client: {
            name: project.client.name,
            industry: project.client.industry,
            logo_data_url: project.client.logo_data_url ?? null,
          },
          variant,
          selection: selection as Record<string, unknown>,
          gallery_tile_ids: tile_ids,
        });
        if (rerender.pdf_id) {
          const hexes = (selection.atmosphere?.palette ?? [])
            .map((p) => p.hex)
            .filter((s): s is string => typeof s === "string");
          setMoodBoard({
            pdf_id: rerender.pdf_id,
            palette: hexes,
            selection: selection as Record<string, unknown>,
          });
          setResponse((prev) =>
            prev ? { ...prev, pdf_id: rerender.pdf_id } : prev,
          );
        }
      } catch (rerenderErr) {
        // eslint-disable-next-line no-console
        console.warn("Mood-board PDF re-render failed", rerenderErr);
      }
    } catch (err) {
      // Non-fatal : the page still renders Placeholder tiles. Log so
      // Engineering view users can see what happened if they check
      // the console.
      // eslint-disable-next-line no-console
      console.warn("Mood-board gallery failed", err);
      setGalleryPhase("error");
    }
  };

  useEffect(() => {
    // Auto-fire when a selection lands AND we haven't fetched yet.
    if (selection && gallery.length === 0 && galleryPhase === "idle") {
      runGallery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  const tiles = useMemo(() => buildTiles(selection), [selection]);
  const tagline =
    selection?.header?.tagline ??
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
        {response?.pdf_id ? (
          <a
            href={moodBoardPdfUrl(response.pdf_id)}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost"
          >
            <Icon name="download" size={12} /> Download A3 PDF
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
    // Backend key shape: `mat:${slug(material)}:${slug(finish)}`,
    // trailing colon trimmed if finish empty. Replicate exactly.
    // Note: the curator schema field is `material` (LLM) but the
    // frontend Selection type calls it `name` for legacy fixtures —
    // use whichever is present.
    const matName = (m as { material?: string }).material ?? m.name ?? "";
    const finish = (m as { finish?: string }).finish ?? "";
    const key = `mat:${slugifyItemKey(matName)}${finish ? `:${slugifyItemKey(finish)}` : ""}`;
    tiles.push({
      tag: (matName || m.name || "MATERIAL").toUpperCase(),
      tint: m.swatch_hex ?? "#A89775",
      ratio: ratios[tiles.length % ratios.length],
      itemKey: key,
      category: "material",
    });
  }
  // Furniture next.
  for (const f of selection.furniture ?? []) {
    if (tiles.length >= 16) break;
    const pid = (f as { product_id?: string }).product_id;
    const brand = f.brand ?? "";
    const name = f.name ?? "";
    let key: string;
    if (pid) {
      key = `fur:${slugifyItemKey(pid)}`;
    } else {
      const parts = [slugifyItemKey(brand), slugifyItemKey(name)].filter(
        Boolean,
      );
      key = parts.length ? `fur:${parts.join("-")}` : "";
    }
    tiles.push({
      tag: (name || "PIECE").toUpperCase(),
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
    const brand = fx.brand ?? "";
    const model = fx.model ?? fx.name ?? "";
    const parts = [slugifyItemKey(brand), slugifyItemKey(model)].filter(
      Boolean,
    );
    const key = parts.length ? `lig:${parts.join("-")}` : "";
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
      itemKey: `pla:${slugifyItemKey(nm)}`,
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
  onClose,
}: {
  k: DrillKey;
  selection: Selection | null;
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
      {k === "materials" && <MaterialsPanel selection={selection} />}
      {k === "furniture" && <FurniturePanel selection={selection} />}
      {k === "planting" && <PlantingPanel selection={selection} />}
      {k === "light" && <LightPanel selection={selection} />}
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

function MaterialsPanel({ selection }: { selection: Selection | null }) {
  const items = selection?.materials ?? [];
  return (
    <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
      {items.map((m, i) => (
        <div key={i}>
          <Placeholder
            tag={(m.name ?? "MATERIAL").toUpperCase()}
            tint={m.swatch_hex}
            ratio="1/1"
          />
          <div className="mt-2 text-[13px]">{m.name}</div>
          <div className="mono text-[10px] text-mist-500">
            SOURCE · {(m.brand ?? "—").toUpperCase()}
          </div>
        </div>
      ))}
    </div>
  );
}

function FurniturePanel({ selection }: { selection: Selection | null }) {
  const items = selection?.furniture ?? [];
  return (
    <div className="flex flex-col gap-4">
      {items.map((f, i) => (
        <div
          key={i}
          className="flex gap-3.5 rounded-lg border border-mist-100 p-3.5"
        >
          <div className="w-[100px] shrink-0">
            <Placeholder tag="PRODUCT" ratio="1/1" />
          </div>
          <div>
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
      ))}
    </div>
  );
}

function PlantingPanel({ selection }: { selection: Selection | null }) {
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
        {items.map((p, i) => (
          <div
            key={`${p.label}-${i}`}
            className="rounded p-3.5 font-display italic"
            style={{
              background: "rgba(107, 143, 127, 0.12)",
              borderLeft: "3px solid var(--mint)",
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
        ))}
      </div>
    </div>
  );
}

function LightPanel({ selection }: { selection: Selection | null }) {
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
          <ul className="pl-4 leading-loose">
            {fixtures.map((f, i) => (
              <li key={i} className="text-[14px]">
                {typeof f === "string"
                  ? f
                  : `${f.name ?? ""}${f.brand ? ` (${f.brand})` : ""}${f.usage ? ` — ${f.usage}` : ""}`}
              </li>
            ))}
          </ul>
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
