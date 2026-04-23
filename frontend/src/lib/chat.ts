/**
 * Cross-page chat client helpers. Talks to /api/chat/message (non-streaming)
 * and /api/chat/stream (SSE). Mirrors `backend/app/chat.py` types.
 */

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type PageName =
  | "landing"
  | "brief"
  | "testfit"
  | "moodboard"
  | "justify"
  | "export"
  | "chat";

export type PageContext = {
  page: PageName;
  data: Record<string, unknown>;
};

export type SuggestedAction = {
  type: string;
  label: string;
  params: Record<string, unknown>;
};

export type ChatResponse = {
  reply: string;
  tokens: { input: number; output: number };
  duration_ms: number;
  suggested_action: SuggestedAction | null;
};

export type ChatRequest = {
  messages: ChatMessage[];
  page_context: PageContext;
  max_tokens?: number;
};

export async function sendChatMessage(
  req: ChatRequest,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const r = await fetch("/api/chat/message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export type StreamEvent =
  | { kind: "token"; text: string }
  | { kind: "end"; reply: string; suggested_action: SuggestedAction | null; tokens: { input: number; output: number } }
  | { kind: "error"; message: string };

/**
 * Opens /api/chat/stream and yields parsed SSE events. Reads the text/event-
 * stream body using TextDecoder, splits on blank lines, emits kind-discrim
 * events the consumer can handle.
 */
export async function* streamChatMessage(
  req: ChatRequest,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent, void, void> {
  const r = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!r.ok) {
    yield { kind: "error", message: (await r.text()) || `HTTP ${r.status}` };
    return;
  }
  if (!r.body) {
    yield { kind: "error", message: "no response body" };
    return;
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Split on double-newline (SSE message boundary).
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() ?? "";
    for (const raw of parts) {
      if (!raw.trim()) continue;
      const lines = raw.split(/\r?\n/);
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        const payload = JSON.parse(data);
        if (event === "token") {
          yield { kind: "token", text: payload.text ?? "" };
        } else if (event === "end") {
          yield {
            kind: "end",
            reply: payload.reply ?? "",
            suggested_action: payload.suggested_action ?? null,
            tokens: payload.tokens ?? { input: 0, output: 0 },
          };
        } else if (event === "error") {
          yield { kind: "error", message: payload.message ?? "unknown" };
        }
      } catch (exc) {
        yield { kind: "error", message: (exc as Error).message };
      }
    }
  }
}

// ---------------------------------------------------------------------------
// localStorage conversation persistence
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Multi-conversation persistence — iter-20b (Saad #24).
//
// Before : a single `design-office.chat.messages` key held ONE conversation
// for the whole user. The `/chat` sidebar showed 5 sample rows that
// clicking did nothing, and "+ New conversation" had no handler. Now
// every conversation lives in a list under `design-office.chat.convos.v1`
// with a stable id + label + messages + timestamps, plus an active-id
// pointer. The legacy single-key messages migrate to one initial convo.
// ---------------------------------------------------------------------------

const LEGACY_KEY = "design-office.chat.messages";
const CONVOS_KEY = "design-office.chat.convos.v1";
const ACTIVE_KEY = "design-office.chat.active_convo";
const MAX_STORED = 40;
export const CONVOS_EVENT = "design-office:chat-convos-changed";

export type Conversation = {
  id: string;
  label: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
};

function mintId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `c-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `c-${Math.random().toString(36).slice(2, 10)}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

function readRaw(): { convos: Conversation[]; activeId: string | null } {
  try {
    const raw = localStorage.getItem(CONVOS_KEY);
    const active = localStorage.getItem(ACTIVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return { convos: parsed, activeId: active };
      }
    }
  } catch {
    // fall through
  }
  return { convos: [], activeId: null };
}

function migrateIfNeeded(): { convos: Conversation[]; activeId: string | null } {
  const current = readRaw();
  if (current.convos.length > 0) return current;

  // No v1 storage yet — migrate the legacy single-conversation key.
  let legacy: ChatMessage[] = [];
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) legacy = parsed;
    }
  } catch {
    /* ignore */
  }

  const now = isoNow();
  const initial: Conversation = {
    id: mintId(),
    label: inferLabel(legacy) || "Current conversation",
    messages: legacy.slice(-MAX_STORED),
    createdAt: now,
    updatedAt: now,
  };
  writeRaw([initial], initial.id);
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
  return { convos: [initial], activeId: initial.id };
}

function writeRaw(convos: Conversation[], activeId: string | null): void {
  try {
    localStorage.setItem(CONVOS_KEY, JSON.stringify(convos));
    if (activeId) {
      localStorage.setItem(ACTIVE_KEY, activeId);
    } else {
      localStorage.removeItem(ACTIVE_KEY);
    }
    window.dispatchEvent(
      new CustomEvent<{ convos: Conversation[]; activeId: string | null }>(
        CONVOS_EVENT,
        { detail: { convos, activeId } },
      ),
    );
  } catch {
    /* quota full / disabled — non-fatal */
  }
}

function inferLabel(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New conversation";
  const text = firstUser.content.trim().replace(/\s+/g, " ");
  return text.length > 48 ? text.slice(0, 45).trimEnd() + "…" : text;
}

export function listConversations(): Conversation[] {
  const { convos } = migrateIfNeeded();
  return convos;
}

export function getActiveConversationId(): string | null {
  const { convos, activeId } = migrateIfNeeded();
  if (activeId && convos.some((c) => c.id === activeId)) return activeId;
  return convos[0]?.id ?? null;
}

export function setActiveConversation(id: string): void {
  const { convos } = migrateIfNeeded();
  if (!convos.some((c) => c.id === id)) return;
  writeRaw(convos, id);
}

export function createConversation(label?: string): Conversation {
  const { convos } = migrateIfNeeded();
  const now = isoNow();
  const next: Conversation = {
    id: mintId(),
    label: label || "New conversation",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  writeRaw([next, ...convos], next.id);
  return next;
}

export function deleteConversation(id: string): Conversation[] {
  const { convos, activeId } = migrateIfNeeded();
  const remaining = convos.filter((c) => c.id !== id);
  const nextActive =
    activeId === id ? remaining[0]?.id ?? null : activeId;
  if (remaining.length === 0) {
    // Always keep at least one empty shell so the UI never goes blank.
    const shell = createConversation();
    return [shell];
  }
  writeRaw(remaining, nextActive);
  return remaining;
}

export function onConversationsChange(
  listener: (data: { convos: Conversation[]; activeId: string | null }) => void,
): () => void {
  const handler = (e: Event) => {
    const custom = e as CustomEvent<{
      convos: Conversation[];
      activeId: string | null;
    }>;
    if (custom.detail) listener(custom.detail);
  };
  window.addEventListener(CONVOS_EVENT, handler as EventListener);
  return () =>
    window.removeEventListener(CONVOS_EVENT, handler as EventListener);
}

// ---------------------------------------------------------------------------
// Messages API — reads + writes against the active conversation so existing
// ChatPanel callers don't need to know about the multi-convo structure.
// ---------------------------------------------------------------------------

export function loadConversation(): ChatMessage[] {
  const { convos, activeId } = migrateIfNeeded();
  const target = convos.find((c) => c.id === activeId) ?? convos[0];
  return target ? target.messages.slice(-MAX_STORED) : [];
}

export function saveConversation(messages: ChatMessage[]): void {
  const { convos, activeId } = migrateIfNeeded();
  const active = activeId ?? convos[0]?.id;
  if (!active) {
    // No convo yet — mint one to hold the messages.
    const c = createConversation(inferLabel(messages));
    writeRaw(
      [{ ...c, messages: messages.slice(-MAX_STORED), updatedAt: isoNow() }],
      c.id,
    );
    return;
  }
  const updated = convos.map((c) =>
    c.id === active
      ? {
          ...c,
          messages: messages.slice(-MAX_STORED),
          updatedAt: isoNow(),
          label:
            c.label === "New conversation" && messages.some((m) => m.role === "user")
              ? inferLabel(messages) || c.label
              : c.label,
        }
      : c,
  );
  writeRaw(updated, active);
}

export function clearConversation(): void {
  const { convos, activeId } = migrateIfNeeded();
  const active = activeId ?? convos[0]?.id;
  if (!active) return;
  const updated = convos.map((c) =>
    c.id === active
      ? { ...c, messages: [], updatedAt: isoNow() }
      : c,
  );
  writeRaw(updated, active);
}
