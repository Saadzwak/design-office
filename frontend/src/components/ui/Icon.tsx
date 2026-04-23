import {
  AlertTriangle,
  Archive,
  Armchair,
  ArrowLeft,
  ArrowRight,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Compass,
  CornerDownRight,
  Download,
  Edit3,
  Feather,
  FileText,
  Gauge,
  GitBranch,
  Heart,
  Layers,
  LayoutGrid,
  Leaf,
  Maximize,
  Menu,
  MessagesSquare,
  Mic,
  MoreHorizontal,
  Package,
  Phone,
  Play,
  Plus,
  Presentation,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Footprints,
  Star,
  Sun,
  Upload,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";

/**
 * Icon — thin wrapper over lucide-react aligned with the Claude Design
 * handoff's 39 inline icon names (bundle `components.jsx · iconPaths`).
 *
 * The bundle ships 39 inline SVG paths to avoid a runtime lib ; we
 * already ship `lucide-react` 0.453, which has the same Feather-family
 * stroke language at stroke-width 1.5. Aliasing bundle icon names to
 * lucide components keeps the visual parity while avoiding a duplicate
 * icon library in the repo.
 */

// Every icon the bundle references in `components.jsx` `iconPaths`.
// Note : lucide 0.453 ships no `Stairs` — we alias to `Footprints`
// which reads clearly as "steps" at the small sizes used on the
// micro-zoning tiles.
const ICONS: Record<string, LucideIcon> = {
  menu: Menu,
  x: X,
  "arrow-right": ArrowRight,
  "arrow-left": ArrowLeft,
  "chevron-right": ChevronRight,
  "chevron-left": ChevronLeft,
  "chevron-down": ChevronDown,
  plus: Plus,
  play: Play,
  star: Star,
  send: Send,
  users: Users,
  "layout-grid": LayoutGrid,
  "messages-square": MessagesSquare,
  coffee: Coffee,
  package: Package,
  "shield-check": ShieldCheck,
  "alert-triangle": AlertTriangle,
  gauge: Gauge,
  presentation: Presentation,
  phone: Phone,
  // lucide 0.453 has no `Stairs` yet ; `Footprints` reads as "stair
  // movement" at small sizes and keeps the semantic.
  stairs: Footprints,
  armchair: Armchair,
  heart: Heart,
  leaf: Leaf,
  archive: Archive,
  sun: Sun,
  mic: Mic,
  "more-horizontal": MoreHorizontal,
  "git-branch": GitBranch,
  download: Download,
  upload: Upload,
  "corner-down-right": CornerDownRight,
  sparkles: Sparkles,
  "edit-3": Edit3,
  search: Search,
  "file-text": FileText,
  layers: Layers,
  maximize: Maximize,
  compass: Compass,
  feather: Feather,
  "building-2": Building2,
};

export type IconName = keyof typeof ICONS;

type Props = {
  name: IconName | string;
  size?: number;
  stroke?: number;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
};

export default function Icon({
  name,
  size = 16,
  stroke = 1.5,
  className = "",
  style,
  ...rest
}: Props) {
  const Lucide = ICONS[name as IconName] ?? X;
  return (
    <Lucide
      width={size}
      height={size}
      strokeWidth={stroke}
      className={className}
      style={style}
      aria-hidden={!rest["aria-label"]}
      {...rest}
    />
  );
}
