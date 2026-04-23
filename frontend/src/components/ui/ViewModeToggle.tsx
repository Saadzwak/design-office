import { useProjectState } from "../../hooks/useProjectState";
import { setViewMode, type ViewMode } from "../../lib/projectState";

/**
 * Small segmented toggle in the top nav that lets the user switch the
 * whole product between "Engineering" (dense, technical) and "Client"
 * (editorial, visual) views. The setting is persisted in the unified
 * project state so chat, navigation and layout adapt everywhere.
 */
export default function ViewModeToggle() {
  const project = useProjectState();
  const active: ViewMode = project.view_mode;
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-hairline bg-raised p-0.5">
      {(
        [
          { key: "engineering", label: "Eng" },
          { key: "client", label: "Client" },
        ] as Array<{ key: ViewMode; label: string }>
      ).map((opt) => (
        <button
          key={opt.key}
          onClick={() => setViewMode(opt.key)}
          className={[
            "rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-label transition-colors",
            active === opt.key
              ? "bg-forest text-raised"
              : "text-ink-soft hover:text-ink",
          ].join(" ")}
          aria-pressed={active === opt.key}
          title={
            opt.key === "engineering"
              ? "Engineering view — dense, technical"
              : "Client view — editorial, visual"
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
