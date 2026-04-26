import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  AgentTrace,
  Card,
  Eyebrow,
  Icon,
  Pill,
  PillToggle,
  type AgentRow,
} from "../components/ui";
import { useProjectState } from "../hooks/useProjectState";
import {
  exportDxfUrl,
  fetchTestFitSample,
  generateExport,
  justifyMagazinePdfUrl,
  justifyPdfUrl,
  moodBoardPdfUrl,
  type ExportResponse,
} from "../lib/api";

/**
 * Export — Claude Design bundle parity (iter-18l).
 *
 * Editorial hero, "Hand off to engineering." italic h1, retained
 * variant pill + scale PillToggle + project-reference underline
 * input + twin DXF / DWG buttons, 3-step pipeline card trio,
 * generation state via AgentTrace then result card.
 *
 * Backend : DXF ships live today via `/api/export/dwg` which
 * returns an `ExportResponse` containing the dxf filename + 5
 * named layers. DWG is behind blocker B7 (no ODA converter
 * installed) so the DWG CTA stays one-tap-disabled with a
 * blocker pill explaining the fallback.
 */

type Phase = "idle" | "running" | "done" | "error";
type Scale = "50" | "100" | "200";

export default function Export() {
  const project = useProjectState();
  const navigate = useNavigate();
  const [scale, setScale] = useState<Scale>("100");
  const [projectRef, setProjectRef] = useState<string>(
    () => "LUM-2026-" + String(Math.floor(Math.random() * 99) + 1).padStart(3, "0"),
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [response, setResponse] = useState<ExportResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const retained =
    project.testfit?.variants?.find(
      (v) => v.style === project.testfit?.retained_style,
    ) ?? project.testfit?.variants?.[0] ?? null;

  // Iter-30B Stage 2.1 — rehydrate the full ExportResponse from
  // localStorage so leaving and re-entering /export still shows the
  // previously-generated DXF (file name, layer count, download CTA).
  // The structured `project.export_runs` only carries ids; the
  // rendering metadata (dxf_filename, dxf_bytes, sheet, scale, layers)
  // lives in this side-cache, keyed by project_id.
  useEffect(() => {
    if (response) return;
    if (!project.project_id) return;
    try {
      const raw = localStorage.getItem(
        `design-office.export.last.${project.project_id}`,
      );
      if (!raw) return;
      const parsed = JSON.parse(raw) as ExportResponse;
      if (parsed && typeof parsed === "object" && parsed.export_id) {
        setResponse(parsed);
        setPhase("done");
      }
    } catch {
      /* corrupt entry — ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.project_id]);

  // Persist the response so the next mount can rehydrate it.
  useEffect(() => {
    if (!response || !project.project_id) return;
    try {
      localStorage.setItem(
        `design-office.export.last.${project.project_id}`,
        JSON.stringify(response),
      );
    } catch {
      /* quota — UI still works in-memory */
    }
  }, [response, project.project_id]);

  // Iter-20b (Saad #23). Generate DXF now requires the active project
  // to have a floor_plan + retained variant — or falls back to the
  // Lumen sample ONLY when the active project IS Lumen. For fresh
  // non-Lumen projects the button routes through a friendly guard
  // (toast + early return) so the user doesn't silently export a
  // Lumen DXF thinking it's their own project.
  const generate = async () => {
    const isLumen =
      (project.project_id || "").toLowerCase().startsWith("lumen") ||
      (project.client.name || "").toLowerCase() === "lumen";

    let plan = project.floor_plan;
    let variant = retained;

    if (!plan || !variant) {
      if (!isLumen) {
        setErrorMsg(
          "Run Test Fit first — Generate DXF needs a retained variant + floor plan for this project.",
        );
        setPhase("error");
        return;
      }
      try {
        const sample = await fetchTestFitSample();
        plan = sample.floor_plan;
        variant =
          sample.variants.find(
            (v) => v.style === project.testfit?.retained_style,
          ) ?? sample.variants[1];
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setPhase("error");
        return;
      }
    }

    setPhase("running");
    setErrorMsg("");
    try {
      const resp = await generateExport({
        client_name: project.client.name,
        floor_plan: plan,
        variant,
        scale: parseInt(scale, 10),
        project_reference: projectRef,
      });
      setResponse(resp);
      setPhase("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  };

  const agents: AgentRow[] = [
    {
      roman: "I",
      name: "Model Reader",
      status:
        phase === "idle" ? "pending" : phase === "running" ? "active" : "done",
      message: phase === "running" ? "Walking 142 geometric entities…" : "Parsed 142 entities",
    },
    {
      roman: "II",
      name: "ezdxf Translator",
      status:
        phase === "done"
          ? "done"
          : phase === "running"
            ? "active"
            : "pending",
      message:
        phase === "running"
          ? "Building DO_ZONES + DO_FURN + DO_ACOUSTIC…"
          : phase === "done"
            ? "5 layers written"
            : undefined,
    },
    {
      roman: "III",
      name: "Packager",
      status: phase === "done" ? "done" : "pending",
      message: phase === "done" ? "DXF ready" : undefined,
    },
  ];

  return (
    <div className="mx-auto max-w-[1200px] space-y-14 pb-10">
      {/* Header */}
      <header>
        <Eyebrow style={{ marginBottom: 12 }}>V · EXPORT</Eyebrow>
        <h1
          className="m-0 font-display italic"
          style={{
            fontSize: 64,
            lineHeight: 1.02,
            letterSpacing: "-0.02em",
            fontVariationSettings: '"opsz" 144, "wght" 600, "SOFT" 100',
          }}
        >
          Hand off to engineering.
        </h1>
        <p
          className="mt-4 max-w-[720px] font-display"
          style={{
            fontSize: 22,
            color: "var(--mist-600)",
            fontVariationSettings: '"opsz" 72, "wght" 380, "SOFT" 100',
          }}
        >
          Five named layers. Zero rewrite. Open directly in AutoCAD, Revit or
          Vectorworks.
        </p>
      </header>

      {/* Hero panel */}
      <section
        className="rounded-2xl border border-mist-200 p-10"
        style={{ background: "#FFFDF9", boxShadow: "var(--sh-soft)" }}
      >
        <div className="mb-8 flex flex-wrap items-center justify-between gap-6">
          <Pill
            variant="active"
            leading={
              <span
                className="inline-block h-2 w-2"
                style={{
                  background: "var(--sand)",
                  borderRadius: 2,
                  transform: "rotate(45deg)",
                }}
              />
            }
          >
            {(project.testfit?.retained_style ?? "Atelier").replace(/_/g, " ")} ·{" "}
            {retained?.metrics.workstation_count ?? 130} desks
          </Pill>
          <div className="flex items-center gap-3.5">
            <Eyebrow>SCALE</Eyebrow>
            <PillToggle<Scale>
              options={[
                { value: "50", label: "1:50" },
                { value: "100", label: "1:100" },
                { value: "200", label: "1:200" },
              ]}
              value={scale}
              onChange={setScale}
            />
          </div>
        </div>

        <div
          className="mb-7 grid items-end gap-6"
          style={{ gridTemplateColumns: "1fr auto" }}
        >
          <div>
            <Eyebrow style={{ marginBottom: 10 }}>PROJECT REFERENCE</Eyebrow>
            <input
              value={projectRef}
              onChange={(e) => setProjectRef(e.target.value)}
              className="input-underline font-mono text-[15px]"
            />
          </div>
          <div className="mono pb-2.5 text-mist-500">
            UNITS · MM · DIN 919
          </div>
        </div>

        {/* Iter-33 follow-up v3 — DWG button + ODA pending line removed
            per Saad's request. The DXF is the canonical engineering
            artefact and opens in every major CAD app (1-click save-as
            DWG), so the dual-CTA was confusing more than helpful. */}
        <button
          onClick={generate}
          disabled={phase === "running"}
          className="btn-primary justify-center w-full"
          style={{ padding: "20px 24px", fontSize: 16 }}
        >
          <Icon name="download" size={14} />
          {phase === "running" ? "Generating…" : "Generate DXF"}
        </button>
      </section>

      {phase === "error" && (
        <Card>
          <Eyebrow>ERROR</Eyebrow>
          <p className="mt-2 text-[13px] text-clay">{errorMsg}</p>
          <button onClick={generate} className="btn-ghost btn-sm mt-3">
            Retry
          </button>
        </Card>
      )}

      {/* Generation panel */}
      {(phase === "running" || phase === "done") && (
        <section>
          <Eyebrow style={{ marginBottom: 18 }}>GENERATION</Eyebrow>
          {phase === "running" ? (
            <AgentTrace agents={agents} />
          ) : (
            response && (
              <div className="card flex items-center gap-6 !p-8">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-lg text-white"
                  style={{ background: "var(--mint)" }}
                >
                  <Icon name="shield-check" size={22} />
                </div>
                <div className="flex-1">
                  <div
                    className="font-display"
                    style={{
                      fontSize: 22,
                      fontVariationSettings:
                        '"opsz" 72, "wght" 440, "SOFT" 100',
                    }}
                  >
                    {response.dxf_filename}
                  </div>
                  <div className="mono mt-1 text-mist-500">
                    {(response.dxf_bytes / 1024).toFixed(1)} KB · {response.layers.length} LAYERS ·{" "}
                    {response.sheet} · {response.scale}
                  </div>
                  <div className="mt-1.5 text-[12px] text-mist-600">
                    Open with AutoCAD, Revit, Vectorworks or any CAD
                    software. Save-as → DWG is a single action.
                  </div>
                </div>
                <a
                  href={exportDxfUrl(response.export_id)}
                  className="btn-primary"
                >
                  <Icon name="download" size={12} /> Download
                </a>
              </div>
            )
          )}
        </section>
      )}

      {/* Iter-33 follow-up v3 — unified "All exports" panel.
          Saad's ask : the Export page should surface every project
          deliverable in one place, not just DXF. Each card lights up
          when its source surface has produced an artefact, otherwise
          it shows a "Run [page]" CTA instead of a Download button.
          Cards stay shown even on partial state — keeping the panel
          editorial and consistent across runs.
      */}
      <AllExportsPanel
        dxf={response}
        moodboardPdfId={project.mood_board?.pdf_id ?? null}
        magazinePdfId={project.justify?.magazine_pdf_id ?? null}
        reportPdfId={project.justify?.pdf_id ?? null}
        navigate={navigate}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────── all-exports panel ──

type AllExportsProps = {
  dxf: ExportResponse | null;
  moodboardPdfId: string | null;
  magazinePdfId: string | null;
  reportPdfId: string | null;
  navigate: (to: string) => void;
};

/**
 * 5-card grid surfacing every downloadable artefact this project has
 * produced. Each card has the same anatomy : roman numeral, format
 * kicker (PDF · PPTX · DXF), title, one-line description, and either
 * a Download button (when the artefact exists) or a navigate CTA
 * pointing to the surface that produces it.
 *
 * Stays compact (2 rows × 3 cols on desktop) so it doesn't dominate
 * the page — the engineering DXF generator above remains the
 * primary action.
 */
function AllExportsPanel({
  dxf,
  moodboardPdfId,
  magazinePdfId,
  reportPdfId,
  navigate,
}: AllExportsProps) {
  const cards: ExportCard[] = [
    {
      roman: "I",
      title: "Pitch deck",
      kicker: "PDF · 18 slides · 16:9",
      description:
        "Magazine-grade client deck — atmosphere, programme, evidence, KPIs.",
      ready: !!magazinePdfId,
      href: magazinePdfId ? justifyMagazinePdfUrl(magazinePdfId) : undefined,
      ctaLabel: "Run Justify",
      ctaTarget: "/justify",
    },
    {
      roman: "II",
      title: "Mood board",
      kicker: "PDF · A3 landscape",
      description:
        "Editorial mood board — palette, materials, furniture, biophilic moments.",
      ready: !!moodboardPdfId,
      href: moodboardPdfId ? moodBoardPdfUrl(moodboardPdfId) : undefined,
      ctaLabel: "Run Mood board",
      ctaTarget: "/moodboard",
    },
    {
      roman: "III",
      title: "DXF file",
      kicker: "DXF · 5 named layers",
      description:
        "Five-layer DXF for AutoCAD, Revit, Vectorworks. Save-as → DWG.",
      ready: !!dxf?.export_id,
      href: dxf?.export_id ? exportDxfUrl(dxf.export_id) : undefined,
      ctaLabel: "Generate DXF",
      ctaTarget: null, // generated on this page — no navigation
    },
    {
      roman: "IV",
      title: "Client report",
      kicker: "PDF · A4 portrait",
      description:
        "Sourced argumentaire — readable A4 document for sharing or printing.",
      ready: !!reportPdfId,
      href: reportPdfId ? justifyPdfUrl(reportPdfId) : undefined,
      ctaLabel: "Run Justify",
      ctaTarget: "/justify",
    },
  ];

  return (
    <section>
      <div className="mb-7 flex items-baseline justify-between gap-6">
        <div>
          <Eyebrow style={{ marginBottom: 12 }}>ALL EXPORTS</Eyebrow>
          <h2
            className="m-0 font-display italic"
            style={{
              fontSize: 36,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              fontVariationSettings: '"opsz" 144, "wght" 400, "SOFT" 60',
            }}
          >
            Every deliverable, in one place.
          </h2>
        </div>
        <span className="mono text-mist-500">
          {cards.filter((c) => c.ready).length} / {cards.length} READY
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {cards.map((c) => (
          <ExportRowView
            key={c.roman}
            card={c}
            onNavigate={navigate}
          />
        ))}
      </div>
    </section>
  );
}

type ExportCard = {
  roman: string;
  title: string;
  kicker: string;
  description: string;
  ready: boolean;
  href?: string;
  ctaLabel: string;
  /** When null, the artefact is produced on this same page —
   *  the unready CTA falls back to a noop scroll-to-top. */
  ctaTarget: string | null;
};

function ExportRowView({
  card,
  onNavigate,
}: {
  card: ExportCard;
  onNavigate: (to: string) => void;
}) {
  return (
    <div
      className="grid items-center rounded-[10px] border border-mist-200 px-7 py-5"
      style={{
        background: card.ready ? "#FFFDF9" : "var(--canvas-alt)",
        gridTemplateColumns: "auto 1fr auto",
        gap: 24,
      }}
    >
      {/* Roman numeral + status pill — left rail */}
      <div className="flex flex-col items-start gap-2" style={{ minWidth: 60 }}>
        <span
          className="font-display italic leading-none"
          style={{
            fontSize: 32,
            color: card.ready ? "var(--forest)" : "var(--sand)",
            fontVariationSettings: '"opsz" 96, "wght" 400, "SOFT" 30',
          }}
        >
          {card.roman}.
        </span>
        <span
          className="mono px-2 py-0.5 text-[9px] tracking-label"
          style={{
            background: card.ready
              ? "rgba(47, 74, 63, 0.12)"
              : "rgba(28, 31, 26, 0.06)",
            color: card.ready ? "var(--forest)" : "var(--mist-500)",
            borderRadius: 3,
          }}
        >
          {card.ready ? "READY" : "PENDING"}
        </span>
      </div>

      {/* Title + kicker + description — middle */}
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-3">
          <span
            className="font-display"
            style={{
              fontSize: 22,
              letterSpacing: "-0.01em",
              lineHeight: 1.1,
              fontVariationSettings: '"opsz" 72, "wght" 500, "SOFT" 0',
            }}
          >
            {card.title}
          </span>
          <span className="mono text-mist-500">{card.kicker}</span>
        </div>
        <p className="m-0 text-[13px] leading-relaxed text-mist-600">
          {card.description}
        </p>
      </div>

      {/* Action — right */}
      <div className="flex justify-end">
        {card.ready && card.href ? (
          <a
            href={card.href}
            target="_blank"
            rel="noreferrer"
            className="btn-primary"
          >
            <Icon name="download" size={12} /> Download
          </a>
        ) : card.ctaTarget ? (
          <button
            onClick={() => onNavigate(card.ctaTarget!)}
            className="btn-ghost"
          >
            <Icon name="arrow-right" size={12} /> {card.ctaLabel}
          </button>
        ) : (
          <span className="mono text-[10px] uppercase tracking-label text-mist-500">
            Use the generator above
          </span>
        )}
      </div>
    </div>
  );
}
