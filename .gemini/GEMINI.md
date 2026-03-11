# GEMINI.md - Project Specification

## System Architecture
The application is orchestrated via Docker Compose, separating concerns into three primary layers:
1.  **Proxy/Ingress**: Nginx (optional) or direct port mapping to the frontend.
2.  **Frontend (Client)**: A React SPA served via Nginx in production mode.
3.  **API (Service)**: A stateless Go binary interacting with a persistent SQLite volume.

## Color Palette
A high-contrast, professional palette optimized for clarity and focus.

| Element            | Hex Code | Purpose                          |
|--------------------|----------|----------------------------------|
| Background (Dark)  | #0B0E14  | Primary UI background            |
| Surface            | #161B22  | Habit cards and modal surfaces   |
| Text (Primary)     | #E6EDF3  | High readability headers         |
| Text (Secondary)   | #7D8590  | Metadata and timestamps          |
| Accent (Level 0)   | #161B22  | Empty contribution square        |
| Accent (Level 1)   | #0E4429  | Low intensity completion         |
| Accent (Level 4)   | #39D353  | High intensity completion        |

## Coding Standards
* **TypeScript**: Mandatory strict mode. Interfaces must be used for all API responses.
* **Go**: Standard `gofmt` rules. Errors must be handled explicitly; no swallowing of exceptions.
* **Modularity**: 
    * Frontend: Components must be functional and stateless where possible.
    * Backend: Logic must be separated into `/internal/repository` and `/internal/service`.
* **Naming**: 
    * Variables: camelCase (TS), camelCase/PascalCase (Go).
    * Files: kebab-case (e.g., `habit-grid.tsx`).

## Testing Strategy
1.  **Coverage Requirement**: Both the Go backend and the React frontend must maintain a minimum of **70% test coverage**.
2.  **Continuous Verification**: Every new change introduced MUST be verified with corresponding test cases following the established strategy. Coverage must not drop below the 70% threshold.
3.  **Backend (Go)**:
    *   Use standard `testing` package.
    *   Focus on `internal/service` logic (streak calculation, quantitative tracking, JSON tag parsing).
    *   Test command: `go test -cover ./...`
4.  **Frontend (React/TS)**:
    *   Use **Vitest** + **React Testing Library**.
    *   Focus on `habit-grid.tsx` coordinate/intensity calculations and `App.tsx` state management.
    *   Test command: `npm run coverage`
5.  **Integration Tests**: Validating the CRUD lifecycle of a habit from API endpoint to SQLite persistence.

## Constraint Checklist
* **Typography**: The primary application font is 'JetBrains Mono'. Avoid generic system fonts to maintain a clinical, data-driven aesthetic.
* **Emoji Usage**: Strictly prohibited. No emojis in UI, console logs, or documentation.
* **Performance**: Initial page load must be under 500ms on local environments.
* **Dependency Management**: Avoid third-party UI libraries (e.g., Material UI). Use Tailwind for custom, lightweight styling.
* **Dialogs/Notifications**: Use custom, in-app modal components or notifications for user confirmation and alerts. Browser standard dialogs (e.g., `window.confirm`, `window.alert`) are strictly prohibited to maintain a cohesive UI.
