# Auth & Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-user login wall (bcrypt + HTTP-only session cookie) to protect all health/PII data currently exposed to the public internet.

**Architecture:** A Go auth middleware wraps all `/api` routes except `POST /api/auth/login`; sessions are stored in a package-level `sync.Map`; the React SPA gains an `AuthGate` component that checks `/api/auth/me` on load and renders a login page or the main app accordingly.

**Tech Stack:** Go `golang.org/x/crypto/bcrypt`, `sync.Map`, chi middleware groups; React + TypeScript, Vitest + React Testing Library.

## Global Constraints

- ALWAYS use `make test-frontend` / `make test-backend` / `make build` — never run `npm`, `go build`, `docker`, `podman` directly for building or testing.
- `go get` (dependency management only) is the one exception — run it inside `api/` directory on the host.
- Tailwind v4, no third-party UI component libraries, no `window.confirm`/`window.alert`.
- Font: JetBrains Mono throughout.
- No emojis in UI, logs, or docs.
- Minimum 70% test coverage required (frontend and backend).
- Design tokens: background `#0B0E14`, surface `#161B22`, text-primary `#E6EDF3`, text-secondary `#7D8590`, accent-4 `#39D353` (CTA green), error `#f87171`.
- Cookie must be `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, `MaxAge=604800`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `api/go.mod` | Add `golang.org/x/crypto` |
| Modify | `api/cmd/api/main.go` | Extract `newRouter`, add session store, sweep goroutine, auth middleware, 3 auth routes, wrap existing routes in protected group |
| Create | `api/cmd/api/auth_test.go` | Backend auth tests (login, middleware, logout) |
| Create | `web/src/components/login-page.tsx` | Login form component |
| Create | `web/src/components/login-page.test.tsx` | Login page tests |
| Create | `web/src/components/auth-gate.tsx` | Auth check on load, renders App or LoginPage |
| Create | `web/src/components/auth-gate.test.tsx` | AuthGate tests |
| Modify | `web/src/App.tsx` | Accept `onLogout?: () => void` prop, add logout button in header |
| Modify | `web/src/App.test.tsx` | Add logout button test |
| Modify | `web/src/main.tsx` | Render `<AuthGate />` instead of `<App />` |
| Modify | `.env.example` | Document `APP_USERNAME` and `APP_PASSWORD_HASH` |

---

## Task 1: Add crypto dependency + extract `newRouter`

**Files:**
- Modify: `api/go.mod`, `api/go.sum`
- Modify: `api/cmd/api/main.go`

**Interfaces:**
- Produces: `func newRouter(svc *service.HabitService) http.Handler` — used by Task 2 tests and by `main()`.

- [ ] **Step 1: Add golang.org/x/crypto**

```bash
cd api && go get golang.org/x/crypto@latest
```

Expected: `go.mod` and `go.sum` updated, no errors.

- [ ] **Step 2: Extract `newRouter` from `main()`**

In `api/cmd/api/main.go`, wrap all route registration in a new function. The `main()` function becomes minimal. Rename the local `habitService` variable to `svc` inside `newRouter`.

The function signature and `main()` after refactor:

```go
func newRouter(svc *service.HabitService) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})

	r.Route("/api", func(r chi.Router) {
		// Task 2 will restructure this block.
		// For now, move ALL existing r.Get/r.Post/etc. calls here,
		// replacing references to `habitService` with `svc`.
	})

	return r
}

func main() {
	dbPath := os.Getenv("DATABASE_PATH")
	if dbPath == "" {
		dbPath = "./data/habit.db"
	}

	repo, err := repository.NewSQLiteRepository(dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer repo.Close()

	svc := service.NewHabitService(repo)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	if err := http.ListenAndServe(":"+port, newRouter(svc)); err != nil {
		log.Fatal(err)
	}
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd api && go build ./cmd/api/
```

Expected: exits with code 0, binary produced. (Delete the binary after.)

- [ ] **Step 4: Commit**

```bash
git add api/go.mod api/go.sum api/cmd/api/main.go
git commit -m "refactor(api): extract newRouter for testability, add golang.org/x/crypto"
```

---

## Task 2: Session store + auth middleware + auth routes (TDD)

**Files:**
- Modify: `api/cmd/api/main.go`
- Create: `api/cmd/api/auth_test.go`

**Interfaces:**
- Consumes: `func newRouter(svc *service.HabitService) http.Handler` from Task 1.
- Produces:
  - `POST /api/auth/login` — public
  - `POST /api/auth/logout` — protected, returns 204
  - `GET /api/auth/me` — protected, returns 200
  - All existing `/api/*` routes are now protected by auth middleware.

- [ ] **Step 1: Write failing tests**

Create `api/cmd/api/auth_test.go`:

```go
package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/ezetina/commit/api/internal/repository"
	"github.com/ezetina/commit/api/internal/service"
	"golang.org/x/crypto/bcrypt"
)

func setupTestRouter(t *testing.T) http.Handler {
	t.Helper()
	repo, err := repository.NewSQLiteRepository(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { repo.Close() })
	return newRouter(service.NewHabitService(repo))
}

func clearSessions() {
	sessions.Range(func(k, v interface{}) bool {
		sessions.Delete(k)
		return true
	})
}

func TestLogin_ValidCredentials(t *testing.T) {
	clearSessions()
	hash, _ := bcrypt.GenerateFromPassword([]byte("testpass"), 4) // cost 4 in tests for speed
	os.Setenv("APP_USERNAME", "testuser")
	os.Setenv("APP_PASSWORD_HASH", string(hash))

	body, _ := json.Marshal(map[string]string{"username": "testuser", "password": "testpass"})
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	setupTestRouter(t).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var found bool
	for _, c := range w.Result().Cookies() {
		if c.Name == "session" && c.Value != "" {
			found = true
		}
	}
	if !found {
		t.Error("expected session cookie to be set")
	}
}

func TestLogin_InvalidPassword(t *testing.T) {
	clearSessions()
	hash, _ := bcrypt.GenerateFromPassword([]byte("testpass"), 4)
	os.Setenv("APP_USERNAME", "testuser")
	os.Setenv("APP_PASSWORD_HASH", string(hash))

	body, _ := json.Marshal(map[string]string{"username": "testuser", "password": "wrongpass"})
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	setupTestRouter(t).ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestLogin_InvalidUsername(t *testing.T) {
	clearSessions()
	hash, _ := bcrypt.GenerateFromPassword([]byte("testpass"), 4)
	os.Setenv("APP_USERNAME", "testuser")
	os.Setenv("APP_PASSWORD_HASH", string(hash))

	body, _ := json.Marshal(map[string]string{"username": "wronguser", "password": "testpass"})
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	setupTestRouter(t).ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestAuthMiddleware_NoCookie(t *testing.T) {
	clearSessions()
	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	w := httptest.NewRecorder()

	setupTestRouter(t).ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestAuthMiddleware_ExpiredToken(t *testing.T) {
	clearSessions()
	sessions.Store("expired-token", time.Now().Add(-time.Hour))

	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	req.AddCookie(&http.Cookie{Name: "session", Value: "expired-token"})
	w := httptest.NewRecorder()

	setupTestRouter(t).ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestLogout(t *testing.T) {
	clearSessions()
	sessions.Store("active-token", time.Now().Add(time.Hour))

	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	req.AddCookie(&http.Cookie{Name: "session", Value: "active-token"})
	w := httptest.NewRecorder()

	setupTestRouter(t).ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", w.Code)
	}
	if _, ok := sessions.Load("active-token"); ok {
		t.Error("expected session to be deleted after logout")
	}
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
make test-backend
```

Expected: compilation error — `sessions` not defined, `newRouter` missing auth logic.

- [ ] **Step 3: Add session store, sweep goroutine, and auth middleware to `main.go`**

Add these declarations and functions at the package level in `api/cmd/api/main.go` (above `newRouter`):

```go
// Package-level session store: token → expiry
var sessions sync.Map

func startSessionSweep() {
	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			now := time.Now()
			sessions.Range(func(k, v interface{}) bool {
				if now.After(v.(time.Time)) {
					sessions.Delete(k)
				}
				return true
			})
		}
	}()
}

func authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session")
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		expiry, ok := sessions.Load(cookie.Value)
		if !ok || time.Now().After(expiry.(time.Time)) {
			sessions.Delete(cookie.Value)
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}
```

Add `"crypto/subtle"` and `"sync"` to the import block. Add `"golang.org/x/crypto/bcrypt"` as well.

Also call `startSessionSweep()` at the top of `main()`.

- [ ] **Step 4: Add auth routes and restructure the `/api` route group in `newRouter`**

Replace the existing `r.Route("/api", ...)` block with this structure. The three auth routes go in a public group; everything else (all existing routes) moves into the protected group with `r.Use(authMiddleware)`:

```go
r.Route("/api", func(r chi.Router) {
    // Public — no auth required
    r.Post("/auth/login", func(w http.ResponseWriter, r *http.Request) {
        var req struct {
            Username string `json:"username"`
            Password string `json:"password"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
            http.Error(w, "bad request", http.StatusBadRequest)
            return
        }
        appUser := os.Getenv("APP_USERNAME")
        appHash := os.Getenv("APP_PASSWORD_HASH")
        if subtle.ConstantTimeCompare([]byte(req.Username), []byte(appUser)) != 1 {
            http.Error(w, "unauthorized", http.StatusUnauthorized)
            return
        }
        if err := bcrypt.CompareHashAndPassword([]byte(appHash), []byte(req.Password)); err != nil {
            http.Error(w, "unauthorized", http.StatusUnauthorized)
            return
        }
        token := uuid.New().String()
        sessions.Store(token, time.Now().Add(7*24*time.Hour))
        http.SetCookie(w, &http.Cookie{
            Name:     "session",
            Value:    token,
            HttpOnly: true,
            Secure:   true,
            SameSite: http.SameSiteStrictMode,
            Path:     "/",
            MaxAge:   604800,
        })
        w.WriteHeader(http.StatusOK)
    })

    // Protected — all other routes
    r.Group(func(r chi.Router) {
        r.Use(authMiddleware)

        r.Post("/auth/logout", func(w http.ResponseWriter, r *http.Request) {
            cookie, err := r.Cookie("session")
            if err == nil {
                sessions.Delete(cookie.Value)
            }
            http.SetCookie(w, &http.Cookie{
                Name:   "session",
                Value:  "",
                Path:   "/",
                MaxAge: -1,
            })
            w.WriteHeader(http.StatusNoContent)
        })

        r.Get("/auth/me", func(w http.ResponseWriter, r *http.Request) {
            w.WriteHeader(http.StatusOK)
        })

        // Paste all existing route handlers here (r.Get("/quote", ...), r.Get("/habits", ...), etc.)
        // Nothing changes in those handlers — they just move inside this r.Group block.
    })
})
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
make test-backend
```

Expected: all tests PASS, coverage at or above 70%.

- [ ] **Step 6: Commit**

```bash
git add api/cmd/api/main.go api/cmd/api/auth_test.go
git commit -m "feat(api): add session-based auth middleware and login/logout/me routes"
```

---

## Task 3: LoginPage component (TDD)

**Files:**
- Create: `web/src/components/login-page.tsx`
- Create: `web/src/components/login-page.test.tsx`

**Interfaces:**
- Produces: `export function LoginPage({ onLogin }: { onLogin: () => void }): JSX.Element`
- Consumed by: `AuthGate` in Task 4.

- [ ] **Step 1: Write failing tests**

Create `web/src/components/login-page.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoginPage } from './login-page';

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders username field, password field, and submit button', () => {
    render(<LoginPage onLogin={vi.fn()} />);
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('calls onLogin when credentials are accepted', async () => {
    const onLogin = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    render(<LoginPage onLogin={onLogin} />);
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'user' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledOnce());
  });

  it('shows "Invalid credentials" when server returns 4xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    render(<LoginPage onLogin={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'user' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
make test-frontend
```

Expected: FAIL — `LoginPage` not found.

- [ ] **Step 3: Implement the component**

Create `web/src/components/login-page.tsx`:

```tsx
import { useState } from 'react';

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        onLogin();
      } else {
        setError('Invalid credentials');
      }
    } catch {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0B0E14] flex items-center justify-center font-mono">
      <div className="bg-[#161B22] p-10 rounded-sm w-full max-w-sm flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-tight text-[#E6EDF3]">Commit</h1>
          <p className="text-[#7D8590] text-xs uppercase tracking-widest mt-1">Precision Habit Tracking</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="username" className="text-[#7D8590] text-xs uppercase tracking-widest">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="bg-[#0B0E14] text-[#E6EDF3] px-4 py-2 rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-[#39D353] border border-transparent"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-[#7D8590] text-xs uppercase tracking-widest">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="bg-[#0B0E14] text-[#E6EDF3] px-4 py-2 rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-[#39D353] border border-transparent"
            />
          </div>
          {error && (
            <p role="alert" className="text-[#f87171] text-xs font-mono">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="bg-[#39D353] text-[#0B0E14] py-2 rounded-sm font-bold uppercase tracking-wider hover:bg-white transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
make test-frontend
```

Expected: all `LoginPage` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/login-page.tsx web/src/components/login-page.test.tsx
git commit -m "feat(web): add LoginPage component"
```

---

## Task 4: AuthGate component + wire into `main.tsx` (TDD)

**Files:**
- Create: `web/src/components/auth-gate.tsx`
- Create: `web/src/components/auth-gate.test.tsx`
- Modify: `web/src/main.tsx`

**Interfaces:**
- Consumes: `LoginPage` from Task 3, `App` from `../App`.
- Produces: `export function AuthGate(): JSX.Element` — rendered by `main.tsx`.

- [ ] **Step 1: Write failing tests**

Create `web/src/components/auth-gate.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthGate } from './auth-gate';

vi.mock('../App', () => ({ default: () => <div>App Content</div> }));
vi.mock('./login-page', () => ({
  LoginPage: ({ onLogin }: { onLogin: () => void }) => (
    <button onClick={onLogin}>Login button</button>
  ),
}));

describe('AuthGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders App when /api/auth/me returns 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    render(<AuthGate />);
    await waitFor(() =>
      expect(screen.getByText('App Content')).toBeInTheDocument()
    );
  });

  it('renders LoginPage when /api/auth/me returns 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    render(<AuthGate />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Login button' })).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
make test-frontend
```

Expected: FAIL — `AuthGate` not found.

- [ ] **Step 3: Implement AuthGate**

Create `web/src/components/auth-gate.tsx`:

```tsx
import { useState, useEffect } from 'react';
import App from '../App';
import { LoginPage } from './login-page';

type AuthState = 'loading' | 'authed' | 'unauthed';

export function AuthGate() {
  const [auth, setAuth] = useState<AuthState>('loading');

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => setAuth(res.ok ? 'authed' : 'unauthed'))
      .catch(() => setAuth('unauthed'));
  }, []);

  if (auth === 'loading') return null;
  if (auth === 'unauthed') return <LoginPage onLogin={() => setAuth('authed')} />;
  return <App onLogout={() => setAuth('unauthed')} />;
}
```

- [ ] **Step 4: Update `main.tsx` to use AuthGate**

Replace the contents of `web/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AuthGate } from './components/auth-gate'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate />
  </StrictMode>,
)
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
make test-frontend
```

Expected: all `AuthGate` tests PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/auth-gate.tsx web/src/components/auth-gate.test.tsx web/src/main.tsx
git commit -m "feat(web): add AuthGate component, wire into main.tsx"
```

---

## Task 5: Logout button in `App.tsx` (TDD)

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/App.test.tsx`

**Interfaces:**
- Consumes: `onLogout?: () => void` prop passed by `AuthGate`.
- The prop is optional so existing `App.test.tsx` tests that render `<App />` without props continue to pass.

- [ ] **Step 1: Add failing test to `App.test.tsx`**

Add this new `describe` block at the bottom of `web/src/App.test.tsx`:

```tsx
describe('App — Logout', () => {
  it('calls onLogout and posts to /api/auth/logout when sign out is clicked', async () => {
    const onLogout = vi.fn();
    (fetch as Mock).mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes('/api/auth/logout') && opts?.method === 'POST') {
        return Promise.resolve({ ok: true });
      }
      if (url.includes('/api/habits')) return Promise.resolve({ ok: true, json: async () => mockHabits });
      if (url.includes('/api/insights')) return Promise.resolve({ ok: true, json: async () => mockInsights });
      if (url.includes('/api/quote')) return Promise.resolve({ ok: true, json: async () => ({ quote: 'q', author: 'a', category: 'c' }) });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    render(<App onLogout={onLogout} />);
    const btn = await screen.findByRole('button', { name: /sign out/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
      expect(onLogout).toHaveBeenCalledOnce();
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm the new test fails**

```bash
make test-frontend
```

Expected: new test FAILS — `onLogout` prop not accepted, button not found.

- [ ] **Step 3: Add `onLogout` prop and logout button to `App.tsx`**

Change the `App` function signature (line ~25 in `App.tsx`):

```tsx
// Before:
function App() {

// After:
function App({ onLogout }: { onLogout?: () => void } = {}) {
```

In the `<header>` block (around line 511), the current right side has a single insights button. Wrap it and add the logout button:

```tsx
{/* Before: */}
<button
  onClick={() => setShowInsights(!showInsights)}
  className={`pointer-events-auto cursor-pointer font-mono text-xs px-3 py-1.5 rounded-sm border transition-colors ${showInsights ? 'bg-accent-4 text-background border-accent-4' : 'bg-surface border-white/10 text-text-secondary hover:text-text-primary hover:border-white/30'}`}
  aria-label="Toggle insights panel"
  title="Toggle System Insights"
>
  &gt;_
</button>

{/* After: */}
<div className="pointer-events-auto flex items-center gap-2">
  <button
    onClick={() => setShowInsights(!showInsights)}
    className={`cursor-pointer font-mono text-xs px-3 py-1.5 rounded-sm border transition-colors ${showInsights ? 'bg-accent-4 text-background border-accent-4' : 'bg-surface border-white/10 text-text-secondary hover:text-text-primary hover:border-white/30'}`}
    aria-label="Toggle insights panel"
    title="Toggle System Insights"
  >
    &gt;_
  </button>
  <button
    onClick={async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      onLogout?.();
    }}
    className="cursor-pointer font-mono text-xs px-3 py-1.5 rounded-sm border border-white/10 text-text-secondary hover:text-text-primary hover:border-white/30 transition-colors"
    aria-label="Sign out"
  >
    Sign out
  </button>
</div>
```

- [ ] **Step 4: Run tests to confirm all pass**

```bash
make test-frontend
```

Expected: all tests PASS including the new logout test.

- [ ] **Step 5: Commit**

```bash
git add web/src/App.tsx web/src/App.test.tsx
git commit -m "feat(web): add logout button to App header"
```

---

## Task 6: Env vars setup + smoke test

**Files:**
- Modify: `.env.example`
- Modify: `.env` (local only — never committed)

- [ ] **Step 1: Update `.env.example`**

Add to `.env.example`:

```
# Auth — single-user login
APP_USERNAME=your_username
APP_PASSWORD_HASH=your_bcrypt_hash
```

- [ ] **Step 2: Generate a bcrypt hash and set credentials in `.env`**

On the host machine (requires `htpasswd` from Apache utils, or use the Go one-liner below):

```bash
# Option A — htpasswd (macOS: brew install httpd)
htpasswd -bnBC 12 "" yourpassword | tr -d ':\n'

# Option B — Go one-liner (no extra installs needed since Go is present)
cd api && go run -v - <<'EOF'
package main
import (
  "fmt"
  "golang.org/x/crypto/bcrypt"
)
func main() {
  hash, _ := bcrypt.GenerateFromPassword([]byte("yourpassword"), 12)
  fmt.Println(string(hash))
}
EOF
```

Add the output to `.env`:

```
APP_USERNAME=your_chosen_username
APP_PASSWORD_HASH=<paste hash here>
```

- [ ] **Step 3: Full integration build and smoke test**

```bash
make build
```

Expected: containers start successfully.

Open https://commit.ezetina.com/ (or http://localhost:9092/ for local testing).

Verify:
1. The app shows the login page instead of the main UI.
2. Entering wrong credentials shows "Invalid credentials".
3. Entering correct credentials shows the main Commit dashboard.
4. The "Sign out" button in the header logs out and returns to the login page.
5. After logout, navigating to `/` shows the login page again.
6. Calling `curl https://commit.ezetina.com/api/habits` returns `401 unauthorized` (no cookie).

- [ ] **Step 4: Commit env example**

```bash
git add .env.example
git commit -m "chore: document APP_USERNAME and APP_PASSWORD_HASH env vars"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** Login/logout/me routes — Task 2. Bcrypt cost 12 — Task 6 Step 2. HTTP-only Secure SameSite=Strict cookie — Task 2 Step 4. In-memory session store with sweep — Task 2 Step 3. LoginPage with design tokens — Task 3. AuthGate — Task 4. Logout button — Task 5. Env vars — Task 6. `subtle.ConstantTimeCompare` on username — Task 2 Step 4. No detail in 401 responses — Task 2 Step 4 (both handlers return plain "unauthorized").
- [x] **Placeholder scan:** No TBDs. All code blocks are complete and runnable.
- [x] **Type consistency:** `onLogout?: () => void` defined in Task 5 Step 3, consumed in Task 4 Step 3 as `onLogout={() => setAuth('unauthed')}`. `LoginPage` prop `onLogin: () => void` defined in Task 3 Step 3, consumed in Task 4 Step 3. `AuthGate` export used in Task 4 Step 4 (`main.tsx`).
- [x] **Breaking change check:** `App` gains an optional prop — default `{}` ensures existing `<App />` calls in tests and `main.tsx` (pre-Task-4) still compile.
