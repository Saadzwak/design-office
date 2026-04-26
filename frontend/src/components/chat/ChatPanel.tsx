import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, Minimize2, Send, Sparkles, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useNavigate } from "react-router-dom";
import remarkGfm from "remark-gfm";

import { useChatContext } from "../../hooks/useChatContext";
import { useProjectState } from "../../hooks/useProjectState";
import {
  clearConversation,
  loadConversation,
  saveConversation,
  sendChatMessage,
  streamChatMessage,
  type ChatMessage,
  type SuggestedAction,
} from "../../lib/chat";
import {
  detectEnrichment,
  dispatchChatAction,
  type EnrichmentSuggestion,
} from "../../lib/chatActions";
import {
  INDUSTRY_LABEL,
  setClient,
  setProgramme,
  type Industry,
} from "../../lib/projectState";

const STREAMING_BY_DEFAULT = false;

type Mode = "drawer" | "fullpage";

type Props = {
  mode: Mode;
  onClose?: () => void;
  /** Wired in iter-18m drawer port — lets the drawer's expand icon
   *  navigate to /chat while closing the drawer. Accepted optionally
   *  here so App.tsx's controlled ChatDrawer compiles before the
   *  bubble refactor lands. */
  onExpand?: () => void;
};

const PAGE_HELLO: Record<string, string> = {
  landing:
    "I can help you start a project, walk you through the six surfaces, or cite a source. What would you like to work on?",
  brief:
    "We're on the Brief. Ask me a question about the programme, or tell me to re-synthesise with a different angle.",
  testfit:
    "We're on Test Fit. I can compare the three macro variants, recommend a retained one, or propose an iteration (\"grow the boardroom\", \"push desks to the south façade\").",
  moodboard:
    "We're on Mood Board. I can suggest materials for the client industry, swap a palette, or curate furniture pieces.",
  justify:
    "We're on Justify. I can summarise the argumentaire, isolate the acoustic / PMR / biophilic argument, or propose alternative phrasings.",
  export:
    "We're on Export. I can help choose the DXF scale, explain the five Archoff layers, or trigger the export directly.",
  chat: "How can I help on the project?",
};

export default function ChatPanel({ mode, onClose, onExpand: _onExpand }: Props) {
  const navigate = useNavigate();
  const context = useChatContext();
  const project = useProjectState();
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadConversation());
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [streamedReply, setStreamedReply] = useState("");
  const [action, setAction] = useState<SuggestedAction | null>(null);
  const [enrichment, setEnrichment] = useState<EnrichmentSuggestion | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  const hello = useMemo(() => PAGE_HELLO[context.page] ?? PAGE_HELLO.chat, [context.page]);

  useEffect(() => {
    saveConversation(messages);
  }, [messages]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streamedReply, pending]);

  const send = useCallback(
    async (contentOverride?: string) => {
      const content = (contentOverride ?? draft).trim();
      if (!content || pending) return;
      setDraft("");
      setError(null);
      setAction(null);
      setEnrichment(null);

      // Hardcoded regex scan for project-parameter enrichments — runs locally
      // so the user sees a confirm card while Opus is still thinking.
      const maybeEnrich = detectEnrichment(content);
      if (maybeEnrich) setEnrichment(maybeEnrich);

      const next = [...messages, { role: "user" as const, content }];
      setMessages(next);
      setPending(true);
      setStreamedReply("");

      const ac = new AbortController();
      abortRef.current = ac;

      try {
        if (STREAMING_BY_DEFAULT || new URLSearchParams(window.location.search).get("stream") === "1") {
          let final = "";
          let finalAction: SuggestedAction | null = null;
          for await (const event of streamChatMessage(
            { messages: next, page_context: context },
            ac.signal,
          )) {
            if (event.kind === "token") {
              setStreamedReply((prev) => prev + event.text);
              final += event.text;
            } else if (event.kind === "end") {
              final = event.reply || final;
              finalAction = event.suggested_action;
            } else if (event.kind === "error") {
              throw new Error(event.message);
            }
          }
          setMessages([...next, { role: "assistant", content: final }]);
          setAction(finalAction);
        } else {
          const resp = await sendChatMessage(
            { messages: next, page_context: context },
            ac.signal,
          );
          setMessages([...next, { role: "assistant", content: resp.reply }]);
          setAction(resp.suggested_action);
        }
      } catch (exc) {
        setError(exc instanceof Error ? exc.message : String(exc));
      } finally {
        setPending(false);
        setStreamedReply("");
        abortRef.current = null;
      }
    },
    [draft, pending, messages, context],
  );

  const confirmAction = useCallback(
    async (act: SuggestedAction) => {
      setError(null);
      setRunning(act.label);
      setAction(null);
      try {
        const outcome = await dispatchChatAction(act);
        if (outcome.kind === "error") {
          setError(outcome.message);
        } else {
          setMessages((ms) => [
            ...ms,
            { role: "assistant", content: `✓ ${outcome.message}` },
          ]);
          if (outcome.navigate) navigate(outcome.navigate);
        }
      } catch (exc) {
        setError(exc instanceof Error ? exc.message : String(exc));
      } finally {
        setRunning(null);
      }
    },
    [navigate],
  );

  const confirmEnrichment = useCallback((suggestion: EnrichmentSuggestion) => {
    if (suggestion.field === "industry") {
      setClient({ industry: suggestion.newValue as Industry });
    } else if (suggestion.field === "headcount") {
      setProgramme({ headcount: suggestion.newValue as number });
    } else if (suggestion.field === "growth_target") {
      setProgramme({ growth_target: suggestion.newValue as number });
    } else if (suggestion.field === "flex_policy") {
      setProgramme({ flex_policy: String(suggestion.newValue) });
    } else if (suggestion.field === "constraints") {
      const now = project.programme.constraints ?? [];
      setProgramme({ constraints: [...now, String(suggestion.newValue)] });
    }
    setMessages((ms) => [
      ...ms,
      {
        role: "assistant",
        content: `✓ Project state updated — **${suggestion.field}** now \`${suggestion.newValue}\`.`,
      },
    ]);
    setEnrichment(null);
  }, [project.programme.constraints]);

  const onKey: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-forest/10 text-forest">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="font-display text-[15px] leading-none text-ink" style={{ fontVariationSettings: '"opsz" 36, "wght" 520, "SOFT" 100' }}>
              Ask Archoff
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-label text-ink-muted">
              {context.page} · Opus 4.7
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => {
              setMessages([]);
              setAction(null);
              clearConversation();
            }}
            className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-mist-50 hover:text-ink"
            title="Clear conversation"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          {mode === "drawer" ? (
            <>
              <button
                onClick={() => navigate("/chat")}
                className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-mist-50 hover:text-ink"
                title="Expand to full page"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
              <button
                onClick={onClose}
                className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-mist-50 hover:text-ink"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate(-1)}
              className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-mist-50 hover:text-ink"
              title="Back to app"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Project summary strip */}
      <ProjectSummaryStrip />

      {/* Messages */}
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-6">
        {messages.length === 0 && !streamedReply && (
          <p className="font-serif text-[15px] leading-relaxed text-ink-soft">{hello}</p>
        )}
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} text={m.content} />
        ))}
        {pending && streamedReply && <Bubble role="assistant" text={streamedReply} streaming />}
        {pending && !streamedReply && (
          <div className="flex items-center gap-2 text-[12px] text-ink-muted">
            <span className="flex gap-1">
              <span className="dot dot-pulse" style={{ animationDelay: "0ms" }} />
              <span className="dot dot-pulse" style={{ animationDelay: "150ms" }} />
              <span className="dot dot-pulse" style={{ animationDelay: "300ms" }} />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-label">Opus thinking</span>
          </div>
        )}
        <AnimatePresence>
          {enrichment && (
            <motion.div
              key={`enrich-${enrichment.field}-${enrichment.newValue}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-lg border border-sand-deep/40 bg-sand/10 p-4"
            >
              <p className="font-mono text-[10px] uppercase tracking-eyebrow text-sand-deep">
                Project update detected
              </p>
              <p className="mt-2 font-sans text-[14px] text-ink">
                I heard <em>"{enrichment.source}"</em>. The project currently records{" "}
                <strong>
                  {enrichment.field}
                </strong>{" "}
                as{" "}
                <span className="font-mono text-[12px]">
                  {displayEnrichmentValue(enrichment.field, enrichment.currentValue)}
                </span>
                . Update to{" "}
                <span className="font-mono text-[12px]">
                  {displayEnrichmentValue(enrichment.field, enrichment.newValue)}
                </span>
                ?
              </p>
              <div className="mt-3 flex gap-2">
                <button className="btn-primary" onClick={() => confirmEnrichment(enrichment)}>
                  Update project
                </button>
                <button className="btn-ghost" onClick={() => setEnrichment(null)}>
                  Keep as is
                </button>
              </div>
            </motion.div>
          )}
          {action && !running && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-lg border border-forest/20 bg-forest/5 p-4"
            >
              <p className="font-mono text-[10px] uppercase tracking-eyebrow text-forest">
                Suggested action
              </p>
              <p className="mt-2 font-sans text-[14px] text-ink">{action.label}</p>
              <p className="mt-1 font-mono text-[11px] text-ink-muted">
                {action.type}
                {action.params && Object.keys(action.params).length
                  ? " · " + JSON.stringify(action.params).slice(0, 80)
                  : ""}
              </p>
              <div className="mt-3 flex gap-2">
                <button className="btn-primary" onClick={() => confirmAction(action)}>
                  Apply
                </button>
                <button className="btn-ghost" onClick={() => setAction(null)}>
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
          {running && (
            <motion.div
              key={`running-${running}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border border-forest/30 bg-forest/5 p-3"
            >
              <div className="flex items-center gap-3 text-[13px] text-ink">
                <span className="flex gap-1">
                  <span className="dot dot-pulse" style={{ animationDelay: "0ms" }} />
                  <span className="dot dot-pulse" style={{ animationDelay: "150ms" }} />
                  <span className="dot dot-pulse" style={{ animationDelay: "300ms" }} />
                </span>
                <span className="font-mono text-[11px] uppercase tracking-label text-forest">
                  Running · {running}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {error && (
          <div className="rounded-lg border border-clay/40 bg-clay/5 p-3 text-[12px] text-clay">
            {error}
          </div>
        )}
        <div ref={scrollAnchorRef} />
      </div>

      {/* Composer — bundle parity : underline input + 36 px forest
          circular send button, no rounded box. */}
      <div className="flex items-center gap-2.5 border-t border-mist-200 px-5 py-3.5 bg-canvas">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder={
            context.page === "testfit"
              ? "Grow the boardroom, summarise the acoustic argument…"
              : "Ask anything or say what to do…"
          }
          rows={1}
          className="flex-1 resize-none border-0 border-b border-mist-300 bg-transparent py-2 text-[14px] leading-relaxed text-ink placeholder:text-mist-400 focus:border-forest focus:outline-none"
          style={{ borderBottom: "none" }}
        />
        <button
          onClick={() => send()}
          disabled={!draft.trim() || pending}
          className="flex h-9 w-9 items-center justify-center rounded-md text-canvas transition-all hover:scale-105 disabled:opacity-40"
          style={{ background: "var(--forest)" }}
          title="Send (Enter)"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function ProjectSummaryStrip() {
  const project = useProjectState();
  const { client, programme, testfit } = project;
  const retained = testfit?.retained_style
    ? testfit.variants.find((v) => v.style === testfit.retained_style)
    : null;
  const bits: string[] = [];
  bits.push(client.name || "Untitled project");
  bits.push(INDUSTRY_LABEL[client.industry]);
  if (programme.headcount) bits.push(`${programme.headcount} staff`);
  if (programme.growth_target)
    bits.push(`→ ${programme.growth_target} at horizon`);
  if (programme.flex_policy) bits.push(`flex ${programme.flex_policy}`);
  if (retained) bits.push(`retained: ${retained.style}`);
  return (
    <div className="min-w-0 overflow-hidden border-b border-hairline bg-canvas/80 px-5 py-2">
      <p className="truncate font-mono text-[10px] uppercase tracking-label text-ink-muted">
        Working on · {bits.join(" · ")}
      </p>
    </div>
  );
}

function displayEnrichmentValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (field === "industry") return INDUSTRY_LABEL[String(value) as Industry] ?? String(value);
  return String(value);
}

function Bubble({
  role,
  text,
  streaming,
  children,
}: {
  role: ChatMessage["role"];
  text: string;
  streaming?: boolean;
  children?: React.ReactNode;
}) {
  const isUser = role === "user";
  // Bundle parity : user bubbles are mist-100 rounded with a sharp
  // bottom-right corner ; assistant bubbles are canvas with a 2 px
  // forest left border and a sharp top-left corner — the two read as
  // "this side / that side" without needing avatars.
  const bubbleShape = isUser
    ? "rounded-[14px_14px_2px_14px] bg-mist-100"
    : "rounded-[2px_14px_14px_14px] bg-canvas border-l-2 border-l-forest";
  return (
    <div
      className={[
        "flex fade-rise",
        isUser ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      <div
        className={[
          "max-w-[82%] px-4 py-3 text-[14px] leading-relaxed text-ink",
          bubbleShape,
          streaming ? "ring-1 ring-forest/30" : "",
        ].join(" ")}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{text}</p>
        ) : (
          <div className="prose-chat">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
