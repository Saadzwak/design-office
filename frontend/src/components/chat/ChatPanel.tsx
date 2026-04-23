import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, Minimize2, Send, Sparkles, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useNavigate } from "react-router-dom";
import remarkGfm from "remark-gfm";

import { useChatContext } from "../../hooks/useChatContext";
import {
  clearConversation,
  loadConversation,
  saveConversation,
  sendChatMessage,
  streamChatMessage,
  type ChatMessage,
  type SuggestedAction,
} from "../../lib/chat";

const STREAMING_BY_DEFAULT = false;

type Mode = "drawer" | "fullpage";

type Props = {
  mode: Mode;
  onClose?: () => void;
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
    "We're on Export. I can help choose the DWG scale, explain the five Design Office layers, or trigger the export directly.",
  chat: "How can I help on the project?",
};

export default function ChatPanel({ mode, onClose }: Props) {
  const navigate = useNavigate();
  const context = useChatContext();
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadConversation());
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [streamedReply, setStreamedReply] = useState("");
  const [action, setAction] = useState<SuggestedAction | null>(null);
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
      try {
        if (act.type === "iterate_variant") {
          const raw = localStorage.getItem("design-office.testfit.result");
          if (!raw) throw new Error("No Test Fit result in this session yet.");
          const testfit = JSON.parse(raw);
          const style = (act.params as { style?: string }).style ?? "atelier";
          const variant = testfit.variants?.find((v: { style: string }) => v.style === style);
          if (!variant) throw new Error(`Variant '${style}' not found.`);
          const resp = await fetch("/api/testfit/iterate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              instruction: (act.params as { instruction?: string }).instruction ?? "",
              floor_plan: testfit.floor_plan,
              variant,
              programme_markdown: localStorage.getItem("design-office.programme") ?? "",
              client_name: "Lumen",
            }),
          });
          if (!resp.ok) throw new Error(await resp.text());
          const updated = await resp.json();
          const nextVariants = testfit.variants.map((v: { style: string }) =>
            v.style === style ? updated.variant : v,
          );
          localStorage.setItem(
            "design-office.testfit.result",
            JSON.stringify({ ...testfit, variants: nextVariants }),
          );
          if (updated.screenshot_url) {
            try {
              const rawMap = localStorage.getItem("design-office.testfit.live_screenshots");
              const map: Record<string, string> = rawMap ? JSON.parse(rawMap) : {};
              map[style] = updated.screenshot_url;
              localStorage.setItem(
                "design-office.testfit.live_screenshots",
                JSON.stringify(map),
              );
            } catch {
              // ignore
            }
          }
          setMessages((ms) => [
            ...ms,
            {
              role: "assistant",
              content: `✓ Iteration applied on \`${style}\`. Head back to /testfit to see the updated variant.`,
            },
          ]);
        } else if (act.type === "export_dwg" || act.type === "export_dxf") {
          // "export_dxf" is kept as a backward-compat alias for older sessions.
          navigate("/export");
        } else if (act.type === "start_justify" || act.type === "regenerate_argumentaire") {
          navigate("/justify");
        } else if (act.type === "start_macro_zoning" || act.type === "regenerate_variants") {
          navigate("/testfit");
        } else if (act.type === "start_brief" || act.type === "regenerate_programme") {
          navigate("/brief");
        } else if (act.type === "start_micro_zoning") {
          navigate("/testfit?tab=micro");
        } else if (act.type === "start_mood_board" || act.type === "generate_pitch_deck") {
          navigate("/moodboard");
        } else if (act.type === "update_project_field") {
          // Phase B wires this up to the unified project state. For now,
          // route to Brief so the user can hand-edit the field manually.
          navigate("/brief");
        } else {
          // Unknown / out-of-domain action → ignore silently and clear the
          // suggestion so the UI stays calm. The prompt enumerates the
          // allow-list; any other type is a bug to be logged, not exposed.
          console.warn(`[chat] ignoring unknown action type: ${act.type}`);
          setAction(null);
          return;
        }
        setAction(null);
      } catch (exc) {
        setError(exc instanceof Error ? exc.message : String(exc));
      }
    },
    [navigate],
  );

  const onKey: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-forest/10 text-forest">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="font-display text-[15px] leading-none text-ink" style={{ fontVariationSettings: '"opsz" 36, "wght" 520, "SOFT" 100' }}>
              Ask Design Office
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
          {action && (
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
        </AnimatePresence>
        {error && (
          <div className="rounded-lg border border-clay/40 bg-clay/5 p-3 text-[12px] text-clay">
            {error}
          </div>
        )}
        <div ref={scrollAnchorRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-hairline px-5 py-4">
        <div className="flex items-end gap-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder={
              context.page === "testfit"
                ? "Grow the boardroom, summarise the acoustic argument…"
                : "Ask a question, or propose a change…"
            }
            rows={2}
            className="min-h-[44px] flex-1 resize-none rounded-md border border-hairline bg-raised px-3 py-2 font-sans text-[14px] leading-relaxed text-ink placeholder:text-ink-muted focus:border-forest focus:outline-none focus:ring-2 focus:ring-forest/20"
          />
          <button
            onClick={() => send()}
            disabled={!draft.trim() || pending}
            className="btn-primary h-[44px] px-3"
            title="Send (Enter)"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-label text-ink-muted">
          Enter sends · Shift+Enter for a new line
        </p>
      </div>
    </div>
  );
}

function Bubble({
  role,
  text,
  streaming,
}: {
  role: ChatMessage["role"];
  text: string;
  streaming?: boolean;
}) {
  const isUser = role === "user";
  return (
    <div className={["flex", isUser ? "justify-end" : "justify-start"].join(" ")}>
      <div
        className={[
          "max-w-[85%] rounded-lg px-3.5 py-2.5 text-[14px] leading-relaxed",
          isUser
            ? "bg-mist-100 text-ink"
            : "border border-hairline bg-raised text-ink",
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
      </div>
    </div>
  );
}
