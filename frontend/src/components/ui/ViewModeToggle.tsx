import PillToggle from "./PillToggle";
import { useProjectState } from "../../hooks/useProjectState";
import { setViewMode, type ViewMode } from "../../lib/projectState";

type Props = {
  size?: "sm" | "md";
  labels?: { engineering: string; client: string };
  className?: string;
};

/**
 * Engineering ↔ Client view toggle. Thin wrapper over PillToggle
 * (iter-18 unification) that binds to `projectState.view_mode`.
 *
 * Labels can be shortened ("Eng") or fully spelled ("Engineering") via
 * the `labels` prop ; defaults match the bundle's `GlobalNav` usage.
 */
export default function ViewModeToggle({
  size = "sm",
  labels = { engineering: "Engineering", client: "Client" },
  className,
}: Props) {
  const project = useProjectState();
  return (
    <PillToggle<ViewMode>
      options={[
        { value: "engineering", label: labels.engineering },
        { value: "client", label: labels.client },
      ]}
      value={project.view_mode}
      onChange={setViewMode}
      size={size}
      ariaLabel="Product view mode"
      className={className}
    />
  );
}
