# Chat behaviour — Ask Archoff

The floating chat drawer (and the `/chat` full-page view) is not a
generic Q&A bot. It is a **project assistant** — it reads the project
state on every turn and it can act on it.

---

## Page awareness

Every chat turn carries a `PageContext` to the backend:

```ts
{
  page: "landing" | "brief" | "testfit" | "moodboard" | "justify" | "export" | "chat";
  data: {
    client: { name, industry, logo_data_url },
    brief, programme_markdown, programme: {...},
    variants, verdicts, retained_style, floor_plan_summary,
    argumentaire_excerpt, justify: {pdf_id, pptx_id},
    mood_board: {pdf_id, palette},
    view_mode: "engineering" | "client"
  }
}
```

This is derived in `frontend/src/hooks/useChatContext.ts` from the
unified project state. The assistant therefore knows the user's brief,
programme, the three variants, the retained one, the argumentaire, the
mood-board palette, even which view mode they're in — without
re-fetching anything.

## The nine allowed actions

The system prompt enumerates the only action types the agent is
permitted to propose. Anything else is a bug and gets silently dropped
by the frontend dispatcher:

| type                    | backend endpoint                        | what it does                                          |
|-------------------------|-----------------------------------------|-------------------------------------------------------|
| `start_brief`           | `POST /api/brief/synthesize`            | Re-runs programme synthesis with the current brief    |
| `start_macro_zoning`    | `POST /api/testfit/generate`            | Regenerates the three variants on the current plan    |
| `start_micro_zoning`    | routes to `/testfit?tab=micro`          | Flips `retained_style`, opens the micro-zoning tab    |
| `start_mood_board`      | routes to `/moodboard`                  | Ensures a retained variant, opens the mood-board page |
| `start_justify`         | `POST /api/justify/generate`            | Runs the four-researcher argumentaire                 |
| `iterate_variant`       | `POST /api/testfit/iterate`             | Natural-language edit of a retained variant           |
| `export_dwg`            | `POST /api/export/dwg`                  | Renders the A1 DXF + triggers download                |
| `generate_pitch_deck`   | downloads the saved PPTX                | Streams the previously-rendered pitch deck back       |
| `update_project_field`  | frontend mutation                       | Persists a value enriched from the chat conversation  |

Each handler is implemented in
[`frontend/src/lib/chatActions.ts`](../frontend/src/lib/chatActions.ts)
as a single async function that:

1. Validates params against the current project state (e.g. macro-zoning
   needs a floor plan; justify needs a retained variant).
2. Calls the right endpoint.
3. Persists the result to the unified state (so every page sees it).
4. Returns an `ActionOutcome` — `{ kind: "ok", message, navigate? }` or
   `{ kind: "error", message }`.

The UI shows a "Running · <label>" bubble with pulsing dots during the
call and posts a success / failure bubble afterwards.

## Enrichment from conversation

The chat also **detects project parameters the user mentions in plain
text** and offers to update the project state. This runs client-side
via regex patterns in `detectEnrichment()` before the round-trip to
Opus, so the confirmation card pops up as soon as the user hits send:

- `headcount` — "we have 120 staff / people / employees / team / FTE /
  heads" → integer.
- `growth_target` — "grow to 170", "target 170", "scale up to 170",
  "projected to reach 170" → integer.
- `flex_policy` — "3 days on-site, 2 remote", "hybrid 3/2" → string.
- `industry` — "law firm / fintech / bank / consulting / creative
  agency / healthcare / public sector" keyword match → one of the 8
  profile keys.

If the detected value differs from what's currently stored, a sand-
deep enrichment card appears:

> **Project update detected** — I heard "_we actually have 140 staff_".
> The project currently records **headcount** as `120`. Update to `140`?
>
> [ Update project ]  [ Keep as is ]

On confirm, the value is persisted via the matching setter
(`setProgramme`, `setClient`) and every page sees the new value
immediately.

## Project summary strip

Every chat render carries a one-line "working on" strip at the top of
the drawer:

```
Working on · Lumen · Tech startup · 120 staff · → 170 at horizon · flex 3 days on-site, 2 remote · retained: atelier
```

It updates in real time as the unified project state mutates, so the
user can confirm the chat is actually looking at the right project
before sending a message.

## Hard rules (in the system prompt)

- Default language: **English**. Switch to French only if the user's
  most recent message is unambiguously in French.
- Domain scope: **interior office fit-out only**. Any question about
  electrical engineering (TGBT, CTA), HVAC calculations beyond EN
  12464 thresholds, structural, MEP, urban planning, residential,
  hospitality, retail, legal advice → polite refusal + redirection.
- No fabrication. If unsure, say so. Cite `design://<resource>` URIs
  when pulling from MCP resources.
- Concise — 3–6 sentences for Q&A, one paragraph max for analysis. The
  chat is a sidebar, not an essay drawer.
- One action per turn, and only from the allow-list above.

See [`backend/app/prompts/agents/chat_assistant.md`](../backend/app/prompts/agents/chat_assistant.md)
for the full prompt.
