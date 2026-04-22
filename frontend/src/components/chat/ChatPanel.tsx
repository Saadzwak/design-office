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

// SSE through Vite dev proxy can buffer the response until the generation
// finishes, which makes the drawer appear frozen. We only opt into streaming
// when the page URL carries `?stream=1`; by default use the non-streaming
// endpoint for a snappier, reliable UX.
const STREAMING_BY_DEFAULT = false;

type Mode = "drawer" | "fullpage";

type Props = {
  mode: Mode;
  onClose?: () => void;
};

const PAGE_HELLO: Record<string, string> = {
  landing: "Bonjour. Je peux vous aider à démarrer un projet, expliquer les 4 surfaces, ou citer une source. Sur quoi voulez-vous travailler ?",
  brief: "Nous sommes sur le Brief. Posez-moi une question sur le programme Lumen, ou demandez-moi de re-synthétiser avec un autre angle.",
  testfit: "Nous sommes sur le Test Fit. Je peux commenter les 3 variantes, recommander la meilleure pour Lumen, ou proposer une itération (« agrandis la boardroom »).",
  justify: "Nous sommes sur Justify. Je peux résumer l'argumentaire, isoler l'argument acoustique / PMR / biophilie, ou proposer une variante de phrasing.",
  export: "Nous sommes sur Export. Je peux vous aider à choisir l'échelle du DWG, expliquer les 5 calques Design Office, ou lancer l'export directement.",
  chat: "Bonjour. Comment puis-je aider sur Lumen ?",
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
      // Dispatch to the right Design Office endpoint. The ChatPanel only
      // initiates the call — pages re-render from localStorage on refocus.
      try {
        if (act.type === "iterate_variant") {
          // Run iterate by posting to the existing endpoint using the
          // current testfit result in localStorage as the base.
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
          setMessages((ms) => [
            ...ms,
            {
              role: "assistant",
              content: `✓ Itération appliquée sur \`${style}\`. Rafraîchissez /testfit pour voir la variante mise à jour.`,
            },
          ]);
        } else if (act.type === "export_dxf") {
          navigate("/export");
        } else if (act.type === "regenerate_argumentaire") {
          navigate("/justify");
        } else if (act.type === "regenerate_variants") {
          navigate("/testfit");
        } else if (act.type === "regenerate_programme") {
          navigate("/brief");
        } else {
          setError(`Unsupported action type: ${act.type}`);
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
      <div className="flex items-center justify-between border-b border-neutral-500/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-terracotta/15">
            <Sparkles className="h-4 w-4 text-terracotta" />
          </span>
          <div>
            <p className="font-serif text-sm leading-none">Ask Design Office</p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
              {context.page} · Opus 4.7
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setMessages([]);
              setAction(null);
              clearConversation();
            }}
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-700/30 hover:text-bone-text"
            title="Clear conversation"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          {mode === "drawer" ? (
            <>
              <button
                onClick={() => navigate("/chat")}
                className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-700/30 hover:text-bone-text"
                title="Expand to full page"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
              <button
                onClick={onClose}
                className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-700/30 hover:text-bone-text"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate(-1)}
              className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-700/30 hover:text-bone-text"
              title="Back to app"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !streamedReply && (
          <div className="rounded-xl border border-neutral-500/20 bg-neutral-800/30 p-3 text-sm text-neutral-300">
            {hello}
          </div>
        )}
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} text={m.content} />
        ))}
        {pending && streamedReply && <Bubble role="assistant" text={streamedReply} streaming />}
        {pending && !streamedReply && (
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-terracotta" />
            Opus is thinking…
          </div>
        )}
        <AnimatePresence>
          {action && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-xl border border-terracotta/40 bg-terracotta/5 p-3"
            >
              <p className="font-mono text-[10px] uppercase tracking-widest text-terracotta">
                Action suggérée
              </p>
              <p className="mt-1 text-sm text-bone-text">{action.label}</p>
              <p className="mt-1 font-mono text-[11px] text-neutral-400">
                {action.type}
                {action.params && Object.keys(action.params).length
                  ? " · " + JSON.stringify(action.params).slice(0, 80)
                  : ""}
              </p>
              <div className="mt-3 flex gap-2">
                <button className="btn-primary" onClick={() => confirmAction(action)}>
                  Appliquer
                </button>
                <button className="btn-ghost" onClick={() => setAction(null)}>
                  Annuler
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {error && (
          <div className="rounded-xl border border-terracotta/50 bg-terracotta/10 p-3 text-xs text-terracotta">
            {error}
          </div>
        )}
        <div ref={scrollAnchorRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-neutral-500/20 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder={
              context.page === "testfit"
                ? "Agrandis la boardroom, résume l'argument acoustique…"
                : "Posez votre question…"
            }
            className="min-h-[48px] flex-1 resize-none rounded-xl border border-neutral-500/30 bg-neutral-800/40 px-3 py-2 font-sans text-sm text-bone-text focus:border-terracotta/60 focus:outline-none"
            rows={2}
          />
          <button
            onClick={() => send()}
            disabled={!draft.trim() || pending}
            className="btn-primary h-10 px-3"
            title="Send (Enter)"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 font-mono text-[10px] text-neutral-500">
          Enter envoie · Shift+Enter nouvelle ligne
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
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-neutral-700/50 text-bone-text"
            : "border border-neutral-500/20 bg-neutral-800/40 text-bone-text",
          streaming ? "ring-1 ring-terracotta/40" : "",
        ].join(" ")}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{text}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none [&_p]:my-1 [&_pre]:whitespace-pre-wrap [&_code]:break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
