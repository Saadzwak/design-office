import { Fragment, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  /** The markdown source — typically a one-line tldr emitted by an LLM. */
  children: string;
  /** Extra CSS classes applied around the rendered span. Optional. */
  className?: string;
};

/**
 * Inline markdown renderer for one-line previews (tldrs, strategy
 * captions). Wraps `react-markdown` but strips its default `<p>` wrapper
 * so the output is safe to drop inside an existing `<p>`, `<div>`, or
 * heading without producing `<p><div></div></p>` invalid HTML.
 *
 * Why a separate component (instead of full <ReactMarkdown> everywhere) :
 *
 * - LLM tldrs use `**bold**` for key terms and backticks for inline
 *   code — without parsing they show literally on screen ("ERP
 *   **type W**" instead of "ERP type W" with bold).
 * - Stripping the markers (`stripInlineMarkdown`) loses the editorial
 *   bold, which Saad explicitly wants preserved.
 * - A naive `<ReactMarkdown>` injects `<p>` tags that break inline
 *   contexts and trigger React hydration warnings.
 *
 * Allowed inline grammar : `**bold**`, `*italic*`, `_em_`, `` `code` ``,
 * `[text](url)`. Block elements are intentionally unsupported : if a
 * caller needs paragraphs, lists, or tables they should use the full
 * `<ReactMarkdown remarkPlugins={[remarkGfm]}>` (see Justify drawer
 * body or Brief drawer body for the prose pattern).
 */
export default function InlineMarkdown({
  children,
  className,
}: Props): ReactNode {
  if (!children) return null;
  const node = (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      // Replace the default block-level `<p>` with a Fragment so the
      // output sits cleanly inside any inline parent.
      components={{
        p: ({ children: kids }) => <>{kids}</>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
  if (className) {
    return <span className={className}>{node}</span>;
  }
  return <Fragment>{node}</Fragment>;
}
