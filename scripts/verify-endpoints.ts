#!/usr/bin/env bun
/**
 * Live endpoint verifier for a running BunWa server.
 *
 * Discovers every route from the server's own Hono route table (the same
 * createApiRouter() the server mounts), then calls each one and reports a
 * per-route verdict so a reader can see what is green and what needs
 * attention. The route list is never hand written, so it cannot drift from
 * the source.
 *
 * Read-only by default: only GET and HEAD routes are called, with a small set
 * of well-formed query parameters. Nothing is created, sent or deleted.
 *
 * Write pass (opt in): --include-writes --session <name> --confirm-live
 * exercises create, update, send and delete flows. It requires all three
 * flags so it can never fire messages at a real account by accident, and send
 * routes additionally need --chat-id. Write routes that need a concrete
 * resource the verifier does not own are reported, not called.
 *
 * Usage:
 *   BUNWA_URL=http://127.0.0.1:3000 BUNWA_API_KEY=... bun run scripts/verify-endpoints.ts
 *   BUNWA_URL=... BUNWA_API_KEY=... bun run scripts/verify-endpoints.ts \
 *     --include-writes --session default --confirm-live [--chat-id 111@s.whatsapp.net]
 *
 * Exit code is non-zero when any route returns 5xx, fails at the transport
 * level, or answers without the server's own explanation, so it can gate a
 * deploy. A 404 or 422 that carries a message from the server is "not
 * applicable here": the route needs a session, a specific resource, or a
 * capability the engine does not have. Auth and parameter problems are
 * reported the same way and do not fail the run.
 */
import 'reflect-metadata';

const VERDICT_ORDER = [
  'works',
  'needs a session',
  'needs a parameter',
  'auth',
  'missing',
  'not applicable',
  'error',
] as const;

type Verdict = (typeof VERDICT_ORDER)[number];

interface RouteEntry {
  method: string;
  path: string;
  requiresSession: boolean;
  /** True when the path carries a parameter other than session. */
  resourceParams: boolean;
}

interface Result {
  method: string;
  path: string;
  status: number | null;
  verdict: Verdict;
  message: string;
  /** False for routes that were reported without sending a request. */
  sent: boolean;
}

interface Options {
  baseUrl: string;
  apiKey?: string;
  includeWrites: boolean;
  session?: string;
  confirmLive: boolean;
  chatId?: string;
  timeoutMs: number;
  help: boolean;
}

// Routes that read the session from a query parameter instead of the path.
// Kept small and only used to pick the right verdict for a 400 or 404.
const SESSION_QUERY_ROUTES = new Set([
  '/api/checkNumberStatus',
  '/api/messages',
  '/api/contacts',
  '/api/contacts/all',
  '/api/contacts/check-exists',
  '/api/contacts/about',
  '/api/contacts/profile-picture',
]);

function usage(): void {
  console.log(`BunWa endpoint verifier

Reads BUNWA_URL and BUNWA_API_KEY from the environment.

Usage:
  bun run scripts/verify-endpoints.ts [options]

Options:
  --include-writes   also exercise create, update, send and delete flows
  --session <name>   session to target in the write pass (required with writes)
  --confirm-live     acknowledge that the write pass mutates data (required)
  --chat-id <id>     chat for send routes in the write pass; sends stay off without it
  --timeout <ms>     per-request timeout in milliseconds (default 15000)
  --help             print this text

Verdicts: works, needs a session, needs a parameter, auth, missing, not applicable, error.
Exit code is non-zero when any route returns 5xx, cannot be reached, or answers
without the server's own explanation.`);
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    baseUrl: (process.env.BUNWA_URL ?? '').replace(/\/+$/, ''),
    apiKey: process.env.BUNWA_API_KEY,
    includeWrites: false,
    session: undefined,
    confirmLive: false,
    chatId: undefined,
    timeoutMs: 15_000,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--include-writes':
        options.includeWrites = true;
        break;
      case '--confirm-live':
        options.confirmLive = true;
        break;
      case '--session':
        options.session = argv[++i];
        break;
      case '--chat-id':
        options.chatId = argv[++i];
        break;
      case '--timeout': {
        const parsed = Number.parseInt(argv[++i] ?? '', 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          console.error('--timeout needs a positive number of milliseconds.');
          process.exit(2);
        }
        options.timeoutMs = parsed;
        break;
      }
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        console.error(`Unknown argument '${arg}'.`);
        usage();
        process.exit(2);
    }
  }

  return options;
}

/** Reads the mounted route table from the same router factory the server uses. */
async function discoverRoutes(): Promise<RouteEntry[]> {
  const { createApiRouter } = await import('../src/api/index.ts');
  const app = createApiRouter();
  const seen = new Set<string>();
  const routes: RouteEntry[] = [];

  for (const route of app.routes as Array<{ method: string; path: string }>) {
    const method = route.method.toUpperCase();
    if (method === 'ALL') continue;
    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) continue;
    const key = `${method} ${route.path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const params = paramNames(route.path);
    routes.push({
      method,
      path: route.path,
      requiresSession: params.includes('session') || SESSION_QUERY_ROUTES.has(route.path),
      resourceParams: params.some((param) => param !== 'session'),
    });
  }
  return routes;
}

function paramNames(path: string): string[] {
  return path
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) return segment.slice(1).replace(/\{.*\}$/, '');
      const match = /^\{(.+)\}$/.exec(segment);
      return match ? match[1].replace(/^\.\.\./, '').replace(/:.*$/, '') : '';
    })
    .filter(Boolean);
}

const STATIC_PARAM_VALUES: Record<string, string> = {
  chatId: '00000000000@s.whatsapp.net',
  messageId: 'verify-endpoints-missing-message',
  batchId: 'verify-endpoints-missing-batch',
  filename: 'verify-endpoints-missing-file',
  phoneNumber: '00000000000',
  labelId: 'verify-endpoints-missing-label',
  id: 'verify-endpoints-missing-id',
};

function buildPath(path: string, options: Options, overrides: Record<string, string> = {}): string {
  return path
    .split('/')
    .map((segment) => {
      const name = segment.startsWith(':')
        ? segment.slice(1).replace(/\{.*\}$/, '')
        : /^\{(.+)\}$/.exec(segment)?.[1].replace(/^\.\.\./, '').replace(/:.*$/, '');
      if (!name) return segment;
      if (overrides[name]) return encodeURIComponent(overrides[name]);
      if (name === 'session') return encodeURIComponent(options.session ?? 'verify-endpoints-no-session');
      return encodeURIComponent(STATIC_PARAM_VALUES[name] ?? 'verify-endpoints-missing');
    })
    .join('/');
}

/** Well-formed query parameters the read pass may supply. Extra ones are ignored. */
function readQuery(options: Options): string {
  const params = new URLSearchParams();
  params.set('session', options.session ?? 'verify-endpoints-no-session');
  params.set('limit', '10');
  params.set('offset', '0');
  params.set('downloadMedia', 'false');
  params.set('phone', '00000000000');
  params.set('phoneNumber', '00000000000');
  params.set('contactId', '00000000000');
  params.set('chatId', '00000000000@s.whatsapp.net');
  params.set('severity', 'info');
  return params.toString();
}

async function send(
  options: Options,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number | null; text: string; transportError?: string }> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.apiKey) headers['x-api-key'] = options.apiKey;
  if (body !== undefined) headers['content-type'] = 'application/json';

  try {
    const response = await fetch(`${options.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    const text = await response.text();
    return { status: response.status, text };
  } catch (error) {
    return { status: null, text: '', transportError: (error as Error).message };
  }
}

function serverMessage(text: string): string {
  if (!text) return '';
  try {
    const json = JSON.parse(text);
    const candidate = json.message ?? json.error;
    if (typeof candidate === 'string' && candidate) return truncate(candidate);
    if (Array.isArray(json.errors)) {
      const first = json.errors.find((issue: any) => issue?.message);
      if (first) return truncate(String(first.message));
    }
  } catch {
    // Not JSON; fall through to the plain text path.
  }
  return truncate(text);
}

function truncate(value: string, max = 120): string {
  const oneLine = value.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 3)}...` : oneLine;
}

/**
 * A 404 or 422 only reads as "not applicable here" when the server explains
 * itself: the report shows that reason, so a client can tell a missing
 * resource or an unimplemented capability from a server fault. An empty body
 * on those statuses has no explanation to report and stays an error.
 */
function verdictFor(route: RouteEntry, status: number | null, options: Options, message: string): Verdict {
  if (status === null) return 'error';
  if (status >= 500) return 'error';
  if (status >= 200 && status < 400) return 'works';
  if (status === 401 || status === 403) return 'auth';
  const explained = message.trim().length > 0;
  if (status === 404) {
    if (!explained) return 'error';
    // A session scoped route with no other parameter needs a session (either
    // none was given, or the named one is missing or not working).
    if (route.requiresSession && (!route.resourceParams || !options.session)) return 'needs a session';
    // No session involvement: the server says the target resource is absent.
    return 'not applicable';
  }
  if (status === 405) return 'missing';
  if (status === 422) {
    // The engine does not implement the operation; the message says so.
    return explained ? 'not applicable' : 'error';
  }
  if (route.requiresSession && !options.session && status >= 400) return 'needs a session';
  // A required parameter or other client input problem; the server names it.
  if (status === 400 || status === 409 || status === 428) return 'needs a parameter';
  return 'error';
}

function makeResult(
  options: Options,
  route: RouteEntry,
  status: number | null,
  message: string,
  optionsExtra: { forcedVerdict?: Verdict; sent?: boolean } = {},
): Result {
  return {
    method: route.method,
    path: route.path,
    status,
    verdict: optionsExtra.forcedVerdict ?? verdictFor(route, status, options, message),
    message,
    sent: optionsExtra.sent ?? true,
  };
}

/** Only error responses carry a message into the report; success bodies are never printed. */
function resultMessage(status: number | null, text: string, transportError?: string): string {
  if (transportError) return transportError;
  if (status === null || status >= 400) return serverMessage(text);
  return '';
}

async function runReadPass(options: Options, routes: RouteEntry[]): Promise<Result[]> {
  const results: Result[] = [];
  for (const route of routes) {
    if (route.method !== 'GET' && route.method !== 'HEAD') continue;
    const path = buildPath(route.path, options);
    const query = route.method === 'GET' ? `?${readQuery(options)}` : '';
    const response = await send(options, route.method, `${path}${query}`);
    results.push(
      makeResult(options, route, response.status, resultMessage(response.status, response.text, response.transportError)),
    );
  }
  return results;
}

/**
 * The write pass runs a small set of explicit, reversible scenarios. It never
 * calls session start, stop, logout, force-kill or delete routes, and it never
 * calls a delete route for a resource it did not create in this run.
 */
async function runWritePass(options: Options, routes: RouteEntry[]): Promise<Result[]> {
  const results: Result[] = [];
  const byKey = new Map(routes.map((route) => [`${route.method} ${route.path}`, route]));
  const session = options.session!;
  const stamp = Date.now().toString(36);
  const exercised = new Set<string>();

  const callJson = async (
    method: string,
    path: string,
    body?: unknown,
    overrides: Record<string, string> = {},
  ): Promise<{ result: Result; json: any } | null> => {
    const route = byKey.get(`${method} ${path}`);
    if (!route) return null;
    exercised.add(`${method} ${path}`);
    const response = await send(options, method, buildPath(route.path, options, overrides), body);
    const result = makeResult(
      options,
      route,
      response.status,
      resultMessage(response.status, response.text, response.transportError),
    );
    results.push(result);
    let json: any;
    try {
      json = JSON.parse(response.text);
    } catch {
      json = undefined;
    }
    return { result, json };
  };

  const skipStep = (path: string, reason: string): void => {
    const route = byKey.get(path);
    if (!route) return;
    exercised.add(path);
    results.push(makeResult(options, route, null, reason, { forcedVerdict: 'needs a parameter', sent: false }));
  };

  // Templates: create, update, preview, delete.
  const createdTemplate = await callJson('POST', '/api/sessions/:session/templates', {
    name: `verify-${stamp}`,
    body: 'BunWa endpoint verification template',
  });
  const templateId = createdTemplate?.json?.id;
  if (templateId) {
    const withTemplate = { id: templateId };
    await callJson(
      'PUT',
      '/api/sessions/:session/templates/:id',
      { body: 'BunWa endpoint verification template, updated' },
      withTemplate,
    );
    await callJson('POST', '/api/sessions/:session/templates/:id/preview', { variables: {} }, withTemplate);
    await callJson('DELETE', '/api/sessions/:session/templates/:id', undefined, withTemplate);
  } else {
    const reason = 'template create did not return a usable id, step not sent';
    skipStep('PUT /api/sessions/:session/templates/:id', reason);
    skipStep('POST /api/sessions/:session/templates/:id/preview', reason);
    skipStep('DELETE /api/sessions/:session/templates/:id', reason);
  }

  // Webhooks: create with a discard URL, then delete what was created.
  const createdWebhook = await callJson('POST', '/api/sessions/:session/webhooks', {
    url: 'http://127.0.0.1:9/verify-endpoints',
    events: ['message'],
    enabled: false,
  });
  const webhookId = createdWebhook?.json?.id;
  if (webhookId) {
    await callJson('DELETE', '/api/sessions/:session/webhooks/:id', undefined, { id: webhookId });
  } else if (createdWebhook) {
    skipStep('DELETE /api/sessions/:session/webhooks/:id', 'webhook create did not return a usable id, step not sent');
  }

  // Sending policy: write an empty override set (changes nothing) and read it back.
  await callJson('PUT', '/api/sessions/:session/policy', {});
  await callJson('GET', '/api/sessions/:session/policy/usage');

  // Send routes only with an explicit chat id.
  if (options.chatId) {
    await callJson('POST', '/api/sendText', {
      session,
      chatId: options.chatId,
      text: `BunWa endpoint verification ${stamp}`,
    });
  } else {
    skipStep('POST /api/sendText', 'add --chat-id to exercise send routes, not sent');
  }

  // Report every other write route without calling it: these need a concrete
  // resource or body the verifier does not own.
  for (const route of routes) {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(route.method)) continue;
    const key = `${route.method} ${route.path}`;
    if (exercised.has(key)) continue;
    exercised.add(key);
    results.push(
      makeResult(
        options,
        route,
        null,
        'not exercised automatically, needs a concrete resource or body',
        { forcedVerdict: 'needs a parameter', sent: false },
      ),
    );
  }

  return results;
}

function printResults(title: string, results: Result[]): void {
  console.log(`\n${title}`);
  for (const verdict of VERDICT_ORDER) {
    const group = results.filter((result) => result.verdict === verdict);
    if (group.length === 0) continue;
    console.log(`\n  ${verdict} (${group.length})`);
    for (const result of group) {
      const status = result.status === null ? 'n/a' : String(result.status);
      const suffix = result.message ? `  ${result.message}` : '';
      console.log(`    ${result.method} ${result.path}  ${status}${suffix}`);
    }
  }
}

function printSummary(results: Result[]): void {
  const counts = new Map<Verdict, number>();
  for (const verdict of VERDICT_ORDER) counts.set(verdict, 0);
  for (const result of results) counts.set(result.verdict, (counts.get(result.verdict) ?? 0) + 1);

  const parts = VERDICT_ORDER.filter((verdict) => (counts.get(verdict) ?? 0) > 0).map(
    (verdict) => `${counts.get(verdict)} ${verdict}`,
  );
  console.log(`\nSummary: ${results.length} routes checked, ${parts.join(', ')}.`);

  const failures = results.filter((result) => result.sent && result.verdict === 'error');
  if (failures.length > 0) {
    console.log(
      `Attention: ${failures.length} route(s) returned 5xx, could not be reached, or answered without an explanation.`,
    );
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (!options.baseUrl) {
    console.error('BUNWA_URL is not set. Point it at the running server, for example http://127.0.0.1:3000.');
    process.exit(2);
  }
  if (options.includeWrites && (!options.session || !options.confirmLive)) {
    console.error(
      'Refusing to run the write pass. It creates, sends and deletes real data, so it needs ' +
        '--include-writes --session <name> --confirm-live.',
    );
    process.exit(2);
  }

  console.log(`BunWa endpoint verifier`);
  console.log(`  target: ${options.baseUrl}`);
  console.log(`  auth: ${options.apiKey ? 'BUNWA_API_KEY set' : 'BUNWA_API_KEY not set'}`);
  console.log(`  mode: ${options.includeWrites ? `read and write (session ${options.session})` : 'read only'}`);

  const routes = await discoverRoutes();
  console.log(`  discovered ${routes.length} routes from the server route table`);

  const readResults = await runReadPass(options, routes);
  printResults('Read-only pass', readResults);

  let allResults = readResults;
  if (options.includeWrites) {
    const writeResults = await runWritePass(options, routes);
    printResults('Write pass', writeResults);
    allResults = [...readResults, ...writeResults];
  }

  printSummary(allResults);

  const failed = allResults.some((result) => result.sent && result.verdict === 'error');
  process.exit(failed ? 1 : 0);
}

await main();
