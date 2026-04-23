/**
 * Argumentaire markdown → Justify cards adapter.
 *
 * The Claude Design Justify screen expects 7 `{ roman, title, tldr,
 * citations }` cards. Our backend emits a long argumentaire markdown
 * (Leesman + Gensler + WELL + NF S 31-080 citations inline). This
 * adapter splits on H2, picks the first sentence as tldr, and counts
 * citation-like occurrences (`[…]`, `(design://…)`, "Leesman", etc.)
 * as a proxy for the per-section citation count the design's card
 * footer renders.
 */

export type JustifyCard = {
  roman: string;
  title: string;
  tldr: string;
  citations: number;
  body: string; // full section body for the drawer
};

const ROMANS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

function countCitations(body: string): number {
  let n = 0;
  // `design://` references.
  n += (body.match(/design:\/\//g) ?? []).length;
  // Bracketed `[…]` references (backed by a URL or `[À VÉRIFIER]`).
  n += (body.match(/\[[^\]\n]{3,}\]/g) ?? []).length;
  // Named sources — count mentions but cap at 1 per name per section.
  for (const name of [
    "Leesman",
    "Gensler",
    "Steelcase",
    "HOK",
    "Vitra",
    "WELL",
    "BREEAM",
    "NF S 31-080",
    "ISO 3382",
    "Arrêté",
    "BAUX",
    "Kvadrat",
    "Farrow",
    "Framery",
    "Amtico",
    "Boubekri",
    "Hongisto",
    "Banbury",
    "Haapakangas",
    "Human Spaces",
  ]) {
    if (body.includes(name)) n += 1;
  }
  return Math.max(1, Math.min(12, n));
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/^\s*\d+\.?\s*/, "") // strip "1. " prefix
    .replace(/[*_`#]/g, "")
    .trim();
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  // Ignore meta headings like "### Acoustique & confort sonore"
  // that show up as the first line — take the first line that is not a heading.
  const lines = trimmed.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("-") || t.startsWith(">")) continue;
    // Take the first 200 chars up to a `.` or `!`.
    const match = t.match(/^(.+?[.!?])(\s|$)/s);
    const first = match ? match[1] : t;
    return first.length > 180 ? first.slice(0, 177).trimEnd() + "…" : first;
  }
  return trimmed.slice(0, 180);
}

export function parseJustifyCards(argumentaire: string): JustifyCard[] {
  if (!argumentaire) return [];
  const lines = argumentaire.split(/\r?\n/);
  const cards: JustifyCard[] = [];
  let title: string | null = null;
  let body: string[] = [];

  const flush = () => {
    if (title === null) return;
    const cleaned = cleanTitle(title);
    if (!cleaned) {
      title = null;
      body = [];
      return;
    }
    const bodyText = body.join("\n").trim();
    const tldr = firstSentence(bodyText);
    cards.push({
      roman: ROMANS[cards.length] ?? String(cards.length + 1),
      title: cleaned,
      tldr: tldr || bodyText.slice(0, 140),
      citations: countCitations(bodyText),
      body: bodyText,
    });
    title = null;
    body = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^##\s+/.test(line) && !/^###/.test(line)) {
      flush();
      title = line.replace(/^##\s+/, "");
      continue;
    }
    if (title !== null) body.push(raw);
  }
  flush();
  return cards.slice(0, 8);
}

/** Fallback static cards for fresh projects that haven't run Justify yet. */
export const JUSTIFY_FALLBACK: JustifyCard[] = [
  {
    roman: "I",
    title: "Acoustic strategy",
    tldr: "Rw ≥ 44 dB project rooms · DnT,A ≥ 38 dB on partitions.",
    citations: 6,
    body: "",
  },
  {
    roman: "II",
    title: "Biophilic & neuro",
    tldr: "Cognitive uplift 8–12% per Human Spaces 2023.",
    citations: 4,
    body: "",
  },
  {
    roman: "III",
    title: "Ergonomics & wellbeing",
    tldr: "100% height-adjustable · Leesman target > 70.",
    citations: 5,
    body: "",
  },
  {
    roman: "IV",
    title: "Flex & density rationale",
    tldr: "14.6 m²/FTE absorbs 170 FTEs under 3-days policy.",
    citations: 7,
    body: "",
  },
  {
    roman: "V",
    title: "PMR & accessibility",
    tldr: "Full-stack WCAG + ERP Type W 4ᵉ catégorie.",
    citations: 3,
    body: "",
  },
  {
    roman: "VI",
    title: "ERP & safety",
    tldr: "Two evac routes per floor · widths > 1.4 m · 0 reroutes.",
    citations: 4,
    body: "",
  },
  {
    roman: "VII",
    title: "Brand identity & culture fit",
    tldr: "Editorial, atelier-led — away from tech-playground.",
    citations: 2,
    body: "",
  },
];
