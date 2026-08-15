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
