# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Full Stack (Docker)
```bash
make build          # Clean, prune, and rebuild all containers (docker-compose up --build -d)
make clean          # Stop and remove containers
make test-all       # Run both backend and frontend tests
make test-frontend  # Run frontend tests with coverage
make test-backend   # Run backend tests with coverage
```

> **IMPORTANT**: The app is fully Dockerized. Always use `make` commands — never invoke `docker`, `docker-compose`, `podman`, `podman-compose`, `npm`, or `go` directly for building or testing. The Makefile handles tool detection (podman vs docker) and ensures consistent behaviour across environments.

### Backend (Go) — reference only, use `make test-backend` to run tests
```bash
cd api
go test ./internal/service/...     # (run a specific package during local dev only)
go build ./cmd/api/                # Build the binary
```

### Frontend (React) — reference only, use `make test-frontend` to run tests
```bash
cd web
npm run dev        # Start dev server (Vite, proxies /api to :8080)
npm run lint       # ESLint
npm run build      # Production build (tsc + vite)
```

### Environment
Create a `.env` file at the repo root for the quotes feature:
```
NINJAS_API_KEY=your_key_here
```

## Architecture

The app is a local-first habit tracker called **Commit**, orchestrated via Docker Compose.

```
commit_app/
├── api/                    # Go backend (chi router, port 8080)
│   ├── cmd/api/main.go     # Entry point — router setup, all HTTP handlers inline
│   └── internal/
│       ├── models/         # Shared data structs (Habit, CompletionData)
│       ├── repository/     # sqlite.go — raw SQLite queries via modernc.org/sqlite
│       └── service/        # habit_service.go — business logic (streak calc, insights)
├── web/                    # React SPA (Vite + TypeScript + Tailwind v4)
│   └── src/
│       ├── App.tsx         # Root component — all state management and API calls live here
│       ├── App.test.tsx    # Integration tests for App state management and new features
│       └── components/
│           ├── habit-grid.tsx              # SVG-based 52-week contribution grid
│           ├── habit-grid.test.tsx
│           ├── insights-panel.tsx          # Fixed-overlay "terminal" insights panel
│           ├── insights-panel.test.tsx
│           ├── quote-banner.tsx            # Daily motivational quote from API Ninjas
│           ├── quote-banner.test.tsx
│           ├── toast.tsx                   # Auto-dismissing status notification
│           ├── toast.test.tsx
│           └── background-particles.tsx
├── data/                   # SQLite DB persisted here (mounted as Docker volume)
├── docker-compose.yml
└── Makefile
```

**Data flow**: Browser → Nginx (:80) → serves React SPA + reverse-proxies `/api/*` → Go backend (:8080) → SQLite.

**Backend pattern**: All HTTP handlers are defined inline in `cmd/api/main.go`. Business logic lives in `internal/service/habit_service.go` (streak calculation, insights generation). Database access is isolated in `internal/repository/sqlite.go`. The service layer depends on the `HabitRepository` interface, enabling mock-based unit testing.

**Frontend pattern**: `App.tsx` owns all state and API calls. Components receive data via props and are stateless where possible. The `HabitGrid` renders an SVG contribution grid with dynamic color intensity based on quantitative check-in values.

**Streak logic**: `day_start_offset` (minutes) allows habits to use a custom "day boundary" — e.g., a night owl can have their day reset at 3am instead of midnight.

**Archive logic**: Habits can be soft-archived (`archived = 1` in SQLite). Archived habits are hidden from the default list and dimmed when shown. `GET /api/habits?archived=true` returns all habits including archived ones.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/habits` | List active habits. Add `?archived=true` to include archived. |
| `POST` | `/api/habits` | Create a habit `{ name, measure_unit, tags[], day_start_offset }` |
| `PUT` | `/api/habits/{id}` | Update habit name, unit, tags, or offset |
| `DELETE` | `/api/habits/{id}` | Permanently delete a habit and all its completions |
| `PATCH` | `/api/habits/{id}/archive` | Soft-archive a habit (hidden from default list) |
| `PATCH` | `/api/habits/{id}/unarchive` | Restore an archived habit |
| `POST` | `/api/check-in` | Log a value `{ habit_id, date, value }`. Value 0 is allowed. |
| `GET` | `/api/insights` | Generate per-habit activity summaries for the last 30 days |
| `GET` | `/api/quote` | Fetch a random motivational quote (rotates across 10 categories) |

## Coding Standards

- **TypeScript**: Strict mode. Use interfaces for all API response types.
- **Go**: `gofmt` formatting. Explicit error handling — no swallowed errors.
- **File naming**: kebab-case (e.g., `habit-grid.tsx`).
- **Styling**: Tailwind CSS v4 only — no third-party UI component libraries.
- **Dialogs**: Custom modal components only — `window.confirm` and `window.alert` are prohibited.
- **Font**: JetBrains Mono throughout the UI.
- **Emojis**: Prohibited in UI, logs, and documentation.

## Design System

| Token         | Value     | Usage                                    |
|---------------|-----------|------------------------------------------|
| background    | `#0B0E14` | Primary background                       |
| surface       | `#161B22` | Cards, modals                            |
| text-primary  | `#E6EDF3` | Main text                                |
| text-secondary| `#7D8590` | Metadata, timestamps                     |
| accent-1      | `#0E4429` | Low-intensity grid cell                  |
| accent-2      | `#006D32` | Mid-low intensity / 7-day streak badge   |
| accent-3      | `#26A641` | Mid-high intensity / 30-day streak badge |
| accent-4      | `#39D353` | High-intensity / CTA green / 100-day badge |

## Testing

Minimum **70% coverage** required for both frontend and backend. Every new change must include tests.

- **Backend**: standard `testing` package. Focus on `internal/service` (streak calculation, insights, archive).
- **Frontend**: Vitest + React Testing Library. Test files live next to the component they test.
  - `App.test.tsx` — form validation, check-in flow, toast, delete modal, edit habit, archive, filter counts, summary row, streak badges
  - `habit-grid.test.tsx` — coordinate/intensity logic, tooltip rendering
  - `toast.test.tsx` — visibility, aria-live, auto-dismiss timer
  - `insights-panel.test.tsx` — render, typewriter, close
  - `quote-banner.test.tsx` — fetch, truncation, loading state

## Branching

`feature/*` → `dev` → `main`. Direct pushes to `main` are prohibited.
