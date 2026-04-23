import { useState } from "react";
import { NavLink } from "react-router-dom";

import { Card, Eyebrow, Icon } from "../components/ui";
import ChatPanel from "../components/chat/ChatPanel";
import { useProjectState } from "../hooks/useProjectState";
import { getActiveProject } from "../lib/adapters/projectsIndex";

/**
 * Chat fullpage — iter-18m. Conversations sidebar + embedded ChatPanel
 * (shared with the drawer mode). Bundle parity : 300 px left rail with
 * a "New conversation" CTA, timestamped conversation titles, active
 * highlight, active-project card at the bottom.
 *
 * Conversations are local only for now — the bundle showed 5 sample
 * entries ; wiring persistence is out of scope for this iteration.
 */

type Convo = {
  id: string;
  label: string;
  when: string;
  active?: boolean;
};

const SAMPLE_CONVOS: Convo[] = [
  { id: "now", label: "Atelier density debate", when: "Now", active: true },
  { id: "hc", label: "Brief check — 120 vs 100 staff", when: "2h ago" },
  { id: "mb", label: "Mood board pigment direction", when: "Yesterday" },
  { id: "flex", label: "Flex policy Tuesday peak", when: "Yesterday" },
  { id: "src", label: "Initial programme sourcing", when: "2d ago" },
];

export default function Chat() {
  const project = useProjectState();
  const active = getActiveProject();
  const [convos, setConvos] = useState<Convo[]>(SAMPLE_CONVOS);

  const newConversation = () => {
    setConvos([
      {
        id: `c-${Date.now()}`,
        label: "New conversation",
        when: "Now",
        active: true,
      },
      ...convos.map((c) => ({ ...c, active: false })),
    ]);
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
          {convos.map((c) => (
            <button
              key={c.id}
              onClick={() =>
                setConvos((prev) =>
                  prev.map((x) => ({ ...x, active: x.id === c.id })),
                )
              }
              className={[
                "rounded-md px-3 py-2.5 text-left transition-colors",
                c.active
                  ? "bg-canvas border border-forest"
                  : "border border-transparent hover:bg-canvas",
              ].join(" ")}
            >
              <div className="mono text-[10px] uppercase text-mist-500">
                {c.when.toUpperCase()}
              </div>
              <div className="mt-0.5 text-[13px] font-medium text-ink">
                {c.label}
              </div>
            </button>
          ))}
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
        <ChatPanel mode="fullpage" />
      </div>
    </div>
  );
}
