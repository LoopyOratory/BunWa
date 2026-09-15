---
type: feature
status: partial
engine: [noweb]
tier: plus
endpoints: 3
tags: [feature, engine, ops]
updated: 2026-09-14
source: src/plus/, src/version.ts, src/core/exceptions.ts
---

# 💎 Plus Tier

BunWa keeps WAHA's CORE/PLUS split. In this fork the tier is **detected, not licensed** — and in
practice it is always PLUS.

## How the tier is resolved

`getWAHAVersion()` in `src/version.ts`:

```text
WAHA_VERSION=CORE   → CORE      (explicit override)
src/plus/ exists    → PLUS      (this repo has it)
otherwise           → PLUS      (the fallback is Plus too)
```

So `VERSION.tier` is `PLUS` unless you deliberately strip `src/plus/` and set `WAHA_VERSION=CORE`.
The tier is used in exactly two places: `manager.core.ts` (engine selection) and an info log /
`/api/workers`.

## What is actually gated

| Feature | Detail |
|---|---|
| **Profile picture write** | `PUT /api/:session/profile/picture`, `DELETE /api/:session/profile/picture` — Core throws `AvailableInPlusVersion`; Plus overrides them in `src/plus/session.noweb.plus.ts` with Baileys' `updateProfilePicture` / `removeProfilePicture` |
| **Button header media** | `uploadMedia()` — Plus uses `prepareWAMessageMedia` + `sock.waUploadToServer` so `sendButtons` can carry a header image. Without it, `sendButtons` header images fail |
| **Channel message preview** | throws `AvailableInPlusVersion` because the Argo decoder is missing — see [[Channels and Labels]] |
| **S3 media storage** | `src/plus/storage/s3/S3MediaStorage.ts` — **Bun's built-in S3 client** (no AWS SDK dependency): Put/Get/Delete + **presigned GET URLs** (1 h), key `{session}/{messageId}.{ext}`, `exists()` via HEAD. Selected by `WAHA_STORAGE_TYPE=s3`; path-style addressing for custom endpoints (MinIO), virtual-hosted for AWS. Note: the factory imports it dynamically **regardless of tier**, so it works in a Core build if the folder is present |

The gating mechanism is a pair of exception classes (`AvailableInPlusVersion`,
`AvailableInPlusVersionAll`) in `src/core/exceptions.ts`, mapped to 4xx by the error handler.

## Implemented but NOT wired

These exist in `src/plus/` and have **no call sites** ([[Known Gaps and Stubs]]):

| File | Status |
|---|---|
| `storage/postgres/PostgresMediaStorage.ts` | BYTEA `media` table; the media-storage factory explicitly notes there is no dashboard option for it |
| `storage/postgres/PostgresSessionAuthRepository.ts` | `session_auth` JSONB repo — never imported |
| `storage/mongo/MongoSessionAuthRepository.ts` | Mongo `session_auth` collection — never imported |

They can't be reached anyway: `NowebAuthFactoryCore` only supports `LocalStore` and throws for
anything else, so session auth state always lands on disk (or in the local store dir).

## Practical upshot

For a self-hoster, "Plus" here means: profile-picture writes work, button headers work, and S3 is
available. There is no licence check, no telemetry, and no separate build. The real licensing
constraint is the **BCL** ([BunWa#License](BunWa.md#license--bcl-v10)), not the tier flag.

## Related

[[Engines Overview]] · [[Data and Storage]] · [[Known Gaps and Stubs]] · [[Configuration Reference]]
