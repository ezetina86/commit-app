package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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

func clearLoginWindows() {
	loginWindows.Range(func(k, v interface{}) bool {
		loginWindows.Delete(k)
		return true
	})
}

func TestLogin_ValidCredentials(t *testing.T) {
	clearSessions()
	hash, _ := bcrypt.GenerateFromPassword([]byte("testpass"), 4) // cost 4 in tests for speed
	t.Setenv("APP_USERNAME", "testuser")
	t.Setenv("APP_PASSWORD_HASH", string(hash))

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
	t.Setenv("APP_USERNAME", "testuser")
	t.Setenv("APP_PASSWORD_HASH", string(hash))

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
	t.Setenv("APP_USERNAME", "testuser")
	t.Setenv("APP_PASSWORD_HASH", string(hash))

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

func TestExistingRoute_RequiresAuth(t *testing.T) {
	clearSessions()
	req := httptest.NewRequest(http.MethodGet, "/api/habits", nil)
	w := httptest.NewRecorder()

	setupTestRouter(t).ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestLogin_RateLimit(t *testing.T) {
	clearSessions()
	clearLoginWindows()
	hash, _ := bcrypt.GenerateFromPassword([]byte("testpass"), 4)
	t.Setenv("APP_USERNAME", "testuser")
	t.Setenv("APP_PASSWORD_HASH", string(hash))

	router := setupTestRouter(t)
	body := func() *bytes.Reader {
		b, _ := json.Marshal(map[string]string{"username": "testuser", "password": "wrong"})
		return bytes.NewReader(b)
	}

	// First 10 attempts should return 401 (wrong creds), not 429
	for i := range 10 {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", body())
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = "1.2.3.4:9999"
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected 401, got %d", i+1, w.Code)
		}
	}

	// 11th attempt should be rate-limited
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", body())
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "1.2.3.4:9999"
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after 10 attempts, got %d", w.Code)
	}
}

func TestLogin_RateLimit_CFConnectingIP(t *testing.T) {
	clearSessions()
	clearLoginWindows()
	hash, _ := bcrypt.GenerateFromPassword([]byte("testpass"), 4)
	t.Setenv("APP_USERNAME", "testuser")
	t.Setenv("APP_PASSWORD_HASH", string(hash))

	router := setupTestRouter(t)
	body := func() *bytes.Reader {
		b, _ := json.Marshal(map[string]string{"username": "testuser", "password": "wrong"})
		return bytes.NewReader(b)
	}

	// Rate limit keyed on CF-Connecting-IP, not RemoteAddr
	for range 10 {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", body())
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("CF-Connecting-IP", "5.6.7.8")
		req.RemoteAddr = "cloudflare-proxy:443"
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", body())
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("CF-Connecting-IP", "5.6.7.8")
	req.RemoteAddr = "cloudflare-proxy:443"
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 keyed on CF-Connecting-IP, got %d", w.Code)
	}
}

func TestLogin_RateLimit_DifferentIPs(t *testing.T) {
	clearSessions()
	clearLoginWindows()
	hash, _ := bcrypt.GenerateFromPassword([]byte("testpass"), 4)
	t.Setenv("APP_USERNAME", "testuser")
	t.Setenv("APP_PASSWORD_HASH", string(hash))

	router := setupTestRouter(t)
	body := func() *bytes.Reader {
		b, _ := json.Marshal(map[string]string{"username": "testuser", "password": "wrong"})
		return bytes.NewReader(b)
	}

	// Exhaust IP A
	for range 10 {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", body())
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = "10.0.0.1:1000"
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
	}

	// IP B should still be allowed
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", body())
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "10.0.0.2:1000"
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code == http.StatusTooManyRequests {
		t.Fatal("different IP should not be rate-limited")
	}
}

func TestRealIP(t *testing.T) {
	cases := []struct {
		name     string
		headers  map[string]string
		remote   string
		expected string
	}{
		{"CF header", map[string]string{"CF-Connecting-IP": "1.1.1.1"}, "2.2.2.2:80", "1.1.1.1"},
		{"X-Real-IP fallback", map[string]string{"X-Real-IP": "3.3.3.3"}, "4.4.4.4:80", "3.3.3.3"},
		{"RemoteAddr fallback", nil, "5.5.5.5:8080", "5.5.5.5"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req.RemoteAddr = tc.remote
			for k, v := range tc.headers {
				req.Header.Set(k, v)
			}
			if got := realIP(req); got != tc.expected {
				t.Fatalf("expected %q, got %q", tc.expected, got)
			}
		})
	}
}
