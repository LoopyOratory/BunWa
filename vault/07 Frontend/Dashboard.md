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
| `/logs` | Audit Logs | `GET /api/audit` with filters + CSV export (live-verified 2026-09-29: rows rendered for a full session lifecycle) |
| `/infrastructure` | Infrastructure | DB / storage / queue settings, save + restart |
| `/queue` | → `/infrastructure` | redirect — queue monitoring is not wired in this build; the sidebar no longer lists it, old bookmarks land on the queue configuration card |
| `/events` | Event monitor | live `/ws` stream (500-entry buffer), filter, search, pause, download (live-verified 2026-09-29: streamed every `session.status` transition) |
| `/docs` | Docs | iframe of `/api-docs/` |
| `*` | Not found | explicit 404 with links to Dashboard, Agent analytics and API docs |

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
| **Meta** | `index.html` gained a description, og tags, `color-scheme`, theme-color and the favicon (the PNG logo mark since the 2026-09-29 brand pass; the old SVG favicon was retired); the tab title follows the page. |
| **Docs** | The written `DocsPage` is now routed at `/docs`; the raw Scalar reference moved to `/docs/reference`. |
| **Dead code** | Removed unused CSS (`animate-shimmer`, `bounce-in`, `table-row-hover`, `loading-overlay`, `row-actions-btn`, duplicate `.status-dot`/`.empty-state`/`.login-container`/`.stat-card` definitions), an invalid top-level `transition-property` block, and the `!important` global input min-height that broke compact form fields. |

Verified: `tsc -b && vite build` clean, eslint problems down from 164 to 152 with **no file worse than
before**, zero console errors across all 13 routes in a real browser, no horizontal overflow, and the
dashboard loads real data in both themes.

Recent UI commits: `7c4124d` design tokens + primitives + dashboard modernisation,
`0a819e4` page transitions + login split-screen + workers badges, `fee40b5` chat bubbles.

### Accessibility pass (2026-11-20)

A full audit-driven pass that took the console from 8.5 to a 10-grade UI surface:

- **Primary button contrast (AA)**: `.btn-dream` now gradients between two literal greens —
  `--primary-strong` `#15803d` (white text 5.0:1) and `--primary-deep` `#166534` (7.1:1). The old
  gradient's lightest stop was 3.3:1. The travelling sheen moved from a `::after` overlay (which
  washed *over* the label) into the `background-image` stack (renders *beneath* the label). Every
  `bg-primary text-primary-foreground` surface (segmented pills, wizard step dots, engine option
  cards, tool-guide numerals, transcript bubbles) became `bg-primary-strong`.
- **Touch targets**: `@media (pointer: coarse)` gives every button a 44px minimum (buttons grow
  visually — correct for touch); switches and absolutely-positioned controls keep their size and
  gain an invisible 8px `::before` hit apron (`.touch-target` class; isolation-verified that a
  click 8px outside the visual box still lands on the control). The login password reveal grew
  24px → 32px + apron. Measured on a 390px touch viewport: zero buttons under 44px, segmented
  range pills 44px tall, no horizontal overflow on any route.
- **Skip link is the first tab stop**: moved from `PageLayout` into `DashboardLayout` so it
  precedes the sidebar in the DOM (was tab stop 19). Chat pages carry their own
  `#main-content` anchor so the link resolves everywhere.
- **Chat identity**: `/chat` and `/sessions/:id/chat` now set `document.title` ("Chat · BunWa")
  and render an sr-only `<h1>`; previously the title stayed the generic API default and the page
  had no heading.
- **Named controls**: profiles search input (`type="search"` + aria-label), message tester
  textarea, and the mobile event-monitor pause button (text is hidden below `sm:`) all carry
  accessible names.
- **Heading order**: agent-analytics chart/panel card titles are `<h2>` (was `<h3>` directly
  under the `<h1>`, skipping a level); "Health at a glance" on `/analytics` likewise. Verified
  zero heading-level skips on both analytics pages.
- **Chart text summaries**: each chart card (volume, funnel, CSAT) exposes an sr-only sentence
  describing what the chart shows, for screen readers and skimmers.
- **Deep-linkable agent dialog**: `/agents?agent=<id>&tab=<name>` opens the detail dialog on
  load; tab switches update the URL (replace); closing cleans the params. A resolved-agent ref
  guards against the one-frame race where a stale param re-opens a dialog mid-close.
- **Queue placeholder removed**: `/queue` redirects to `/infrastructure` (which owns the queue
  config card) and the sidebar no longer lists it. `queue-page.tsx` deleted.
- **Explicit 404**: unknown routes render a "Page not found" page with links to Dashboard, Agent
  analytics and API docs instead of a silent redirect to the dashboard.
- **Live push, not just polling**: the chat-history table opens the existing `/ws` channel
  (`events=message,message.any`) and refreshes on arrival (1s debounce), keeping the 5s/4s polls
  as fallback; the Live pill tooltip says so.
- **Shared StatCard**: `agents-page.tsx` and `profiles-page.tsx` dropped their local copies for
  the `primitives.tsx` one.
- **Title case**: "Event Monitor" → "Event monitor", matching the sidebar and other titles.

Verified end to end: 17-route browser crawl with zero console/page/API errors; skip link first
Tab press; dialog deep-link reload + clean Escape close; both mobile viewports overflow-free;
lint delta zero (156 pre-existing problems, unchanged); backend suite 752 pass / 0 fail;
frontend 19 pass; `tsc -b && vite build` clean.

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
