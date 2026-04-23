import { useRef, useState } from "react";

import { Eyebrow, Icon, Modal, Pill, toast } from "./ui";
import { uploadPlanPdf, type FloorPlan } from "../lib/api";
import {
  DEFAULT_PROGRAMME_SEED,
  createProjectFromUpload,
} from "../lib/adapters/createProject";
import {
  INDUSTRY_LABEL,
  setPlanImage,
  setVisitPhotos,
  type Industry,
} from "../lib/projectState";

const INDUSTRIES: Industry[] = [
  "tech_startup",
  "law_firm",
  "bank_insurance",
  "consulting",
  "creative_agency",
  "healthcare",
  "public_sector",
  "other",
];

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called with the new project id once creation succeeds. */
  onCreated?: (projectId: string) => void;
};

type ParseState =
  | { kind: "idle" }
  | { kind: "parsing"; fileName: string }
  | { kind: "ready"; plan: FloorPlan; fileName: string }
  | { kind: "ready_image"; dataUrl: string; fileName: string }
  | { kind: "error"; message: string };

type VisitPhoto = { name: string; data_url: string };

/**
 * New-project modal — creates a project from scratch, optionally
 * uploading a client logo and a floor-plan PDF which is parsed
 * through the Opus Vision + PyMuPDF hybrid pipeline right away.
 *
 * On success :
 *   1. A new entry is appended to `projectsIndex` and flagged active.
 *   2. `projectState` v2 is reset to the new identity (brief empty,
 *      programme seeded with a minimal 3-section stub so the Brief
 *      page renders the Synthesize CTA rather than a blank "done"
 *      state).
 *   3. The logo is stored as base64 on the client record.
 *   4. The parsed FloorPlan is persisted into `projectState.floor_plan`.
 *   5. `onCreated(id)` fires ; the caller navigates to the dashboard
 *      with the new project open.
 */
export default function NewProjectModal({ open, onClose, onCreated }: Props) {
  const logoRef = useRef<HTMLInputElement | null>(null);
  const planRef = useRef<HTMLInputElement | null>(null);
  const photosRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState<Industry>("tech_startup");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [parseState, setParseState] = useState<ParseState>({ kind: "idle" });
  const [visitPhotos, setVisitPhotosLocal] = useState<VisitPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName("");
    setIndustry("tech_startup");
    setLogoDataUrl(null);
    setParseState({ kind: "idle" });
    setVisitPhotosLocal([]);
    setSubmitting(false);
  };

  const handleLogo = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") setLogoDataUrl(result);
    };
    reader.readAsDataURL(file);
  };

  const handlePlan = async (file: File) => {
    // Iter-20b (Saad #1) : accept PDF (parsed) OR image (PNG / JPG
    // / WEBP). For images we can't extract vector geometry, but we
    // store the raster preview on projectState so the macro-zoning
    // + mood-board agents can run Vision HD on it later.
    const isImage = /^image\/(png|jpe?g|webp)$/i.test(file.type);
    const isPdf = file.type === "application/pdf";

    if (isImage) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === "string") {
          setParseState({
            kind: "ready_image",
            dataUrl: result,
            fileName: file.name,
          });
        }
      };
      reader.readAsDataURL(file);
      return;
    }

    if (!isPdf) {
      setParseState({
        kind: "error",
        message: `Unsupported file type: ${file.type || "unknown"}. Drop a PDF or an image.`,
      });
      return;
    }

    setParseState({ kind: "parsing", fileName: file.name });
    try {
      const plan = await uploadPlanPdf(file, false);
      setParseState({ kind: "ready", plan, fileName: file.name });
    } catch (err) {
      setParseState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleVisitPhotos = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: VisitPhoto[] = [];
    let pending = files.length;
    Array.from(files).forEach((file) => {
      if (!/^image\//.test(file.type)) {
        pending -= 1;
        if (pending === 0 && next.length > 0) {
          setVisitPhotosLocal((prev) => [...prev, ...next]);
        }
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === "string") {
          next.push({ name: file.name, data_url: result });
        }
        pending -= 1;
        if (pending === 0) {
          setVisitPhotosLocal((prev) => [...prev, ...next]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const canSubmit = name.trim().length >= 2 && !submitting && parseState.kind !== "parsing";

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const plan = parseState.kind === "ready" ? parseState.plan : null;
      const project = createProjectFromUpload({
        name: name.trim(),
        industry,
        logoDataUrl,
        floorPlan: plan,
      });
      // Iter-20b : persist the uploaded raster plan (image path) +
      // visit photos onto the freshly-created project's state.
      if (parseState.kind === "ready_image") {
        setPlanImage(parseState.dataUrl);
      }
      if (visitPhotos.length > 0) {
        setVisitPhotos(visitPhotos);
      }
      toast(`Project "${project.name}" created`);
      onCreated?.(project.id);
      reset();
      onClose();
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Could not create project",
        "error",
      );
      setSubmitting(false);
    }
  };

  const cancel = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={cancel}
      width={640}
      ariaLabel="New project"
    >
      <div className="max-h-[calc(100vh-96px)] overflow-auto px-9 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Eyebrow>NEW PROJECT</Eyebrow>
            <h2
              className="mt-2 font-display italic"
              style={{
                fontSize: 32,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                fontVariationSettings: '"opsz" 144, "wght" 520, "SOFT" 100',
              }}
            >
              Tell the studio about your next brief.
            </h2>
          </div>
          <button
            onClick={cancel}
            className="rounded-md p-1.5 text-mist-500 hover:bg-mist-50 hover:text-ink"
            aria-label="Close"
            disabled={submitting}
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="space-y-6">
          {/* Project name */}
          <div>
            <Eyebrow style={{ marginBottom: 8 }}>PROJECT NAME</Eyebrow>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lumen, Atrium, Kaito Studio…"
              className="input-underline"
            />
          </div>

          {/* Industry */}
          <div>
            <Eyebrow style={{ marginBottom: 10 }}>INDUSTRY</Eyebrow>
            <div className="flex flex-wrap gap-2">
              {INDUSTRIES.map((i) => (
                <Pill
                  key={i}
                  variant={industry === i ? "active" : "ghost"}
                  onClick={() => setIndustry(i)}
                >
                  {INDUSTRY_LABEL[i]}
                </Pill>
              ))}
            </div>
          </div>

          {/* Logo (optional) */}
          <div>
            <Eyebrow style={{ marginBottom: 10 }}>CLIENT LOGO · OPTIONAL</Eyebrow>
            <div className="flex items-center gap-3.5">
              {logoDataUrl ? (
                <>
                  <img
                    src={logoDataUrl}
                    alt="Client logo preview"
                    className="h-12 w-12 rounded-md border border-mist-200 object-contain bg-raised p-1"
                  />
                  <button
                    onClick={() => setLogoDataUrl(null)}
                    className="btn-minimal"
                    type="button"
                  >
                    <Icon name="x" size={12} /> Remove
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => logoRef.current?.click()}
                >
                  <Icon name="upload" size={12} /> Upload logo
                </button>
              )}
              <input
                ref={logoRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLogo(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          {/* Floor plan — PDF parsed or raster image (iter-20b). */}
          <div>
            <Eyebrow style={{ marginBottom: 10 }}>
              FLOOR PLAN · PDF OR IMAGE · OPTIONAL
            </Eyebrow>
            <PlanDrop
              state={parseState}
              onPick={() => planRef.current?.click()}
              onClear={() => setParseState({ kind: "idle" })}
            />
            <input
              ref={planRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handlePlan(f);
                e.target.value = "";
              }}
            />
            <p className="mt-2 font-mono text-[10px] uppercase tracking-label text-mist-500">
              PDF → envelope + columns + cores extracted. Image → Vision
              HD kicks in at Test Fit time.
            </p>
          </div>

          {/* Site-visit photos (iter-20b #1) — multi-upload, stored
              locally so the mood-board + micro-zoning prompts can
              reference observed materials + existing furniture. */}
          <div>
            <Eyebrow style={{ marginBottom: 10 }}>
              SITE-VISIT PHOTOS · OPTIONAL
            </Eyebrow>
            <div className="flex flex-wrap gap-2">
              {visitPhotos.map((p, i) => (
                <div
                  key={`${p.name}-${i}`}
                  className="relative h-20 w-20 overflow-hidden rounded-md border border-mist-200"
                  style={{ background: "var(--canvas-alt)" }}
                >
                  <img
                    src={p.data_url}
                    alt={p.name}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setVisitPhotosLocal((prev) =>
                        prev.filter((_, idx) => idx !== i),
                      )
                    }
                    className="absolute right-1 top-1 rounded bg-canvas/90 p-0.5 text-mist-600 hover:text-clay"
                    aria-label="Remove photo"
                  >
                    <Icon name="x" size={10} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => photosRef.current?.click()}
                className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed border-mist-300 text-mist-500 transition-colors hover:border-forest hover:text-forest"
                title="Add site-visit photos"
              >
                <Icon name="plus" size={16} />
              </button>
              <input
                ref={photosRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleVisitPhotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-label text-mist-500">
              Drop what you shot during the brief visit — materials,
              light conditions, existing furniture. Enriches mood-board
              + micro-zoning context.
            </p>
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={cancel}
            disabled={submitting}
            className="btn-ghost"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="btn-primary"
          >
            {submitting ? "Creating…" : "Create project"}
            {!submitting && <Icon name="arrow-right" size={14} />}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PlanDrop({
  state,
  onPick,
  onClear,
}: {
  state: ParseState;
  onPick: () => void;
  onClear: () => void;
}) {
  if (state.kind === "parsing") {
    return (
      <div
        className="flex items-center gap-3.5 rounded-lg border border-dashed border-mist-300 p-4"
        style={{ background: "var(--canvas-alt)" }}
      >
        <span
          className="inline-block h-2 w-2 animate-[dot-pulse_1.1s_var(--ease)_infinite] rounded-full"
          style={{ background: "var(--forest)" }}
        />
        <div className="text-[13px] text-mist-700">
          Parsing <span className="mono text-mist-500">{state.fileName}</span> …
          envelope + columns + cores in a few seconds.
        </div>
      </div>
    );
  }
  if (state.kind === "ready") {
    const { plan } = state;
    const columns = plan.columns.length;
    const cores = plan.cores.length;
    return (
      <div
        className="flex items-start gap-3.5 rounded-lg border border-mist-200 p-4"
        style={{ background: "var(--canvas-alt)" }}
      >
        <div
          className="flex h-10 w-10 items-center justify-center rounded-md"
          style={{
            background: "rgba(107, 143, 127, 0.16)",
            color: "var(--mint)",
          }}
        >
          <Icon name="shield-check" size={16} />
        </div>
        <div className="flex-1 text-[13px] text-ink">
          <div className="font-medium">{state.fileName}</div>
          <div className="text-mist-600">
            {plan.envelope.points.length} envelope pts · {columns} columns ·{" "}
            {cores} cores · {plan.windows.length} windows
          </div>
        </div>
        <button onClick={onClear} className="btn-minimal" type="button">
          <Icon name="x" size={12} /> Replace
        </button>
      </div>
    );
  }
  if (state.kind === "ready_image") {
    return (
      <div
        className="flex items-start gap-3.5 rounded-lg border border-mist-200 p-4"
        style={{ background: "var(--canvas-alt)" }}
      >
        <img
          src={state.dataUrl}
          alt={state.fileName}
          className="h-14 w-14 rounded-md border border-mist-200 object-cover"
        />
        <div className="flex-1 text-[13px] text-ink">
          <div className="font-medium">{state.fileName}</div>
          <div className="text-mist-600">
            Raster plan attached · Vision HD will read it at Test Fit.
          </div>
        </div>
        <button onClick={onClear} className="btn-minimal" type="button">
          <Icon name="x" size={12} /> Replace
        </button>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-clay/40 p-4 text-[13px] text-clay"
           style={{ background: "rgba(160, 82, 45, 0.08)" }}>
        <Icon name="alert-triangle" size={16} />
        <div className="flex-1">
          <div className="font-medium">Parse failed</div>
          <div className="mono text-[11px] text-mist-500">{state.message}</div>
        </div>
        <button onClick={onPick} className="btn-minimal" type="button">
          Retry
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-center gap-3.5 rounded-lg border border-dashed border-mist-300 p-4 text-left transition-colors hover:border-forest"
      style={{ background: "transparent" }}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-md"
        style={{
          background: "var(--forest-ghost)",
          color: "var(--forest)",
        }}
      >
        <Icon name="file-text" size={16} />
      </div>
      <div className="flex-1">
        <div className="text-[14px] font-medium text-ink">
          Drop a floor plan PDF
        </div>
        <div className="mono text-[10px] uppercase tracking-label text-mist-500">
          Or click to pick one — Vision HD stays free for later
        </div>
      </div>
      <Icon name="upload" size={14} style={{ color: "var(--mist-500)" }} />
    </button>
  );
}

// Re-export for documentation purposes.
export { DEFAULT_PROGRAMME_SEED };
