# Agents

BunWa agents are the shared brain for WhatsApp chat and live calls. One agent owns:

- a base prompt (pasted or built with the guided questions)
- skills — focused instructions appended to the prompt at runtime
- knowledge sources — text or URLs used for retrieval
- analytics events — conversation starts, closes, conversions, reviews
- a user profile — durable facts about the person on the other end

## Storage

The agent store runs on Postgres or SQLite through the same SQL layer:

| Driver | Configuration |
| --- | --- |
| Postgres | `BUNWA_DATABASE_URL` (or `WAHA_DATABASE_URL`) |
| SQLite | `BUNWA_AGENT_DB_PATH` (default `data/bunwa-agent.sqlite`) |

Tables:

- `bunwa_agents`
- `bunwa_agent_skills`
- `bunwa_knowledge_sources`
- `bunwa_user_profiles`
- `bunwa_conversations`
- `bunwa_analytics_events`

The SQLite path is the lighter build. The Postgres build is the production default.

## Redis

Redis is optional and used only as a cache. Set `BUNWA_REDIS_URL`
(or `REDIS_URL`) to enable it; without a URL every read falls back to the
database. Bun's built-in Redis client is used, so this adds no dependency.

Cached today: the agent analytics summary (10 s TTL). Cache failures are
ignored — Redis is never the source of truth.

## Prompt builder

`GET /api/agents/builder/questions` returns the question list.
`POST /api/agents/builder/next` takes the answers so far and returns the next
question plus a live prompt preview.
`POST /api/agents/builder/prompt` returns the composed prompt.

The admin can switch to paste mode at any time and edit the prompt directly.

## Creating an agent

`POST /api/agents` accepts the agent fields plus optional `skills` and
`knowledge` arrays, so the whole wizard can be submitted in one request.

```json
{
  "name": "Vei's Support",
  "prompt": "You are…",
  "model": "gemini-3.8-flash",
  "voice": "Aoede",
  "settings": { "reviewEnabled": true },
  "skills": [{ "name": "Order lookup", "instructions": "…" }],
  "knowledge": [{ "name": "Refund policy", "kind": "text", "content": "…" }]
}
```

## Effective prompt

`GET /api/agents/:id/effective-prompt` returns the base prompt with every
enabled skill appended under `## Skills`. The runtime should use this value,
not the raw `prompt` field.

## Analytics and reviews

Events are generic and queryable:

- `conversation.started`
- `conversation.closed`
- `conversion`
- `review.requested`
- `review.submitted`

`GET /api/agents/analytics` returns agents, conversations, closed
conversations, conversions, conversion rate, review count, average rating,
and event counts.

### Review before close

`POST /api/agents/conversations/:id/schedule-close` schedules two timers:

1. a review message at `closesInSeconds - reviewLeadSeconds` (default 10 s
   before close)
2. the conversation close at `closesInSeconds`

```json
{
  "session": "calltest",
  "chatId": "233500000000@c.us",
  "closesInSeconds": 60,
  "reviewLeadSeconds": 10,
  "message": "How would you rate this chat? Reply 1–5."
}
```

Review collection is enabled per agent (`settings.reviewEnabled`) and can be
overridden per conversation (`reviewEnabled`). A conversation with reviews
disabled still closes on schedule, but no review message is sent.

## Admin UI

`/agents` in the BunWa dashboard:

- lists agents with status and analytics
- creates an agent through a five-step wizard
- lets the admin build the prompt with questions or paste one
- adds skills and knowledge before creation
- opens an agent to edit the prompt, manage skills/knowledge, and inspect
  analytics

The page is admin-only; BunWa's existing dashboard shell and visual language
are preserved.
