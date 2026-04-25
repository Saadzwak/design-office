import { useEffect, useState } from "react";

import TypewriterText from "./TypewriterText";

type Props = {
  /** Ordered list of messages to cycle through. */
  messages: string[];
  /** ms per character — same default as TypewriterText. */
  speed?: number;
  /** ms before advancing to the next message AFTER it finishes typing.
   *  Default 1800 — long enough to read a 6-word phrase.
   */
  holdMs?: number;
  /** Optional offset applied to the cycle start so paired instances
   *  render staggered (different messages on screen at the same time).
   */
  startOffset?: number;
  className?: string;
  caret?: boolean;
};

/**
 * Cycles `TypewriterText` through a list of messages in a loop —
 * advances after each message finishes typing + a configurable hold.
 *
 * Used by the iter-32 loading states on `/testfit` to narrate what
 * the macro / micro orchestration is doing during the wall-clock
 * wait. The component never claims real progress; it loops as long
 * as the parent renders it. When the actual response lands the
 * parent unmounts this and renders the result — a visually honest
 * "still working" affordance, not a fake progress bar.
 *
 * Implementation note: TypewriterText resets when its `text` prop
 * changes, so cycling is just a state index that picks the next
 * string. The `holdMs` debounces the advance so the previous
 * message is visible long enough to read.
 */
export default function CyclingTypewriter({
  messages,
  speed = 28,
  holdMs = 1800,
  startOffset = 0,
  className = "",
  caret = true,
}: Props) {
  const [idx, setIdx] = useState(0);
  // Naïve estimator — ms ≈ message_length × speed + holdMs. Could
  // wire onDone from TypewriterText for exactness but the visible
  // cadence is forgiving and a simple timer keeps this small.
  useEffect(() => {
    if (messages.length <= 1) return;
    const text = messages[idx % messages.length] ?? "";
    const dwell = text.length * speed + holdMs;
    const t = setTimeout(() => {
      setIdx((i) => (i + 1) % messages.length);
    }, dwell);
    return () => clearTimeout(t);
  }, [idx, messages, speed, holdMs]);

  // Initial offset shift so two siblings show different messages
  // simultaneously — gives the appearance of N agents working in
  // parallel without staggering anything physical.
  useEffect(() => {
    if (startOffset > 0) {
      const t = setTimeout(
        () => setIdx((i) => (i + 1) % Math.max(messages.length, 1)),
        startOffset,
      );
      return () => clearTimeout(t);
    }
  }, [startOffset, messages.length]);

  if (messages.length === 0) return null;
  const current = messages[idx % messages.length] ?? "";
  return (
    <TypewriterText
      key={`cycle-${idx}`}
      text={current}
      speed={speed}
      caret={caret}
      className={className}
    />
  );
}
