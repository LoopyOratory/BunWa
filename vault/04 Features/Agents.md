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
- `bunwa_user_profile_facts`
- `bunwa_user_profile_summaries`
- `bunwa_user_segments`
- `bunwa_conversations`
- `bunwa_analytics_events`

The SQLite path is the lighter build. The Postgres build is the production default.

## Redis

Redis is optional and used only as a cache. Set `BUNWA_REDIS_URL`
(or `REDIS_URL`) to enable it; without a URL every read falls back to the
database. Bun's built-in Redis client is used, so this adds no dependency.

Cached today: the agent analytics summary (10 s TTL). Cache failures are
ignored — Redis is never the source of truth.

## Model provider

`GET /api/agents/models/settings` returns the primary and fallback provider
settings. The API never returns the stored keys; it only reports whether one is
present.

`PUT /api/agents/models/settings` updates the provider, base URL, model, and
fallback model. Keys are write-only: omit them to keep the stored value, or send
`null` to clear.

`POST /api/agents/models/settings/test` calls the configured primary and
fallback models with a tiny prompt and reports each result in plain words.

Supported provider types today:

- `openai-compatible`
- `anthropic`

Agents also carry their own `model` and `fallbackModel` fields, so each bot can
choose different models on the same provider connection.

### Voice and call models

Voice and call have their own provider settings, separate from chat:

- `GET /api/agents/models/roles` lists every configured role.
- `GET /api/agents/models/roles/voice`
- `PUT /api/agents/models/roles/voice`
- `GET /api/agents/models/roles/call`
- `PUT /api/agents/models/roles/call`

Supported providers for voice and call:

- Fish Audio
- ElevenLabs
- Google
- GPT / OpenAI-compatible

Each role stores its own base URL, API key, model, fallback provider, fallback
base URL, fallback API key, and fallback model.

## MCP skills

BunWa's MCP server exposes WhatsApp capabilities as tools. The Agents dashboard
lists every tool the server publishes, grouped by category, so the admin can
select exactly which ones an agent may call.

`GET /api/mcp/tools` returns the full catalogue.
`GET /api/agents/:id/mcp` returns the agent's MCP settings.
`PUT /api/agents/:id/mcp` updates them:

```json
{
  "enabled": true,
  "allowedTools": ["MessageSendText", "SessionGet"],
  "deniedTools": [],
  "destructiveOps": false
}
```

`enabled: false` keeps the selections but stops the agent from calling MCP.
An empty `allowedTools` list means the agent has no MCP access.

## External MCP servers

BunWa can also call tools hosted on third-party MCP servers:

- `GET /api/mcp/external/servers`
- `POST /api/mcp/external/servers`
- `PUT /api/mcp/external/servers/:id`
- `DELETE /api/mcp/external/servers/:id`
- `POST /api/mcp/external/servers/:id/refresh`

Each server stores:

- `name`
- `description`
- `url` (the remote MCP endpoint)
- `headers` (auth tokens and other JSON headers; encrypted at rest)
- `enabled`
- `lastRefreshedAt` / `lastError`

Header values are sealed with AES-256-GCM before they are written. The list
endpoint returns `headerNames` only; `GET /api/mcp/external/servers/:id/headers`
is the admin-only reveal action. The same rule applies to every issued key:
authentication uses a SHA-256 hash, and an encrypted copy exists only for the
admin "view key" action.

Refreshing a server connects to it with the MCP client, imports its tool list,
and caches the tools locally. External tools are namespaced as
`ext__<serverId>__<tool>` so two servers can expose the same remote name without
colliding with each other or with BunWa's built-in tools. The original name is
kept as `remoteName`, and older allowlists that stored the raw name still work.

## Agent tool keys

Live agents that call tools over MCP use a per-agent key:

- `POST /api/agents/:id/mcp/key` issues `sk_agent_...` and returns it once.
- `GET /api/agents/:id/mcp/key` reveals the sealed copy to an authenticated admin.
- `DELETE /api/agents/:id/mcp/key` revokes it.

An agent key is an explicit allowlist: it can only see and call the tools in
`settings.mcp.allowedTools`, it cannot call session-scoped tools (use a session
MCP key for those), and an empty allowlist means no access. Every issued key is
stored as a hash; the sealed copy is only for the dashboard reveal action.

## Knowledge base

Agents can carry text pasted in the dashboard or documents uploaded as PDF,
DOCX, TXT, Markdown, CSV, or JSON. The built-in embedding model is
`bge-small-en-v1.5` (BAAI, MIT): 384 dimensions, 8-bit ONNX, pinned and
SHA-256 checked, fetched at Docker build time into `.cache/models`. No hosted
embedding service is required.

On save the source is split into ~900-character chunks with 120 characters of
overlap (paragraph and sentence boundaries first), embedded locally, and
written to the vector index:

- SQLite: `bunwa_knowledge_vec`, a `sqlite-vec` `vec0` table using cosine distance.
- Postgres: `bunwa_knowledge_chunks.embedding vector(384)` via pgvector.

`GET /api/agents/:id/knowledge` returns source status, `chunkCount`, and the
embedding model. `GET /api/agents/:id/knowledge/:sourceId/chunks` returns the
text the retriever sees. `GET /api/agents/:id/knowledge/search?q=…` runs a
query. `GET /api/agents/:id/effective-prompt?query=…` appends the top four
matching passages under `## Knowledge`.

The dashboard Knowledge tab shows an indexing spinner, the chunk count, the
model name, any failure reason, and a **View chunks** dialog. The agent wizard
accepts pasted text immediately; uploaded files are indexed after the agent is
created. Scanned PDFs need OCR and are rejected with a clear message.

## User profiles

A profile is a small set of decision-relevant facts about one person, shared by
chat and calls. It is not a biography: it should change how the agent replies,
not become a dossier.

Three layers:

- `bunwa_user_profiles` — identity, tags, preferences, important details, notes.
- `bunwa_user_profile_facts` — evidence-linked facts with `kind`, `key`, `value`,
  `confidence`, `source`, `evidence`, `sensitivity`, and `status`.
- `bunwa_user_segments` — computed labels such as `lifecycle=active` or
  `value=high`, each with a reason.

Facts are superseded, not overwritten: when a new value contradicts an active
fact with the same key, the old row becomes `superseded` and a new row becomes
`active`. Deleting a fact marks it `deleted` so the history survives.

### API

- `GET /api/agents/profiles?limit=100`
- `GET /api/agents/profiles/:userId`
- `PUT /api/agents/profiles/:userId`
- `GET /api/agents/profiles/:userId/facts`
- `POST /api/agents/profiles/:userId/facts`
- `PUT /api/agents/profiles/:userId/facts/:factId`
- `DELETE /api/agents/profiles/:userId/facts/:factId`
- `POST /api/agents/profiles/:userId/extract`
- `GET /api/agents/profiles/:userId/context`
- `GET|PUT /api/agents/profiles/:userId/summary`
- `POST /api/agents/profiles/:userId/summarize`
- `GET|POST /api/agents/profiles/:userId/segments`
- `DELETE /api/agents/profiles/:userId/segments/:segmentId`

`GET /context` returns the block the agent should receive:

```text
<user_profile>
Identity: Ama Mensah; 233500009999.
Tags: vip, repeat buyer.
Preferences: language: English; channel: WhatsApp voice notes.
Important: plan: Gold; renewal: 2026-12-01.
Communication: tone=concise.
Goal: renewal=renew before December.
Segments: lifecycle=active.
Notes: Prefers short replies and voice notes over long texts.
</user_profile>
```

Only active facts with confidence `>= 0.7` are included. Facts marked
`sensitive` are excluded unless `?includeSensitive=1` is passed.

The runtime should call `GET /api/agents/:id/effective-prompt?userId=...` so the
agent prompt includes the `<user_profile>` block after its base prompt and
skills.

### Extraction

`POST /api/agents/profiles/:userId/extract` takes a conversation and writes new
facts:

```json
{
  "messages": [
    { "role": "user", "content": "Please keep replies short. I prefer voice notes." },
    { "role": "assistant", "content": "Got it." }
  ]
}
```

It uses the configured chat model (OpenAI-compatible, Anthropic, or Google),
falls back to the configured fallback model, and returns the saved facts. The
prompt caps the result at eight facts, requires evidence, and forbids inferring
sensitive traits.

### Dashboard

The **User profiles** page lists profiles, searches by name/phone/id/tag, and
opens a detail dialog with four tabs:

- **Overview** — identity, tags, preferences, important details, summary editor.
- **Facts** — paste a conversation to extract facts, or add one manually; each
  fact shows confidence, sensitivity, evidence, and source.
- **Segments** — add or remove lifecycle/value/engagement labels.
- **Prompt context** — the exact `<user_profile>` block, with copy.

## Tool compatibility

The same tool definition drives Fish webhook tools and Google function
declarations. The canonical shape lives in `src/core/tools/tool.types.ts`; the
validators and adapters are in the same folder.

- `POST /api/agents/tools/preview` validates a canonical tool and returns the
  Fish payload, the Google declaration, the Google OpenAPI variant, and the MCP
  descriptor.
- `toFishWebhookTool` maps to Fish's workspace webhook-tool payload with
  `parameter_mode: "strict"`, `execution_mode`, timeout, headers, body template
  and pre-tool speech. It refuses localhost/private URLs because Fish's hosted
  runtime cannot reach them.
- `toGoogleFunctionDeclaration` uses `parametersJsonSchema` by default, sets
  `behavior` to `BLOCKING` for blocking tools and `NON_BLOCKING` otherwise, and
  attaches the shared `{ ok, speak, data, error }` response schema.
- `toMcpToolDescriptor` exposes the same definition to ADK through
  `McpToolset`.

Parameter names must satisfy both providers: start with a letter or underscore,
then letters, digits or underscores, max 64 characters. The tool name uses the
same rule, max 64 characters.

The **Tools** step in the agent wizard shows a short setup guide with tabs for
the shared contract, Fish Audio and Google Live.

## Building an agent

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
