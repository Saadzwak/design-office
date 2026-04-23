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
  moodBoardPdfUrl,
  type MoodBoardResponse,
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

  // Preload the Lumen atelier fixture so the demo has content
  // immediately. Non-Lumen projects show a "Run mood board" CTA.
  useEffect(() => {
    const ac = new AbortController();
    fetch("/moodboard-fixtures/lumen_atelier.json", { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Selection | null) => {
        if (data) setSelection(data);
      })
      .catch(() => null);
    return () => ac.abort();
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
      setMoodBoard({ pdf_id: resp.pdf_id, palette: hexes });
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
        {/* Pinterest collage */}
        <div style={{ columnCount: 3, columnGap: 14 }}>
          {tiles.map((t, i) => (
            <div
              key={i}
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
              <Placeholder tag={t.tag} tint={t.tint} ratio={t.ratio} />
            </div>
          ))}
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

function buildTiles(selection: Selection | null): Array<{
  tag: string;
  tint: string;
  ratio: string;
}> {
  if (!selection) {
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
  const tiles: Array<{ tag: string; tint: string; ratio: string }> = [];
  const ratios = ["4/5", "1/1", "3/4", "1/1", "4/5", "3/4", "4/3", "1/1", "3/4", "4/5"];
  // Prefer materials with a swatch_hex — they form the richest tiles.
  for (const m of selection.materials ?? []) {
    if (tiles.length >= 7) break;
    tiles.push({
      tag: (m.name ?? "MATERIAL").toUpperCase(),
      tint: m.swatch_hex ?? "#A89775",
      ratio: ratios[tiles.length % ratios.length],
    });
  }
  for (const f of selection.furniture ?? []) {
    if (tiles.length >= 10) break;
    tiles.push({
      tag: (f.name ?? "PIECE").toUpperCase(),
      tint: "#2A2E28",
      ratio: ratios[tiles.length % ratios.length],
    });
  }
  return tiles.slice(0, 10);
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
    <div className="h-full overflow-auto p-9">
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
