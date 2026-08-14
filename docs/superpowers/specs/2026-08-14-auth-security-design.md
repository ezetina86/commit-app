# Auth & Security Design

**Date:** 2026-08-14  
**Status:** Approved  
**Scope:** Single-user login wall for commit.ezetina.com

## Problem

The app is publicly accessible at https://commit.ezetina.com/ with no authentication. All API endpoints — including sensitive health data (blood pressure, weight, body fat, circumferences, habits) — are readable and writable by anyone on the internet.

## Approach

Session-based authentication with a bcrypt-verified password, HTTP-only cookie, and an in-memory session store. No user table — credentials live in `.env`. No new frontend routing library.

## Credentials

Two new env vars added to `.env` and `.env.example`:

```
APP_USERNAME=<your-username>
APP_PASSWORD_HASH=<bcrypt-hash>
```

The hash is generated once with:
```
htpasswd -bnBC 12 "" yourpassword | tr -d ':\n'
```

Cost factor 12 is the industry minimum for 2024+.

## Backend

### New dependency

`golang.org/x/crypto/bcrypt` — the only Go option for bcrypt. Added via `go get`.

### Session store

```go
var sessions sync.Map  // key: token string → value: time.Time (expiry)
```

A background goroutine started in `main()` sweeps expired entries every hour.

### New routes

All three routes registered before the auth middleware is applied to the main `/api` group.

| Method | Path | Auth required | Description |
|--------|------|---------------|-------------|
| `POST` | `/api/auth/login` | No | Verify credentials, set session cookie |
| `POST` | `/api/auth/logout` | Yes | Delete session, clear cookie |
| `GET` | `/api/auth/me` | Yes | Returns 200 if authenticated (used by AuthGate) |

### Auth middleware

Registered with `r.Use()` on the `/api` subrouter, after the three auth routes are carved out into a public group.

Logic:
1. Read `session` cookie from request
2. Look up token in `sessions` map
3. If missing or expired: delete from map, return `401 Unauthorized`
4. If valid: call `next.ServeHTTP`

### Login handler

1. Decode `{ username, password }` from JSON body
2. `subtle.ConstantTimeCompare` on username (prevents timing attacks)
3. `bcrypt.CompareHashAndPassword` on password
4. On success: generate `uuid.New().String()` token, store in `sessions` with `time.Now().Add(7 * 24 * time.Hour)`, set cookie
5. On failure: `401` with no detail (no enumeration)

### Cookie spec

```
Name:     session
Value:    <uuid-v4>
HttpOnly: true
Secure:   true
SameSite: http.SameSiteStrictMode
Path:     /
MaxAge:   604800   (7 days)
```

### Logout handler

Delete token from `sessions` map. Set same cookie with `MaxAge: -1` to clear it in browser. Return `204`.

## Frontend

### `web/src/main.tsx` — AuthGate

Replaces the direct `<App />` render with an `<AuthGate>` component.

State: `'loading' | 'authed' | 'unauthed'`

On mount: `GET /api/auth/me`
- 200 → `'authed'` → render `<App />`
- 401 → `'unauthed'` → render `<LoginPage onLogin={() => setState('authed')} />`
- Loading → blank screen (or minimal spinner)

### `web/src/components/login-page.tsx` — new file

A centered card. Controlled form with `username` and `password` fields.

On submit: `POST /api/auth/login` with `{ username, password }`.
- 200 → call `onLogin()` prop
- 4xx → show inline error message ("Invalid credentials")

Design tokens used:
- Background: `#0B0E14`
- Card: `#161B22`
- Input border/focus: `#39D353`
- Submit button: `#39D353` text on dark bg
- Error text: red (`#f87171` — Tailwind `red-400`)
- Font: JetBrains Mono (already global)

No emojis. No third-party UI components.

### `web/src/App.tsx` — logout button

One addition: a logout button in the top-right of the page header.

On click: `POST /api/auth/logout` → `window.location.reload()`.

No other changes to `App.tsx`.

### 401 handling

Existing API calls in `App.tsx` do not need a global interceptor. If a session expires mid-use, the next user action will get a 401, which will surface as a failed fetch. On `window.location.reload()` the `AuthGate` will catch it and show the login page. This is acceptable for a single-user personal app.

## Testing

### Backend
- `TestLogin_ValidCredentials` — correct user/pass → 200, cookie set
- `TestLogin_InvalidPassword` — wrong pass → 401
- `TestLogin_InvalidUsername` — wrong user → 401
- `TestAuthMiddleware_NoCookie` — missing cookie → 401
- `TestAuthMiddleware_ExpiredToken` — expired token → 401
- `TestLogout` — valid session → 204, session removed

### Frontend
- `LoginPage` renders username/password fields and submit button
- Submit with correct credentials → `onLogin` called
- Submit with bad credentials → error message shown
- `AuthGate` renders `LoginPage` when `/api/auth/me` returns 401
- `AuthGate` renders `App` when `/api/auth/me` returns 200

Minimum coverage requirement: 70% (per project standard).

## Security notes

- Bcrypt cost 12 makes brute-force impractical even if the hash leaks
- `subtle.ConstantTimeCompare` on username prevents timing-based enumeration
- HTTP-only cookie prevents XSS-based session theft
- SameSite=Strict prevents CSRF
- Secure flag enforces HTTPS-only cookie transmission (already TLS at commit.ezetina.com)
- No detail in 401 responses (no "wrong password" vs "wrong username" distinction)
- Session expiry: 7 days. Re-login required after Docker restart (in-memory store).

## Out of scope

- Rate limiting on `/api/auth/login` (single known user, not a public login form; add if needed)
- Persistent sessions across restarts (in-memory is sufficient)
- Multi-user / registration flow (YAGNI)
- Password change UI (rotate via `.env` + restart)
