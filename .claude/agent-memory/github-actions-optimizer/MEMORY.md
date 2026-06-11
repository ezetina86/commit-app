# GitHub Actions Optimizer — Agent Memory

## Pinned Action SHAs (verified 2026-05-05)
See `sha-pins.md` for the full table. Key pins in use:
- `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683` — v4.2.2
- `actions/setup-go@d35c59abb061a4a6fb18e82ac0862c26744d6ab5` — v5.5.0
- `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020` — v4.4.0
- `actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02` — v4.6.2
- `docker/setup-buildx-action@8d2750c68a42422c14e847fe6c8ac0403b4cbd6f` — v3.12.0
- `docker/build-push-action@10e90e3645eae34f1e60eeb005ba3a3d33f178e8` — v6.19.2

## Project-Specific CI Rules
- NEVER call `npm`, `go`, `docker`, `docker-compose`, `podman`, `podman-compose` directly
- Use `make test-frontend`, `make test-backend`, `make test-all`, `make build`
- Frontend ESLint + type-check: `make lint-frontend` (runs `npm run lint` via Makefile)
- Node version pinned at 20 via `web/.nvmrc`
- Go version from `api/go.mod` (currently go 1.26)
- Cache key for Go: `api/go.sum`; for npm: `web/package-lock.json`

## Frontend Coverage Enforcement Pattern
Vitest with `@vitest/coverage-v8` writes `web/coverage/coverage-summary.json`.
Parse with `python3` and check `total.lines.pct >= 70`. See ci.yml for full snippet.
The raw `npm run coverage` output does NOT produce a stable machine-readable exit
code for thresholds — always parse the JSON summary file.

## Confirmed Patterns That Work
- `actions/setup-go cache: true` with `cache-dependency-path: api/go.sum` handles
  Go module caching natively — no separate `actions/cache` step needed.
- `actions/setup-node cache: npm` with `cache-dependency-path: web/package-lock.json`
  handles npm cache natively.
- Docker layer cache: `type=gha` with separate `scope=api` and `scope=web` avoids
  cache collisions between the two images.

## Audit Checklist Template
See `audit-checklist.md` for the reusable per-PR checklist.
