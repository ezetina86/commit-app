# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Full Stack (Docker)
```bash
make build          # Clean, prune, and rebuild all containers (docker-compose up --build -d)
make clean          # Stop and remove containers
make test-all       # Run both backend and frontend tests
```

### Backend (Go)
```bash
cd api
go test -cover ./...               # Run all tests with coverage
go test ./internal/service/...     # Run a specific package's tests
go build ./cmd/api/                # Build the binary
```

### Frontend (React)
```bash
cd web
npm run dev        # Start dev server (Vite, proxies /api to :8080)
npm run test       # Run tests once
npm run coverage   # Run tests with coverage report
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
│       └── components/
│           ├── habit-grid.tsx          # SVG-based 52-week contribution grid
│           ├── insights-panel.tsx      # "Terminal" insights overlay
│           ├── quote-banner.tsx        # Daily motivational quote from API Ninjas
│           └── background-particles.tsx
├── data/                   # SQLite DB persisted here (mounted as Docker volume)
├── docker-compose.yml
└── Makefile
```

**Data flow**: Browser → Nginx (:80) → serves React SPA + reverse-proxies `/api/*` → Go backend (:8080) → SQLite.

**Backend pattern**: All HTTP handlers are defined inline in `cmd/api/main.go`. Business logic lives in `internal/service/habit_service.go` (streak calculation, insights generation). Database access is isolated in `internal/repository/sqlite.go`. The service layer depends on the `HabitRepository` interface, enabling mock-based unit testing.

**Frontend pattern**: `App.tsx` owns all state and API calls. Components receive data via props and are stateless where possible. The `HabitGrid` renders an SVG contribution grid with dynamic color intensity based on quantitative check-in values.

**Streak logic**: `day_start_offset` (minutes) allows habits to use a custom "day boundary" — e.g., a night owl can have their day reset at 3am instead of midnight.

## Coding Standards

- **TypeScript**: Strict mode. Use interfaces for all API response types.
- **Go**: `gofmt` formatting. Explicit error handling — no swallowed errors.
- **File naming**: kebab-case (e.g., `habit-grid.tsx`).
- **Styling**: Tailwind CSS v4 only — no third-party UI component libraries.
- **Dialogs**: Custom modal components only — `window.confirm` and `window.alert` are prohibited.
- **Font**: JetBrains Mono throughout the UI.
- **Emojis**: Prohibited in UI, logs, and documentation.

## Design System

| Token         | Value     | Usage                        |
|---------------|-----------|------------------------------|
| background    | `#0B0E14` | Primary background           |
| surface       | `#161B22` | Cards, modals                |
| text-primary  | `#E6EDF3` | Main text                    |
| text-secondary| `#7D8590` | Metadata, timestamps         |
| accent-1      | `#0E4429` | Low-intensity grid cell      |
| accent-4      | `#39D353` | High-intensity / CTA green   |

## Testing

Minimum **70% coverage** required for both frontend and backend. Every new change must include tests.

- **Backend**: standard `testing` package. Focus on `internal/service` (streak calculation, insights).
- **Frontend**: Vitest + React Testing Library. Focus on `habit-grid.tsx` coordinate/intensity logic and `App.tsx` state management.

## Branching

`feature/*` → `dev` → `main`. Direct pushes to `main` are prohibited.
