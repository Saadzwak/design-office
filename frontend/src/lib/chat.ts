/**
 * Cross-page chat client helpers. Talks to /api/chat/message (non-streaming)
 * and /api/chat/stream (SSE). Mirrors `backend/app/chat.py` types.
 */

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type PageName = "landing" | "brief" | "testfit" | "justify" | "export" | "chat";

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

const STORAGE_KEY = "design-office.chat.messages";
const MAX_STORED = 40;

export function loadConversation(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-MAX_STORED);
  } catch {
    return [];
  }
}

export function saveConversation(messages: ChatMessage[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED)));
  } catch {
    // quota full or storage disabled — ignore.
  }
}

export function clearConversation(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
