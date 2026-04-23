import { useEffect, useState } from "react";

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

  useEffect(() => {
    // If we have an export_id persisted, pre-seed. Otherwise the user
    // triggers a run by clicking the DXF button.
    // (nothing to hydrate yet — projectState export_runs carry only ids)
  }, []);

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

        <div className="grid gap-3.5" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <button
            onClick={generate}
            disabled={phase === "running"}
            className="btn-primary justify-center"
            style={{ padding: "20px 24px", fontSize: 16 }}
          >
            <Icon name="download" size={14} />
            {phase === "running" ? "Generating…" : "Generate DXF"}
          </button>
          <button
            disabled
            title="Deferred — see BLOCKERS.md B7 (no ODA File Converter installed)"
            className="btn-primary justify-center !bg-mist-300 !text-ink-heavy"
            style={{
              padding: "20px 24px",
              fontSize: 16,
              cursor: "not-allowed",
            }}
          >
            <Icon name="download" size={14} />
            Generate DWG
            <span
              className="mono ml-2 rounded-full px-2 py-0.5 text-[9px]"
              style={{
                background: "rgba(160, 82, 45, 0.15)",
                color: "var(--clay)",
              }}
            >
              ODA PENDING
            </span>
          </button>
        </div>
        <p className="mono mt-3 text-center text-[10px] uppercase tracking-label text-mist-500">
          DWG blocked on ODA File Converter install · DXF opens in every
          major CAD app (1-click save-as DWG).
        </p>
      </section>

      {/* Pipeline */}
      <section>
        <Eyebrow style={{ marginBottom: 20 }}>PIPELINE · THREE STEPS</Eyebrow>
        <div
          className="grid items-stretch"
          style={{ gridTemplateColumns: "1fr 48px 1fr 48px 1fr", gap: 0 }}
        >
          {[
            [
              "I",
              "SketchUp model",
              "Atelier variant exported from the 3D tool, all zones tagged.",
            ],
            [
              "II",
              "ezdxf · headless",
              "Python translates geometry into CAD primitives — no AutoCAD required.",
            ],
            [
              "III",
              "DXF / DWG",
              "5 layers : DO_WALLS · DO_ZONES · DO_FURN · DO_ACOUSTIC · DO_GRID.",
            ],
          ].map(([r, t, d], i) => (
            <div key={r} style={{ display: "contents" }}>
              <div
                className="rounded-[10px] border border-mist-200 p-6"
                style={{ background: "var(--canvas-alt)" }}
              >
                <div
                  className="font-display italic leading-none"
                  style={{
                    fontSize: 32,
                    color: "var(--sand)",
                    fontVariationSettings:
                      '"opsz" 144, "wght" 320, "SOFT" 100',
                  }}
                >
                  {r}.
                </div>
                <div
                  className="mt-2 font-display"
                  style={{
                    fontSize: 22,
                    fontVariationSettings:
                      '"opsz" 72, "wght" 440, "SOFT" 100',
                  }}
                >
                  {t}
                </div>
                <div className="mt-2 text-[13px] leading-relaxed text-mist-600">
                  {d}
                </div>
              </div>
              {i < 2 && (
                <div className="flex items-center justify-center">
                  <Icon
                    name="arrow-right"
                    size={20}
                    style={{ color: "var(--mist-400)" }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
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
    </div>
  );
}
