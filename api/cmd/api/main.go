package main

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"time"

	"github.com/ezetina/commit/api/internal/models"
	"github.com/ezetina/commit/api/internal/repository"
	"github.com/ezetina/commit/api/internal/service"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// quoteClient is a package-level client so TCP connections are reused across requests.
var quoteClient = &http.Client{Timeout: 10 * time.Second}

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

	habitService := service.NewHabitService(repo)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})

	r.Route("/api", func(r chi.Router) {
		r.Get("/quote", func(w http.ResponseWriter, r *http.Request) {
			apiKey := os.Getenv("NINJAS_API_KEY")
			if apiKey == "" {
				http.Error(w, "API key not configured", http.StatusInternalServerError)
				return
			}

			quoteCategories := []string{
				"inspirational", "success", "happiness", "life", "motivational",
				"wisdom", "courage", "perseverance", "focus", "discipline",
			}
			category := quoteCategories[rand.Intn(len(quoteCategories))]
			reqURL := "https://api.api-ninjas.com/v1/quotes?category=" + category

			// Propagate the incoming request context so cancellations are respected.
			reqAPI, err := http.NewRequestWithContext(r.Context(), http.MethodGet, reqURL, nil)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			reqAPI.Header.Add("X-Api-Key", apiKey)

			resp, err := quoteClient.Do(reqAPI)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusOK {
				bodyBytes, _ := io.ReadAll(resp.Body)
				http.Error(w, "Failed to fetch quote: "+resp.Status+" - "+string(bodyBytes), http.StatusInternalServerError)
				return
			}

			var quotes []map[string]interface{}
			if err := json.NewDecoder(resp.Body).Decode(&quotes); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			if len(quotes) == 0 {
				http.Error(w, "No quotes found", http.StatusNotFound)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(quotes[0])
		})

		r.Get("/insights", func(w http.ResponseWriter, r *http.Request) {
			insights, err := habitService.GenerateInsights(r.Context())
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if insights == nil {
				insights = []service.Insight{}
			}
			json.NewEncoder(w).Encode(insights)
		})

		r.Get("/habits", func(w http.ResponseWriter, r *http.Request) {
			includeArchived := r.URL.Query().Get("archived") == "true"
			habits, err := habitService.ListHabits(r.Context(), includeArchived)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if habits == nil {
				habits = []*models.Habit{}
			}
			json.NewEncoder(w).Encode(habits)
		})

		r.Post("/habits", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				Name           string   `json:"name"`
				MeasureUnit    string   `json:"measure_unit"`
				Tags           []string `json:"tags"`
				DayStartOffset int      `json:"day_start_offset"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if req.Name == "" {
				http.Error(w, "name is required", http.StatusBadRequest)
				return
			}

			habit, err := habitService.CreateHabit(r.Context(), req.Name, req.MeasureUnit, req.Tags, req.DayStartOffset)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(habit)
		})

		r.Put("/habits/{id}", func(w http.ResponseWriter, r *http.Request) {
			id := chi.URLParam(r, "id")
			var req struct {
				Name           string   `json:"name"`
				MeasureUnit    string   `json:"measure_unit"`
				Tags           []string `json:"tags"`
				DayStartOffset int      `json:"day_start_offset"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if req.Name == "" {
				http.Error(w, "name is required", http.StatusBadRequest)
				return
			}

			if err := habitService.UpdateHabit(r.Context(), id, req.Name, req.MeasureUnit, req.Tags, req.DayStartOffset); err != nil {
				if errors.Is(err, repository.ErrNotFound) {
					http.Error(w, "habit not found", http.StatusNotFound)
					return
				}
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusOK)
		})

		r.Delete("/habits/{id}", func(w http.ResponseWriter, r *http.Request) {
			id := chi.URLParam(r, "id")
			if err := habitService.DeleteHabit(r.Context(), id); err != nil {
				if errors.Is(err, repository.ErrNotFound) {
					http.Error(w, "habit not found", http.StatusNotFound)
					return
				}
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})

		r.Patch("/habits/{id}/archive", func(w http.ResponseWriter, r *http.Request) {
			id := chi.URLParam(r, "id")
			if err := habitService.ArchiveHabit(r.Context(), id, true); err != nil {
				if errors.Is(err, repository.ErrNotFound) {
					http.Error(w, "habit not found", http.StatusNotFound)
					return
				}
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})

		r.Patch("/habits/{id}/unarchive", func(w http.ResponseWriter, r *http.Request) {
			id := chi.URLParam(r, "id")
			if err := habitService.ArchiveHabit(r.Context(), id, false); err != nil {
				if errors.Is(err, repository.ErrNotFound) {
					http.Error(w, "habit not found", http.StatusNotFound)
					return
				}
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})

		r.Post("/check-in", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				HabitID string `json:"habit_id"`
				Date    string `json:"date"`  // Optional
				Value   *int   `json:"value"` // Pointer: nil means not provided; 0 is a valid value
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if req.HabitID == "" {
				http.Error(w, "habit_id is required", http.StatusBadRequest)
				return
			}

			value := 1 // default when field is absent
			if req.Value != nil {
				value = *req.Value
			}

			if err := habitService.CheckIn(r.Context(), req.HabitID, req.Date, value); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatal(err)
	}
}
