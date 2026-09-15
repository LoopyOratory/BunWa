---
type: note
section: meta
tags: [bunwa, reference, vault]
updated: 2026-09-14
---

# 🧭 Vault Guide

How this vault is organised, and how to keep it true.

## Conventions

| Thing | Rule |
|---|---|
| Frontmatter | every note has `type` (`dashboard`/`project`/`note`/`feature`), `tags`, `updated` |
| Feature notes | also carry `status` (`shipped`/`partial`/`stub`/`gap`), `engine`, `tier`, `endpoints` so [[Feature Tracker.base]] can query them |
| Source of truth | the code. Every note names the files it describes — if a note and `src/` disagree, fix the note |
| Links | `[[Wikilinks]]` between notes; file paths are written as `` `src/...` `` inline code |
| Emoji | used in headings only, to make the graph and outline scannable |
| Status tags | `#active` `#partial` `#stub` `#gap` `#done` — styled by the vault snippet |

## Sections

| Folder | Contains |
|---|---|
| `01 Architecture` | runtime shape, request path, DI, data layout |
| `02 Engines` | engine abstraction, NOWEB, WEBJS, stores, proxying |
| `03 API` | REST surface, endpoint reference, WebSocket, API docs |
| `04 Features` | one note per functional area of the product |
| `05 MCP` | MCP server and the 43-tool reference |
| `06 Security` | auth/policy/SSRF model, plus the honest gap list |
| `07 Frontend` | the React dashboard |
| `08 Ops` | configuration, runbook, Docker, health, testing |
| `09 Development` | conventions, fix history, roadmap |
| `10 Reference` | glossary, upstream parity, Base + Canvas views |
| `Templates` | new-note and new-feature templates |
| `Inbox` | scratch — promote notes out of here once they're real |

## Keeping it current

Useful triggers for updating the vault:

- **New endpoint** → add it to [[Endpoints by Domain]] and the owning feature note.
- **New env var** → [[Configuration Reference]], *and* `.env.example` in the repo.
- **Fixed a bug** → add a row to [[Fix History]].
- **Finished or broke a subsystem** → flip `status:` in the feature note and [[Known Gaps and Stubs]].
- **Version bump** → [[BunWa]] identity table and [[Home]].

## What this vault is not

It is not a replacement for `README.md` (user-facing setup) or `CLAUDE.md` (agent orientation).
It is the *engineering* view: how the thing is put together, what is real, what is stubbed, and
where to look. `docs/PROJECT.md` in the repo is the pre-vault feature log, kept for history.
