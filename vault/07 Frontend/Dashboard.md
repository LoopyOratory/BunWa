---
type: note
section: frontend
tags: [bunwa, frontend, ui]
updated: 2026-09-14
source: frontend/
status: shipped
---

# 🖥️ Dashboard

A React SPA that talks to the same process over `/api` and `/ws`. In production it is **served by the
Bun server** from `frontend-dist/`; in development Vite serves it with HMR and proxies the API.

## Stack (exact versions from `frontend/package.json`)

| Layer | Choice |
|---|---|
| Framework | **React 19.2** + React DOM 19.2 |
| Build | **Vite 8** (`@vitejs/plugin-react` 6), TypeScript ~6.0 |
| Styling | **Tailwind v4** (`@tailwindcss/vite`) — CSS-first, **no `tailwind.config.js`** |
| Components | **shadcn/ui**, style `radix-mira`, base colour `mist`, `radix-ui` 1.5 unified package, `lucide-react` icons, `class-variance-authority`, `tailwind-merge`, `tw-animate-css` |
| Routing | `react-router-dom` 7 (BrowserRouter) |
| Theming | `next-themes` (class strategy, **default dark**, system disabled) |
| Motion | `framer-motion` 12 (used in the session selector) |
| Misc | `qrcode` (pairing), `sonner` (toasts) |
| Fonts | `@fontsource-variable/oxanium` (headings) · `noto-sans` (body) |

> ⚠️ Installed but **unused**: `@tanstack/react-query`, `recharts`, `date-fns`. Data fetching is
> hand-rolled `fetch` in `src/lib/api.ts`; there is no cache layer. (Commit history mentions charts,
> so Recharts may be a leftover.)

## Layout

```text
frontend/src/
├── main.tsx · App.tsx            providers + routes
├── index.css                     ── design tokens (see below)
├── App.css                       component polish on data-slot selectors
├── lib/
│   ├── api.ts                    typed API client (~510 lines), auth headers
│   ├── auth.tsx                  AuthProvider / useAuth, Basic creds in localStorage
│   ├── use-websocket.ts          WS hook with 3 s auto-reconnect
│   └── utils.ts                  cn()
├── hooks/use-mobile.tsx
├── components/
│   ├── app-sidebar.tsx · page-layout.tsx · primitives.tsx · theme-provider.tsx
│   ├── ErrorBoundary.tsx · qr-code.tsx
│   ├── create-session-dialog.tsx · session-settings-dialog.tsx
│   ├── chat/                     chat-conversations, chat-header, chat-composer-wrapper, session-selector
│   └── ui/                       shadcn primitives (alert, badge, card, dialog, sidebar, table, tabs, …)
│       └── chat/                 vendored "chatcn"-style chat library (chat.css, layouts, features, hooks, security)
└── pages/                        14 pages (below)
```

## Pages

| Route | Page | What it does |
|---|---|---|
| `/` | Dashboard | stat cards, version/workers, sessions table with start/stop/restart/logout/delete/screenshot |
| `/sessions` | Sessions | same actions + QR/pairing entry, session detail dialog |
| `/sessions/:id/chat`, `/chat` | Chat | session selector, conversation list, live message thread, send text/media/voice/video/location/poll/buttons, edit/delete/pin/react, post statuses |
| `/workers` | Workers | worker instances table with semantic badges |
| `/apps` | Apps | Chatwoot app CRUD/enable |
| `/templates` | Templates | per-session message templates with variables |
| `/messages`, `/messages/:chatId` | Message Tester | send test messages, `checkNumberStatus` |
| `/logs` | Audit Logs | `GET /api/audit` with filters + CSV export |
| `/infrastructure` | Infrastructure | DB / storage / queue settings, save + restart |
| `/queue` | Queue Monitor | ⚠️ placeholder data derived from `/api/workers` — no real queue is wired |
| `/events` | Event Monitor | live `/ws` stream (500-entry buffer), filter, search, pause, download |
| `/docs` | Docs | iframe of `/api-docs/` |
| `*` | Login | unauthenticated fallback |

QR pairing lives in `session-detail-dialog.tsx` (QR refreshed every 5 s, phone pairing code, screenshot).
Webhook / proxy / engine / ignore / MCP settings live in `session-settings-dialog.tsx` tabs.

## Design system

Tokens are **oklch CSS variables** in `src/index.css` under `:root` and `.dark`, mapped to Tailwind
via `@theme inline`:

- **Primary green**: `oklch(0.841 0.238 128.85)` light · `oklch(0.768 0.233 130.85)` dark;
  `chart-1..5` is a green ramp; `--radius: 0.65rem`.
- **Semantic status tokens are wired into Tailwind**: `bg-success-bg`, `text-success-foreground`,
  `border-success-border`, plus the same triple for `warning` and `error`, and solid
  `bg-success`/`bg-warning`/`bg-error`/`bg-info` for dots. Pages must use these instead of raw
  palette utilities.
- **Elevation** shadows are tinted with the surface hue (`oklch(0.25 0.03 150 / …)`), not pure black.
- **Focus ring** uses the green `--ring` (dark enough for 3:1 in light mode).
- **Radius scale (documented rule)**: containers/cards/dialogs/tables `rounded-lg`, controls
  (buttons/inputs/tabs) `rounded-md`, pills/badges `rounded-full`.
- **Fonts**: `--font-heading` Oxanium, `--font-sans` Noto Sans, and **JetBrains Mono is now actually
  loaded** (`@fontsource-variable/jetbrains-mono`) — previously every `font-mono` fell back to a
  system font.
- **Numerals**: `.metric` / `<Metric>` applies tabular digits so counters and table columns stop
  jittering.
- **Status badges** come from the CSS classes fed by the semantic tokens, plus
  `StatusBadge`/`EngineBadge`/`SeverityBadge` components.
- **Chat themes**: `components/ui/chat/chat.css` defines four chat skins via `data-chat-theme`
  (`lunar` default, `aurora`, `ember`, `midnight`); outgoing bubbles use WhatsApp green, and the chat
  accent is derived from `var(--primary)` rather than a hardcoded hex.

### Redesign pass (2026-09-15)

A full console-modernisation pass touched every page, dialog and the shell:

| Area | What changed |
|---|---|
| **Semantic tokens** | The `--success/--warning/--error` triples existed but were never exposed to Tailwind, so every page hardcoded `emerald-500`/`amber-500`/`red-500`/`green-500` (with three different "success" greens). They are now wired into `@theme inline` and every page uses them. |
| **Shared primitives** | `components/primitives.tsx` now also provides `StatCard`, `Metric`, `DataTable`, `Skeleton`/`StatRowSkeleton`/`TableSkeleton`/`CardGridSkeleton`, `EmptyState`, `ErrorState` and `SectionHeading`. Per-page copies of stat cards, table shells, badged status maps and empty states were deleted. Status vocabulary lives in `lib/status.ts` (so the primitives module exports components only). |
| **States** | Every data view now has a skeleton while loading, a composed empty state, and an inline error state with retry. Previously: bare "Loading sessions…" text, silent `catch {}`, toasts only. |
| **Honest data** | Removed the fabricated worker row and the hardcoded "All workers up to date!" claim on the dashboard, the synthetic worker on workers failure, and the invented queue statistics/jobs. The queue page now states plainly that queue monitoring is not wired. |
| **Copy** | Sentence case throughout, all em-dashes removed from user-visible strings, exclamation marks dropped, placeholders made realistic, unsourced precision claims in the docs page softened. |
| **Shell** | Page titles `text-xl` → `text-xl sm:text-2xl` with topic descriptions; one scrolling content region (`h-dvh` shell, no nested `<main>`); skip-to-content link; a single theme control (the sidebar footer one; the duplicate topbar toggle is gone); sidebar labels sentence case, active-route prefix matching so `/sessions/:id/chat` keeps Sessions highlighted, and an active pill that clears contrast in both themes. |
| **A11y** | `aria-current` on the active nav item, real `<button>`s with `aria-pressed` for engine/option cards, `aria-expanded`/`role="listbox"` on the custom multi-select, meaningful alt text (including the QR code), and a `prefers-reduced-motion` guard on the login background. |
| **Auth headers** | The client used to send a hardcoded `x-api-key: waha` on every request. On a server with a real `WAHA_API_KEY` that key is rejected *before* Basic auth is consulted, so every data call failed. `getApiAuthHeaders()` in `lib/api.ts` now sends Basic dashboard credentials plus an optional real key from `localStorage["waha-api-key"]` — verified end to end against a server running with an API key set. |
| **Meta** | `index.html` gained a description, og tags, `color-scheme`, theme-color and the (previously unused) SVG favicon; the tab title follows the page. |
| **Docs** | The written `DocsPage` is now routed at `/docs`; the raw Scalar reference moved to `/docs/reference`. |
| **Dead code** | Removed unused CSS (`animate-shimmer`, `bounce-in`, `table-row-hover`, `loading-overlay`, `row-actions-btn`, duplicate `.status-dot`/`.empty-state`/`.login-container`/`.stat-card` definitions), an invalid top-level `transition-property` block, and the `!important` global input min-height that broke compact form fields. |

Verified: `tsc -b && vite build` clean, eslint problems down from 164 to 152 with **no file worse than
before**, zero console errors across all 13 routes in a real browser, no horizontal overflow, and the
dashboard loads real data in both themes.

Recent UI commits: `7c4124d` design tokens + primitives + dashboard modernisation,
`0a819e4` page transitions + login split-screen + workers badges, `fee40b5` chat bubbles.

## Auth flow

```text
LoginPage → login(user, pass)
   → base64("user:pass") → GET /api/dashboard/login  (Basic header, rate-limited 10/min)
   → stored in localStorage: waha_dashboard_auth (b64) + waha_dashboard_user
   → mount-time validation: GET /api/sessions with the stored Basic header
```

Every API call sends **Basic auth plus a hardcoded `x-api-key: waha`** (`src/lib/api.ts`). The server
accepts either credential, so this works — but the hardcoded key is confusing and should become a real
setting ([[Roadmap]], [[Security Model]]).

WebSocket auth goes in the query string (`?user=&pass=`) because browsers can't set WS headers.

## Dev vs production

| Mode | Frontend | API | Command |
|---|---|---|---|
| Dev | Vite on **:5173**, proxies `/api` → `http://localhost:3001` and `/ws` → `ws://localhost:3001` | :3001 | `bun run dev` (both) or `bun run dev:ui` |
| Production | `frontend-dist/` served by the Bun server with SPA fallback + 24 h asset caching | same origin | `bash scripts/start.sh` |

### How production static serving works now

`serveStaticFile()` in `src/main.ts` ([[Bun Runtime Adoption]]):

- **ETag + `If-None-Match` → 304**, so a reload revalidates instead of re-downloading the bundle.
- **`immutable` caching (1 year) for content-hashed assets**, 24 h for other files, `no-cache` for HTML.
- Content-Type and **Range requests** (`206` + `Content-Range`) are handled by Bun natively — the
  hand-written MIME map is gone.
- File stats are read **asynchronously**, so serving assets never blocks the event loop.
- `X-Content-Type-Options: nosniff` on every static response.

`scripts/build-frontend.sh` builds and copies `frontend/dist` → `frontend-dist/`. Note the port
discrepancy: the build script advertises `:3000` while the Vite proxy targets `:3001` — set `PORT`
explicitly to avoid confusion ([[Runbook]]).

## Related

[[REST API]] · [[WebSocket Events]] · [[API Docs]] · [[Configuration Reference]] · [[Known Gaps and Stubs]]
