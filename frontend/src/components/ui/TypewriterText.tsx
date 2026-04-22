import { useEffect, useState } from "react";

type Props = {
  text: string;
  /** ms per character. Default 26 — slow enough to read, not boring. */
  speed?: number;
  /** ms of delay before the first character appears. */
  startDelay?: number;
  /** Show a blinking caret after the text is complete. */
  caret?: boolean;
  className?: string;
  onDone?: () => void;
};

/**
 * Character-by-character reveal. Used on /brief while the 3-agent
 * orchestration runs — feels like an architect pencilling a note rather
 * than a SaaS skeleton.
 */
export default function TypewriterText({
  text,
  speed = 26,
  startDelay = 0,
  caret = true,
  className = "",
  onDone,
}: Props) {
  const [len, setLen] = useState(0);
  const [caretOn, setCaretOn] = useState(false);

  useEffect(() => {
    setLen(0);
    setCaretOn(false);
    let cancelled = false;
    const start = setTimeout(() => {
      if (cancelled) return;
      setCaretOn(true);
      let i = 0;
      const step = () => {
        if (cancelled) return;
        i += 1;
        setLen(i);
        if (i < text.length) {
          setTimeout(step, speed);
        } else {
          onDone?.();
        }
      };
      step();
    }, startDelay);
    return () => {
      cancelled = true;
      clearTimeout(start);
    };
  }, [text, speed, startDelay, onDone]);

  return (
    <span className={[className, caret && caretOn ? "typewriter-caret" : ""].join(" ")}>
      {text.slice(0, len)}
    </span>
  );
}
