type Option<T extends string> = {
  value: T;
  label: string;
  /** Optional leading dot / icon element. */
  leading?: React.ReactNode;
  disabled?: boolean;
};

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (next: T) => void;
  size?: "sm" | "md";
  ariaLabel?: string;
  className?: string;
};

/**
 * Generalised segmented toggle. Replaces the hard-coded ViewModeToggle
 * usage so any 2+ option pill-style switch (view-mode, scale 1:50/100/200,
 * tab macro/micro, 2D/3D viewer) shares the exact same visual.
 *
 * Bundle parity : `components.jsx#PillToggle`.
 */
export default function PillToggle<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  ariaLabel,
  className = "",
}: Props<T>) {
  const pad = size === "sm" ? "px-2.5 py-1" : "px-3.5 py-1.5";
  const fs = size === "sm" ? "text-[11px]" : "text-[12px]";

  return (
    <div
      className={[
        "inline-flex items-center gap-0.5 rounded-full bg-mist-100 p-[3px]",
        className,
      ].join(" ")}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={opt.disabled}
            onClick={() => !opt.disabled && onChange(opt.value)}
            className={[
              "inline-flex items-center gap-1.5 rounded-full font-medium tracking-tight",
              "transition-all duration-200 ease-out-gentle",
              pad,
              fs,
              active
                ? "bg-forest text-canvas"
                : "text-ink hover:text-ink-heavy",
              opt.disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
            ].join(" ")}
          >
            {opt.leading}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
