/**
 * Programme-markdown → card sections adapter.
 *
 * The Brief consolidator (backend `surfaces/brief.py`) emits the
 * programme as a Markdown blob with H2 sections. The Claude Design
 * Brief screen expects a list of 6-8 `{ icon, title, tldr, body }`
 * cards — a drill-down grid rather than a wall of text.
 *
 * Until iter-17 E's deferred structured-sections schema lands on the
 * backend prompts, this adapter parses the markdown locally : an H2
 * becomes a card title, the first sentence of the section's body
 * becomes the tldr, the rest becomes the body prose. An icon is
 * picked heuristically from the H2 text so every card reads as a
 * studio chapter (Headcount, Workspace Mix, Collaboration, etc.).
 */

import { firstSentence as sharedFirstSentence } from "./markdown";

export type ProgrammeSection = {
  id: string;
  icon: string;
  title: string;
  tldr: string;
  body: string;
};

const ICON_BY_KEYWORD: Array<{ keywords: RegExp; icon: string }> = [
  { keywords: /headcount|effectifs|staff|fte|growth|people|equipe/i, icon: "users" },
  { keywords: /mix|density|layout|workspace|plan|space|zoning/i, icon: "layout-grid" },
  { keywords: /collaboration|collab|meeting|huddle|boardroom/i, icon: "messages-square" },
  { keywords: /hospitality|café|cafe|kitchen|lounge|reception|terrace/i, icon: "coffee" },
  { keywords: /support|locker|storage|wellness|amenity|amenities/i, icon: "package" },
  { keywords: /compliance|pmr|erp|accessibility|regul|code|norm/i, icon: "shield-check" },
  { keywords: /risk|red flag|warning|caveat|alert|issue/i, icon: "alert-triangle" },
  { keywords: /density|ratio|m²|sqm|square/i, icon: "gauge" },
  { keywords: /flex|hybrid|remote|policy|onsite/i, icon: "git-branch" },
  { keywords: /benchmark|leesman|gensler|source|reference/i, icon: "layers" },
  { keywords: /acoustic|sound|noise/i, icon: "mic" },
  { keywords: /light|daylight|façade|facade|window|sun/i, icon: "sun" },
  { keywords: /biophilic|plant|green|nature/i, icon: "leaf" },
  { keywords: /boardroom|present|pitch|client/i, icon: "presentation" },
];

function pickIcon(title: string): string {
  for (const { keywords, icon } of ICON_BY_KEYWORD) {
    if (keywords.test(title)) return icon;
  }
  return "file-text";
}

function firstSentence(text: string): string {
  // Iter-33 follow-up v3 — delegates to the shared helper. The shared
  // version skips abbreviations (`excl.`, `e.g.`, …) by requiring an
  // uppercase letter after the period, and balances any unclosed
  // `**` / `*` / `` ` `` so the rendered tldr never shows literal
  // delimiters. Saad's Programme card screenshot ("**Programme
  // subtotal (excl.") was the canonical repro for both bugs.
  return sharedFirstSentence(text, { maxLength: 160, skipChrome: true });
}

/** Iter-20c (Saad #3) : strip markdown emphasis markers from a string
 * so inline-rendered tldrs don't show `**foo**` verbatim. Used by
 * ProgrammeCard in Brief where we can't afford a full markdown
 * renderer for a one-line preview. */
export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .trim();
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

/**
 * Parse a programme markdown blob into drill-down cards.
 *
 * Splits on H2 (`## `) boundaries ; ignores any H1 preamble. Each
 * section's title is its H2 heading (stripped of leading `#`, emoji
 * characters, numbering like `## 1. Headcount` → `Headcount`). The
 * tldr is the first sentence ; the body is the remainder verbatim
 * so the drawer can render it with `react-markdown`.
 */
export function parseProgrammeSections(markdown: string): ProgrammeSection[] {
  if (!markdown) return [];
  const lines = markdown.split(/\r?\n/);
  const sections: ProgrammeSection[] = [];
  let currentTitle: string | null = null;
  let currentBody: string[] = [];

  const flush = () => {
    if (currentTitle === null) return;
    const cleaned = currentTitle
      .replace(/^[\d.\s)·—-]+/, "")
      .replace(/[*_`]/g, "")
      .trim();
    if (!cleaned) {
      currentTitle = null;
      currentBody = [];
      return;
    }
    const bodyText = currentBody.join("\n").trim();
    const tldr = firstSentence(bodyText);
    // Iter-32 (Saad #2) : ONLY strip the tldr off the body when it
    // was actually extracted from the body's first prose line — i.e.
    // when bodyText literally starts with the tldr string. Section
    // bodies that are pure markdown tables now return tldr="" from
    // firstSentence(), so this branch is correctly skipped and the
    // body (header row + data rows) reaches react-markdown intact.
    const remaining =
      tldr && bodyText.startsWith(tldr)
        ? bodyText.slice(tldr.length).trim()
        : bodyText;
    sections.push({
      id: slugify(cleaned) || `section-${sections.length + 1}`,
      icon: pickIcon(cleaned),
      title: cleaned,
      // Empty string when no preview available — the card UI checks
      // for this and renders title-only without raw markdown leak.
      tldr,
      body: remaining || tldr || bodyText,
    });
    currentTitle = null;
    currentBody = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    // H2 boundary. Ignore H1 (often "Functional programme — Lumen").
    if (/^##\s+/.test(line) && !/^###/.test(line)) {
      flush();
      currentTitle = line.replace(/^##\s+/, "");
      continue;
    }
    if (currentTitle !== null) {
      currentBody.push(raw);
    }
  }
  flush();
  return sections.slice(0, 8);
}
