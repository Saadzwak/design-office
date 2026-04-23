import DotPulse from "./DotPulse";
import TypewriterText from "./TypewriterText";

export type AgentStatus = "pending" | "active" | "done";

export type AgentRow = {
  /** Roman numeral or numeric index shown on the left. */
  roman: string;
  /** User-facing agent name — studio vocab after iter-17 (Headcount,
   *  Benchmarks, Compliance, Editor), never the backend trace name. */
  name: string;
  status: AgentStatus;
  /** Active-phase message — types in via Typewriter; done-phase short
   *  summary — shown prefixed with a checkmark. */
  message?: string;
};

type Props = {
  agents: AgentRow[];
  className?: string;
};

/**
 * Editorial agent trace — 3-column grid of roman / name / status.
 * Matches the bundle's pattern : italic-Fraunces roman numeral, medium
 * name, mono status message in forest / mint / neutral depending on
 * the phase.
 */
export default function AgentTrace({ agents, className = "" }: Props) {
  return (
    <div className={["flex flex-col gap-3.5", className].join(" ")}>
      {agents.map((a, i) => {
        const isLast = i === agents.length - 1;
        const colour =
          a.status === "done"
            ? "text-mint"
            : a.status === "active"
              ? "text-forest"
              : "text-mist-400";

        return (
          <div
            key={`${a.roman}-${a.name}-${i}`}
            className={[
              "grid items-center gap-4 py-2.5",
              "grid-cols-[40px_minmax(0,200px)_1fr]",
              !isLast ? "border-b border-mist-100" : "",
            ].join(" ")}
          >
            <span
              className="font-display italic text-mist-500 text-[18px]"
              style={{ fontVariationSettings: '"opsz" 72, "wght" 300, "SOFT" 100' }}
            >
              {a.roman}.
            </span>
            <span className="font-medium text-ink">{a.name}</span>
            <span className={`${colour} font-mono text-[12px] tracking-wide`}>
              {a.status === "active" && (
                <span className="inline-flex items-center gap-2.5">
                  <DotPulse />
                  {a.message && <TypewriterText text={a.message} speed={22} caret />}
                </span>
              )}
              {a.status === "done" && (
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden>✓</span>
                  <span>{a.message ?? "done"}</span>
                </span>
              )}
              {a.status === "pending" && (
                <span className="opacity-50">pending</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
