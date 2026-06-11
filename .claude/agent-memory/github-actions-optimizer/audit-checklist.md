# CI Audit Checklist

Use this checklist when reviewing or creating any workflow for commit_app.

## Security
- [ ] All third-party actions pinned to full commit SHAs (not mutable tags)
- [ ] Workflow-level `permissions: contents: read` block present
- [ ] Per-job `permissions` blocks present and use least privilege
- [ ] No secrets echoed or logged in run steps
- [ ] No hardcoded credentials
- [ ] `pull_request_target` is NOT used (or if used, untrusted code is never checked out)
- [ ] `${{ github.event.* }}` values are not interpolated directly into `run` scripts

## Efficiency and Caching
- [ ] Go modules cached via `actions/setup-go cache: true` + `cache-dependency-path: api/go.sum`
- [ ] npm cached via `actions/setup-node cache: npm` + `cache-dependency-path: web/package-lock.json`
- [ ] Docker layers cached with `type=gha` and separate `scope=api` / `scope=web`
- [ ] Backend and frontend jobs run in parallel (no unnecessary `needs:` dependency between them)
- [ ] Build artifacts uploaded and reused where applicable

## Reliability
- [ ] Every job has `timeout-minutes`
- [ ] `defaults.run.shell: bash` set at workflow level
- [ ] Multi-line scripts start with `set -euo pipefail`
- [ ] Runner pinned to `ubuntu-24.04` (not `ubuntu-latest`)
- [ ] `concurrency` group configured to cancel stale runs

## Structure
- [ ] `workflow_dispatch` trigger present for manual runs
- [ ] All jobs and steps have descriptive `name` fields
- [ ] Shared env vars defined at workflow level (not duplicated per job)
- [ ] Branch filters on `push` are explicit and complete

## Coverage
- [ ] Backend enforces 70% threshold via `go tool cover` + awk
- [ ] Frontend enforces 70% threshold via `coverage-summary.json` parsing
- [ ] Coverage reports uploaded as artifacts with `if: always()`

## Make Commands (project rule — never bypass)
- [ ] Tests via `make test-frontend` / `make test-backend` / `make test-all`
- [ ] Lint via `make lint-frontend` / `make lint-backend` / `make lint`
- [ ] Build via `make build`
- [ ] No direct `npm`, `go`, `docker`, `docker-compose`, `podman`, `podman-compose` calls
  - Exception: `npm ci` for dependency installation in frontend job is acceptable
    because the Makefile does not expose an install target
  - Exception: `npx tsc` for type-checking is acceptable for the same reason
  - Exception: `go vet`, `gofmt`, `go tool cover` in backend job are acceptable
    because the Makefile does not wrap these individually
  - Exception: `docker run` in smoke test is acceptable because the Makefile
    `make build` rebuilds the full stack (not suitable for CI smoke testing)
