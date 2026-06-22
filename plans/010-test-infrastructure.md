# Plan 10: Test Infrastructure

**Finding**: Zero test files exist — no automated verification for any path
**Impact**: HIGH — no regression safety net for any change
**Effort**: L (multi-day)
**Risk**: LOW — adding tests cannot break existing behavior
**Depends on**: Plans 01-09 (tests should verify fixed behavior)

## Problem

No `*.test.ts` or `*.spec.ts` files exist. `bun test` finds nothing. The `tsconfig.json` excludes test files but no tests exist to exclude. Critical paths (auth, sessions, webhooks, chatting) are entirely untested.

## Scope

- **In scope**: Test infrastructure, characterization tests for critical paths
- **Out of scope**: Full coverage (that's a separate project)

## Steps

### Step 1: Create test helpers

Create `src/__tests__/helpers.ts`:

```typescript
import { Hono } from 'hono';
import { createApiRouter } from '../api';

export function createTestApp(): Hono {
  const app = new Hono();
  app.route('/', createApiRouter());
  return app;
}

export function mockSession(overrides = {}) {
  return {
    name: 'test-session',
    status: 'WORKING',
    me: { id: '123@c.us', pushName: 'Test' },
    config: {},
    ...overrides,
  };
}
```

### Step 2: Add auth middleware tests

Create `src/middleware/api-key-auth.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { createTestApp } from '../__tests__/helpers';

describe('API Key Auth', () => {
  it('rejects requests without API key', async () => {
    const app = createTestApp();
    const res = await app.request('/api/sessions');
    expect(res.status).toBe(401);
  });

  it('accepts requests with valid API key header', async () => {
    const app = createTestApp();
    const res = await app.request('/api/sessions', {
      headers: { 'x-api-key': 'waha' },
    });
    expect(res.status).toBe(200);
  });

  it('rejects requests with invalid API key', async () => {
    const app = createTestApp();
    const res = await app.request('/api/sessions', {
      headers: { 'x-api-key': 'wrong' },
    });
    expect(res.status).toBe(401);
  });
});
```

### Step 3: Add session CRUD tests

Create `src/api/sessions.routes.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';

describe('Sessions API', () => {
  it('creates a new session', async () => {
    const res = await app.request('/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'waha',
      },
      body: JSON.stringify({ name: 'test-session' }),
    });
    expect(res.status).toBe(201);
  });

  it('lists sessions', async () => {
    const res = await app.request('/api/sessions', {
      headers: { 'x-api-key': 'waha' },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('deletes a session', async () => {
    const res = await app.request('/api/sessions/test-session', {
      method: 'DELETE',
      headers: { 'x-api-key': 'waha' },
    });
    expect(res.status).toBe(200);
  });
});
```

### Step 4: Add path traversal regression test

Create `src/main.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';

describe('Static file serving', () => {
  it('rejects path traversal attempts', async () => {
    const res = await app.request('/ui/../../etc/passwd');
    // Should not return file contents
    const text = await res.text();
    expect(text).not.toContain('root:');
  });

  it('serves normal /ui/ routes', async () => {
    const res = await app.request('/ui/');
    expect(res.status).toBe(200);
  });
});
```

### Step 5: Verify

```bash
bun test
# Expected: All tests pass

bun test --coverage
# Expected: Coverage report shows auth, sessions, static files
```

## Done Criteria

- [ ] `bun test` runs and finds test files
- [ ] Auth middleware tests pass (reject no key, accept valid key, reject invalid key)
- [ ] Session CRUD tests pass (create, list, delete)
- [ ] Path traversal regression test passes
- [ ] Test helpers are reusable for future tests

## Maintenance Note

Tests should be run in CI before merging any PR. Add `bun test` to the CI pipeline once it exists (see Plan 04 in DX findings for CI setup).
