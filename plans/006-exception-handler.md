# Plan 06: Exception Handler Completeness

**Finding**: `AvailableInPlusVersionAll` not handled in global error handler — falls through to 500
**Impact**: MED — users get generic 500 instead of informative 422
**Effort**: S (hours)
**Risk**: LOW
**Depends on**: None

## Problem

`src/middleware/error-handler.ts:12-36` handles specific exception types but misses `AvailableInPlusVersionAll`. When code throws this exception, the user gets a generic "Internal server error" (500) instead of the informative 422 with a link to docs.

```typescript
// src/middleware/error-handler.ts — missing handler
if (err instanceof AvailableInPlusVersion) {
  return c.json({ ... }, 422);
}
// AvailableInPlusVersionAll falls through to default 500
```

## Scope

- **In scope**: `src/middleware/error-handler.ts`
- **Out of scope**: Exception classes themselves

## Steps

### Step 1: Import `AvailableInPlusVersionAll`

Add to the imports at the top of `src/middleware/error-handler.ts`:

```typescript
import { AvailableInPlusVersionAll } from '../core/exceptions';
```

### Step 2: Add handler case

After the `AvailableInPlusVersion` handler:

```typescript
if (err instanceof AvailableInPlusVersionAll) {
  return c.json({
    statusCode: 422,
    message: err.message || 'This feature is available in WAHA Plus version',
    link: 'https://waha.devlike.pro/docs/how-to/plus/',
  }, 422);
}
```

### Step 3: Verify

```bash
bun run dev &

# Test a Plus-only feature endpoint (if available)
# Or create a test that throws AvailableInPlusVersionAll
curl -s http://localhost:3000/api/sessions/ \
  -H "x-api-key: waha" | head -20

# Check server logs for proper error handling
```

## Done Criteria

- [ ] `AvailableInPlusVersionAll` returns 422 with doc link
- [ ] Other exception types still work as before
- [ ] No new type errors
