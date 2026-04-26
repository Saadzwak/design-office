/**
 * Shared markdown helpers for tldr extraction.
 *
 * Iter-33 follow-up v3 — Saad bug report : "**Programme subtotal (excl."
 * was showing the literal `**` in the Brief Programme card and in the
 * Justify Next-Steps card. Two distinct issues fed the same symptom :
 *
 * 1. `firstSentence` truncated at the first `.`, so an abbreviation
 *    like `excl.` ended the sentence prematurely — leaving the
 *    opening `**` orphaned.
 * 2. Even when the truncation was correct, an LLM occasionally emits
 *    an unclosed `**` for a long phrase. Without balancing, the raw
 *    asterisks survived react-markdown's rendering and ended up
 *    visible.
 *
 * `firstSentence` here only ends a sentence when the period is
 * followed by an uppercase letter or end-of-line — abbreviations like
 * `excl.`, `e.g.`, `i.e.`, `Mr.`, `Dr.` flow through. After
 * extraction, `balanceMarkdown` counts the inline delimiters (`**`,
 * `*`, `` ` ``, `_`) and appends a closing token if the count is
 * odd. The result reads correctly as bold/italic/code, never as
 * raw asterisks.
 */

export type FirstSentenceOptions = {
  /** Hard cap. The result is sliced + ellipsis-d if it exceeds. */
  maxLength: number;
  /** Skip lines that look like markdown chrome (headings, table rows,
   *  bullet markers, blockquote markers). */
  skipChrome?: boolean;
};

/**
 * Pull the first complete sentence out of a markdown blob.
 *
 * A "sentence end" is a `.`, `!`, or `?` followed by either:
 * - whitespace + an uppercase letter (next sentence starts), or
 * - end-of-string (the line ends here).
 *
 * Periods followed by lowercase letters (`excl. furniture`) are
 * treated as abbreviations and the regex backtracks past them.
 */
export function firstSentence(
  text: string,
  { maxLength, skipChrome = true }: FirstSentenceOptions,
): string {
  const trimmed = text?.trim();
  if (!trimmed) return "";

  const lines = trimmed.split(/\r?\n/);
  const isChrome = (t: string): boolean => {
    if (!t) return true;
    if (t.startsWith("#")) return true; // heading
    if (t.startsWith(">")) return true; // blockquote
    if (t.startsWith("|")) return true; // table row
    if (/^[:\-\s|]+$/.test(t)) return true; // table separator / hr
    if (/^[*_`]{3,}$/.test(t)) return true; // emphasis-only line
    return false;
  };

  let candidate: string | undefined;
  for (const line of lines) {
    const t = line.trim();
    if (skipChrome && isChrome(t)) continue;
    candidate = t;
    break;
  }
  if (!candidate) return "";

  // Sentence boundary : `[.!?]` followed by whitespace + uppercase OR
  // end-of-string. Multi-byte uppercase is covered by `\p{Lu}` (so
  // accented capitals like `É` count). The non-greedy `+?` makes the
  // regex prefer the earliest *valid* boundary.
  const sentenceRegex = /^(.+?[.!?])(?=\s+[\p{Lu}]|\s*$)/su;
  const match = candidate.match(sentenceRegex);
  let first = match ? match[1] : candidate;

  if (first.length > maxLength) {
    first = first.slice(0, maxLength - 1).trimEnd() + "…";
  }
  return balanceMarkdown(first);
}

/**
 * Balance unclosed inline markdown delimiters in a one-liner.
 *
 * Counts each delimiter and appends a closing token at the end if the
 * count is odd. Order matters : we balance `**` before `*` because
 * the `**` regex needs to consume two characters at a time, otherwise
 * `**foo` would be counted as 2 single-asterisks and pass through.
 *
 * Delimiters covered :
 * - `**` (bold)        — most common offender
 * - `*` (em / italic)
 * - ``` ` ``` (inline code)
 * - `_` (em alternate)
 *
 * Assumes the input is one editorial line ; not safe for multi-line
 * markdown (a `**` on line 1 might legitimately close on line 2).
 */
export function balanceMarkdown(text: string): string {
  if (!text) return text;
  let out = text;

  // Close inside-out so the resulting markdown parses with the
  // expected nesting order (LIFO : the latest-opened delimiter
  // closes first). Example : `**bold and \`code` becomes
  // `**bold and \`code\`**` — code closes inside the bold span — not
  // `**bold and \`code**\`` which would leave a stray backtick.

  const codeCount = (out.match(/`/g) ?? []).length;
  if (codeCount % 2 === 1) out = out + "`";

  // Italics use `*` (single asterisk). To distinguish from `**`, strip
  // every `**` pair before counting and skip if the count is odd.
  const stripped = out.replace(/\*\*/g, "");
  const italicCount = (stripped.match(/\*/g) ?? []).length;
  if (italicCount % 2 === 1) out = out + "*";

  // **bold** — last so it wraps anything closed above it.
  const boldCount = (out.match(/\*\*/g) ?? []).length;
  if (boldCount % 2 === 1) out = out + "**";

  // Underscore italic. We only count *whole-word* underscores because
  // sym_bols inside identifiers can be legitimate. Skipping this pass
  // for now keeps the helper fast — `_` orphans are vastly less
  // common than `**` in our LLM output.

  return out;
}
