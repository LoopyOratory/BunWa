# Releasing

How a BunWa release is cut, and what a version number means here.

## Version scheme

BunWa uses calendar versioning, `YYYY.MINOR.PATCH`, matching the scheme the live
deployments already run:

- **minor** rises with each feature round (`2026.5.1` to `2026.10.0`)
- **patch** rises with fixes inside a round (`2026.10.0` to `2026.10.1`)
- the year is the release year, not the commit year

The version lives in `package.json` and is echoed by `GET /api/version`, the
startup banner and the console footer, so a running instance can always say what
it is.

The n8n package is versioned separately (`integrations/n8n-nodes-bunwa`), because
it is published to npm on its own cadence. Its tags are prefixed
`n8n-nodes-bunwa-v`, and its workflow checks that the tag matches its
`package.json`.

## Cutting a release

1. **Update the changelog.** Move everything under `## [Unreleased]` into a new
   version section with today's date, leaving an empty Unreleased above it.
2. **Bump the version.** `npm version 2026.11.0 --no-git-tag-version` in the repo
   root, so `package.json` and `bun.lock` stay in step.
3. **Run the gates.** `bun run typecheck`, `bun run test`, `bun run lint`, and
   `cd frontend && bun run build`.
4. **Commit** with `chore(release): 2026.11.0` and push to `main`.
5. **Tag and push the tag:**

   ```bash
   git tag -a v2026.11.0 -m "BunWa 2026.11.0"
   git push origin v2026.11.0
   ```

6. **CI publishes the image.** `.github/workflows/docker.yml` builds for
   `linux/amd64` and `linux/arm64` and pushes `2026.11.0`, `2026.11`, and
   `sha-<short>` to `loopyoratory/bunwa`. A tag is also when the release notes on
   GitHub should be filled in from the changelog.
7. **Publish the n8n package separately** when it changed, with a
   `n8n-nodes-bunwa-v<version>` tag and the `NPM_TOKEN` secret in place.

## Tag naming

- image and server releases: `v<version>`, for example `v2026.10.0`
- n8n community node: `n8n-nodes-bunwa-v<version>`

CI only produces version tags from `v*` tags. Pushes to `main` produce the
moving `latest` and `main` tags plus a commit tag, which is why the deployment
files pin a commit tag in production and treat `latest` as a development
convenience.

## What a release must never do

- Ship with `bun run test` failing. The suite is the release gate; a red suite
  means no tag.
- Ship a changelog entry that describes an intention rather than a change. If it
  is not verified, it belongs in the roadmap, not in the release notes.
- Publish a version tag that disagrees with `package.json`. The workflows check
  this and will refuse.

## Rollback

Images are immutable per commit tag, so a rollback is a version change, not a
rebuild: point `BUNWA_TAG` at the previous commit or version tag and recreate the
container. Database schema changes so far are additive, so an older image runs
against a newer schema. Check the changelog for anything marked as breaking
before rolling back across it.
