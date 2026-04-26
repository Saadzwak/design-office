import { describe, it, expect } from "vitest";

import { balanceMarkdown, firstSentence } from "../markdown";

describe("balanceMarkdown", () => {
  it("leaves balanced text untouched", () => {
    expect(balanceMarkdown("**Bold** and *italic*")).toBe("**Bold** and *italic*");
  });

  it("closes an unclosed **bold", () => {
    expect(balanceMarkdown("**Programme subtotal (excl.")).toBe(
      "**Programme subtotal (excl.**",
    );
  });

  it("closes an unclosed *italic*", () => {
    expect(balanceMarkdown("Lead with *intent")).toBe("Lead with *intent*");
  });

  it("closes an unclosed `code`", () => {
    expect(balanceMarkdown("Run `npm install")).toBe("Run `npm install`");
  });

  it("treats `**foo**` as bold, not as 4 italics", () => {
    expect(balanceMarkdown("**foo**")).toBe("**foo**");
  });

  it("preserves an empty input", () => {
    expect(balanceMarkdown("")).toBe("");
  });

  it("does not double-close already-balanced bold", () => {
    expect(balanceMarkdown("**a** **b**")).toBe("**a** **b**");
  });

  it("handles mixed unclosed delimiters", () => {
    // Both `**` and `\`` are odd → both get closed.
    expect(balanceMarkdown("**bold and `code")).toBe("**bold and `code`**");
    // Order : code closes first (latest), then bold ; both close at the
    // tail. The exact trailing order isn't user-visible after parsing.
  });
});

describe("firstSentence", () => {
  it("does not stop on `excl.` (the Brief Programme bug)", () => {
    const input =
      "**Programme subtotal (excl. furniture, fit-out CAPEX) :** 850 m². " +
      "Notes : 6 m²/FTE.";
    const out = firstSentence(input, { maxLength: 200 });
    expect(out).toContain("850 m²");
    expect(out).toMatch(/\*\*.*\*\*/); // bold properly closed
    // Did NOT truncate at `excl.`
    expect(out).not.toMatch(/excl\.$/);
    expect(out).not.toMatch(/excl\.\s*\*\*$/);
  });

  it("does not stop on `e.g.` mid-sentence", () => {
    const input = "Use a flex policy (e.g. 0.7 ratio) per quarter. Next thing.";
    const out = firstSentence(input, { maxLength: 200 });
    expect(out).toContain("0.7 ratio");
    expect(out).not.toMatch(/e\.g\.$/);
  });

  it("DOES stop at a real sentence end (period + uppercase)", () => {
    const out = firstSentence("First idea. Second idea.", {
      maxLength: 200,
    });
    expect(out).toBe("First idea.");
  });

  it("DOES stop at end of line if the dot is the last char", () => {
    const out = firstSentence("Just one thought.", { maxLength: 200 });
    expect(out).toBe("Just one thought.");
  });

  it("balances unclosed bold from the source", () => {
    const out = firstSentence("**Unclosed", { maxLength: 200 });
    expect(out).toBe("**Unclosed**");
  });

  it("skips markdown chrome (table rows, headings, blockquotes)", () => {
    const input = [
      "| Col A | Col B |",
      "| ----- | ----- |",
      "## Title",
      "> blockquote",
      "Real first sentence here. After.",
    ].join("\n");
    const out = firstSentence(input, { maxLength: 200 });
    expect(out).toBe("Real first sentence here.");
  });

  it("returns empty when only chrome lines exist", () => {
    const input = "| h1 | h2 |\n| -- | -- |";
    const out = firstSentence(input, { maxLength: 200 });
    expect(out).toBe("");
  });

  it("respects maxLength with ellipsis", () => {
    const long = "a".repeat(300);
    const out = firstSentence(long, { maxLength: 50 });
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith("…")).toBe(true);
  });

  it("handles accented uppercase as sentence boundary (É)", () => {
    const out = firstSentence("Premier point. Étape suivante.", {
      maxLength: 200,
    });
    expect(out).toBe("Premier point.");
  });
});
