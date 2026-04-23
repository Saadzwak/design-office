import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import { Card, Eyebrow, Icon } from "../components/ui";
import ChatPanel from "../components/chat/ChatPanel";
import { useProjectState } from "../hooks/useProjectState";
import { getActiveProject } from "../lib/adapters/projectsIndex";
import {
  createConversation,
  deleteConversation,
  getActiveConversationId,
  listConversations,
  onConversationsChange,
  setActiveConversation,
  type Conversation,
} from "../lib/chat";

/**
 * Chat fullpage — iter-20b rewrite.
 *
 * Conversations live in `lib/chat.ts` now (multi-convo persistence).
 * The sidebar reflects the real list, clicking one switches the
 * active conversation (ChatPanel re-renders against `loadConversation`
 * which reads the active convo), "+ New conversation" mints a fresh
 * empty convo and flips active to it. A per-row trash icon deletes.
 */

export default function Chat() {
  const project = useProjectState();
  const active = getActiveProject();
  const [convos, setConvos] = useState<Conversation[]>(() => listConversations());
  const [activeId, setActiveId] = useState<string | null>(() =>
    getActiveConversationId(),
  );
  // Used to force-remount ChatPanel when the active convo changes so
  // its internal `useState(() => loadConversation())` reads the new
  // convo's messages instead of the previous one's.
  const panelKey = activeId ?? "none";

  useEffect(() => {
    const unsub = onConversationsChange(({ convos: next, activeId: nextActive }) => {
      setConvos(next);
      setActiveId(nextActive);
    });
    return unsub;
  }, []);

  const pickConvo = (id: string) => {
    if (id === activeId) return;
    setActiveConversation(id);
    setActiveId(id);
  };

  const newConversation = () => {
    const created = createConversation();
    setActiveId(created.id);
  };

  const removeConversation = (id: string) => {
    const remaining = deleteConversation(id);
    setConvos(remaining);
    setActiveId(getActiveConversationId());
  };

  const formatWhen = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const diff = Date.now() - d.getTime();
    const h = Math.floor(diff / 3_600_000);
    if (h < 1) return "Now";
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    if (days < 2) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return d.toISOString().slice(0, 10);
  };

  return (
    <div className="grid h-screen" style={{ gridTemplateColumns: "300px 1fr" }}>
      <aside
        className="flex flex-col overflow-auto border-r border-mist-200 px-5 py-6"
        style={{ background: "var(--canvas-alt)" }}
      >
        <div className="mb-5 flex items-center justify-between">
          <NavLink
            to="/project"
            className="flex items-center gap-2 text-[13px] text-ink-soft hover:text-ink"
          >
            <Icon name="arrow-left" size={14} />
            Back to dashboard
          </NavLink>
        </div>

        <Eyebrow style={{ marginBottom: 14 }}>CONVERSATIONS</Eyebrow>
        <button
          onClick={newConversation}
          className="btn-primary btn-sm mb-5 w-full justify-center"
        >
          <Icon name="plus" size={12} /> New conversation
        </button>

        <div className="flex flex-col gap-1">
          {convos.map((c) => {
            const isActive = c.id === activeId;
            return (
              <div
                key={c.id}
                className={[
                  "group relative rounded-md px-3 py-2.5 transition-colors",
                  isActive
                    ? "bg-canvas border border-forest"
                    : "border border-transparent hover:bg-canvas",
                ].join(" ")}
              >
                <button
                  onClick={() => pickConvo(c.id)}
                  className="block w-full text-left"
                >
                  <div className="mono text-[10px] uppercase text-mist-500">
                    {formatWhen(c.updatedAt).toUpperCase()}
                  </div>
                  <div className="mt-0.5 truncate text-[13px] font-medium text-ink">
                    {c.label || "New conversation"}
                  </div>
                  <div className="mono mt-0.5 text-[10px] text-mist-400">
                    {c.messages.length} MSG
                  </div>
                </button>
                {convos.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeConversation(c.id);
                    }}
                    className="absolute right-2 top-2 hidden rounded p-1 text-mist-400 hover:bg-mist-100 hover:text-clay group-hover:block"
                    aria-label="Delete conversation"
                    title="Delete conversation"
                  >
                    <Icon name="x" size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <Eyebrow style={{ marginTop: 28, marginBottom: 12 }}>PROJECT</Eyebrow>
        <Card className="!p-3.5 text-[12px]">
          <div
            className="font-display"
            style={{
              fontSize: 18,
              fontVariationSettings: '"opsz" 72, "wght" 500, "SOFT" 100',
            }}
          >
            {active?.name ?? project.client.name ?? "New project"}
          </div>
          <div className="text-mist-600">
            {(active?.industry ?? project.client.industry)
              .replace(/_/g, " ")}
            {active ? ` · ${active.headcount} staff` : ""}
          </div>
          {active?.ref && (
            <div className="mono mt-1.5 text-mist-500">{active.ref}</div>
          )}
        </Card>
      </aside>

      <div className="flex flex-col overflow-hidden">
        <ChatPanel key={panelKey} mode="fullpage" />
      </div>
    </div>
  );
}
