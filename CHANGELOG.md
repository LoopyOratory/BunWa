# Changelog

All notable changes to BunWa are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
calendar versioning: `YYYY.MINOR.PATCH`, where the minor number rises with
feature rounds and the patch with fixes inside a round. See
[RELEASING.md](RELEASING.md) for how a release is cut.

## [Unreleased]

### Added

- WhatsApp username support: research and implementation in progress, covering
  JID handling, send targets, docs, MCP tool descriptions and the console.

### Fixed

- Chat route: an unreachable database is reported as a database problem instead
  of the generic store message.
- Sessions list: the account column populates from the session's `me` payload
  instead of always showing a dash.

## [2026.10.0] - 2026-10-04

First tagged release since 2026.5.1. Covers the reliability, security and
deployment work done against a live shop deployment.

### Added

- **Anti-ban sending policy.** Per-session sliding windows for minute, hour and
  day caps, a reachout timelock for chats the session has never written to, a
  new-chat daily quota, a 14 day warm-up ramp with a floor, quiet hours, a
  global switch and a per-session bypass list. Enforced at every NOWEB send
  method, so REST, bulk and MCP are all covered, and surfaced as HTTP 429 with
  `Retry-After`. Endpoints: `GET` and `PUT /api/sessions/:session/policy`, plus
  `GET /api/sessions/:session/policy/usage`.
- **Per-session REST API keys** with action allowlists, modelled on the existing
  per-session MCP keys. The master `WAHA_API_KEY` and dashboard credentials keep
  full admin; scoped keys are limited to their own session and their listed
  actions, cannot reach any server level route, cannot manage keys, and are
  stored hashed. Managed from the session settings Access tab.
- **Template editing and use.** `PUT /api/sessions/:session/templates/:id`,
  `POST /api/sessions/:session/templates/:id/preview` and
  `POST /api/sessions/:session/templates/:id/send`, with the id segment also
  accepting a template name. Template list and single template responses now
  report the variables a template expects.
- **Structured interactive replies.** Messages that came from a button, list or
  flow selection now carry
  `interactive: {type, selectedId, selectedText, repliedToMessageId}`.
- **Templates and send from the console:** a variables dialog on the Templates
  page, and a template picker in the chat composer that previews through the
  server and sends to the open chat.
- **Four Compose deployments:** `docker-compose.yml` (SQLite default),
  `docker-compose.postgres.yml` (Postgres as the default database),
  `docker-compose.coolify.yml` and `docker-compose.1panel.yml`, all with a
  read-only root filesystem, no Linux capabilities, no-new-privileges, resource
  limits, a health check and environment guarded secrets.
- **`.env.example.minimal`** with only the values a production deployment needs.
- **Boot storage report and verification.** Startup logs the resolved driver and
  each database target with the password redacted, and verifies the database
  before serving: schema is created eagerly and an unreachable database stops
  startup with the real error.
- **n8n community node** in `integrations/n8n-nodes-bunwa`: 10 resources plus a
  trigger that registers its own webhook subscription and surfaces tapped button
  and list ids as `interactive.selectedId`, with install, test and publish
  tooling.
- **Project vault** in `vault/`: architecture, engines, the endpoint reference,
  features, MCP tools, security model, an honest gap list, an upstream watch
  against WAHA and OpenWA, plus an Obsidian canvas and base.
- Sessions list accepts a `name` filter.

### Changed

- **Templates follow the configured database.** They previously always used a
  local SQLite file, so they disappeared with the container on Postgres
  deployments. Session stores, templates, audit and the sending policy ledger
  now state which store they use at boot.
- **Chat route restyled to match WhatsApp Web:** conversation rail with search
  and filters, day separators, tailed bubbles in incoming grey and outgoing
  green, in-bubble timestamps with read ticks, quoted replies, reaction pills
  and a composer with an emoji picker and a microphone that becomes a send
  button.
- **Console design system:** semantic success, warning and error tokens wired
  into Tailwind, tinted shadows, a documented radius scale, tabular digits for
  numbers, one shared table shell, skeletons, empty states and error states with
  retry on every data view.
- **Bun 1.4.2 native APIs** replace Node equivalents: static serving with ETags
  and Range support, `Bun.CryptoHasher`, `Bun.S3Client` replacing the AWS SDK,
  `Bun.gzipSync`, `Bun.sleep` and `Bun.randomUUIDv7`. Runtime dependencies fell
  from 37 to 29.
- **Interactive messages are wrapped in the view once envelope**, which is what
  makes buttons and lists tappable. Verified live.
- **1Panel deployment pulls the published image** with named volumes, so no host
  directory preparation is required.
- Documentation: the README was rewritten with measured numbers, Mermaid diagrams
  for the architecture, request path, session lifecycle, button round trip and
  webhook delivery, plus a troubleshooting section.

### Fixed

- **Buttons and lists could not be tapped.** The payload was sent as a bare
  interactive message; WhatsApp clients only treat it as actionable inside the
  view once envelope.
- **`sendButtons` crashed on the Plus tier** whenever no header image was given,
  because the Plus `uploadMedia` override lost the Core guard.
- **`POST /api/sendSticker` always failed** with a 400: its route had no
  `:session` path parameter for the session resolver.
- **`GET /api/messages` returned an empty array** instead of messages.
- **An unknown `WAHA_DATABASE_DRIVER` silently used SQLite.** Unrecognised values
  now stop the boot and name the accepted values.
- **The dashboard sent a hardcoded `x-api-key`**, which broke every data call on
  a server with a real key set.
- **The console explained a store-disabled or unreachable database** instead of
  showing a generic failure.
- Cross-chat edits and revokes are dropped rather than applied.
- Two long standing test failures caused by tsyringe resolving `AuditService`
  without an instance registration.
- Invalid CSS, a duplicated status dot block, an ineffective oklch glow, a
  global `!important` on input height, and JetBrains Mono never being loaded.

### Security

- Per-session REST keys cannot read or write another session, cannot reach server
  level routes, cannot manage key material and cannot probe for the existence of
  other sessions: denial responses are identical for missing and forbidden
  sessions.
- Failed authentication attempts, session lifecycle changes and webhook
  delivery outcomes are recorded in the audit log with retention.

[Unreleased]: https://github.com/LoopyOratory/BunWa/compare/v2026.10.0...HEAD
[2026.10.0]: https://github.com/LoopyOratory/BunWa/releases/tag/v2026.10.0
