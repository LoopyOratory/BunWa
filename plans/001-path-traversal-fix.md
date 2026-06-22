# Plan 01: Path Traversal Fix

**Finding**: Path traversal in `/ui/` static file serving allows reading files outside document root
**Impact**: CRITICAL — arbitrary file read including `.env`, session credentials, source code
**Effort**: S (hours)
**Risk**: LOW
**Depends on**: None

## Problem

`src/main.ts:101` and `src/main.ts:162` construct file paths by joining the document root with user-supplied path segments. The `join()` function normalizes `..` segments, allowing paths like `/ui/../../etc/passwd` to escape the intended directory.

```typescript
// src/main.ts:101 — BROKEN
let filePath = join(customDashboardPath, path.replace('/ui', ''))

// src/main.ts:162 — BROKEN
let filePath = join(dashboardPath, path.replace(dashboardConfig.dashboardUri, ''))
```

`join('/app/frontend-dist', '/../../etc/passwd')` → `/etc/passwd`

## Scope

- **In scope**: `src/main.ts` lines 95-130 (custom dashboard) and lines 155-195 (default dashboard)
- **Out of scope**: All other files

## Steps

### Step 1: Add path validation helper

Add a helper function at the top of `src/main.ts` (after imports):

```typescript
function isPathSafe(resolvedPath: string, rootDir: string): boolean {
  const resolved = resolve(resolvedPath);
  const root = resolve(rootDir);
  return resolved.startsWith(root + '/') || resolved === root;
}
```

Note: `resolve` is already imported from `node:path`.

### Step 2: Validate custom dashboard path

At `src/main.ts:101`, after `let filePath = join(customDashboardPath, path.replace('/ui', ''))`, add:

```typescript
if (!isPathSafe(filePath, customDashboardPath)) {
  return next();
}
```

### Step 3: Validate default dashboard path

At `src/main.ts:162`, after `let filePath = join(dashboardPath, path.replace(dashboardConfig.dashboardUri, ''))`, add:

```typescript
if (!isPathSafe(filePath, dashboardPath)) {
  return next();
}
```

### Step 4: Verify

```bash
# Start the server
bun run dev &

# Test path traversal attempts (should return 404 or serve index.html)
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/ui/../../etc/passwd"
# Expected: 404 or 200 (serves index.html)

curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/ui/%2e%2e/%2e%2e/etc/passwd"
# Expected: 404 or 200

# Verify normal access still works
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/ui/"
# Expected: 200

curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/ui/assets/index.js"
# Expected: 200
```

## Done Criteria

- [ ] Path traversal attempts return 404 or serve fallback (not file contents)
- [ ] Normal `/ui/` access works unchanged
- [ ] No type errors introduced

## Maintenance Note

If static file serving is ever moved to a CDN or reverse proxy, re-verify that the proxy doesn't reintroduce path traversal via URL decoding differences.
