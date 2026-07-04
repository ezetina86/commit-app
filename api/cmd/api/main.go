package main

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"strconv"
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
			w.Header().Set("Content-Type", "application/json")
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
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(habits)
		})

		r.Post("/habits", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				Name           string   `json:"name"`
				MeasureUnit    string   `json:"measure_unit"`
				Tags           []string `json:"tags"`
				DayStartOffset int      `json:"day_start_offset"`
				HabitType      string   `json:"habit_type"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if req.Name == "" {
				http.Error(w, "name is required", http.StatusBadRequest)
				return
			}
			if req.HabitType != "boolean" {
				req.HabitType = "quantitative"
			}

			habit, err := habitService.CreateHabit(r.Context(), req.Name, req.MeasureUnit, req.Tags, req.DayStartOffset, req.HabitType)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
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
				HabitType      string   `json:"habit_type"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if req.Name == "" {
				http.Error(w, "name is required", http.StatusBadRequest)
				return
			}
			if req.HabitType != "boolean" {
				req.HabitType = "quantitative"
			}

			if err := habitService.UpdateHabit(r.Context(), id, req.Name, req.MeasureUnit, req.Tags, req.DayStartOffset, req.HabitType); err != nil {
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

		r.Post("/bp", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				Systolic   int    `json:"systolic"`
				Diastolic  int    `json:"diastolic"`
				Notes      string `json:"notes"`
				RecordedAt string `json:"recorded_at"` // optional ISO datetime
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if req.Systolic <= 0 || req.Diastolic <= 0 {
				http.Error(w, "systolic and diastolic must be greater than 0", http.StatusBadRequest)
				return
			}

			recordedAt := time.Now().UTC()
			if req.RecordedAt != "" {
				parsed, err := time.Parse(time.RFC3339, req.RecordedAt)
				if err != nil {
					http.Error(w, "invalid recorded_at format, use RFC3339", http.StatusBadRequest)
					return
				}
				recordedAt = parsed.UTC()
			}

			reading, err := habitService.CreateBPReading(r.Context(), req.Systolic, req.Diastolic, req.Notes, recordedAt)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(reading)
		})

		r.Get("/bp", func(w http.ResponseWriter, r *http.Request) {
			readings, err := habitService.ListBPReadings(r.Context())
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(readings)
		})

		r.Delete("/bp/{id}", func(w http.ResponseWriter, r *http.Request) {
			id := chi.URLParam(r, "id")
			if err := habitService.DeleteBPReading(r.Context(), id); err != nil {
				if errors.Is(err, repository.ErrNotFound) {
					http.Error(w, "reading not found", http.StatusNotFound)
					return
				}
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})

		r.Post("/elo", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				Platform   string `json:"platform"`
				Rating     int    `json:"rating"`
				Notes      string `json:"notes"`
				RecordedAt string `json:"recorded_at"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if req.Platform != "duolingo" && req.Platform != "chesscom" {
				http.Error(w, "platform must be duolingo or chesscom", http.StatusBadRequest)
				return
			}
			if req.Rating <= 0 {
				http.Error(w, "rating must be greater than 0", http.StatusBadRequest)
				return
			}
			recordedAt := time.Now().UTC()
			if req.RecordedAt != "" {
				parsed, err := time.Parse(time.RFC3339, req.RecordedAt)
				if err != nil {
					http.Error(w, "invalid recorded_at format, use RFC3339", http.StatusBadRequest)
					return
				}
				recordedAt = parsed.UTC()
			}
			reading, err := habitService.CreateEloReading(r.Context(), req.Platform, req.Rating, req.Notes, recordedAt)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(reading)
		})

		r.Get("/elo", func(w http.ResponseWriter, r *http.Request) {
			readings, err := habitService.ListEloReadings(r.Context())
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(readings)
		})

		r.Delete("/elo/{id}", func(w http.ResponseWriter, r *http.Request) {
			id := chi.URLParam(r, "id")
			if err := habitService.DeleteEloReading(r.Context(), id); err != nil {
				if errors.Is(err, repository.ErrNotFound) {
					http.Error(w, "reading not found", http.StatusNotFound)
					return
				}
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})

		r.Get("/elo/target", func(w http.ResponseWriter, r *http.Request) {
			val, err := habitService.GetSetting(r.Context(), "elo_target")
			target := 800
			if err == nil {
				if n, parseErr := strconv.Atoi(val); parseErr == nil {
					target = n
				}
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]int{"target": target})
		})

		r.Patch("/elo/target", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				Target int `json:"target"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if req.Target <= 0 {
				http.Error(w, "target must be greater than 0", http.StatusBadRequest)
				return
			}
			if err := habitService.SetSetting(r.Context(), "elo_target", strconv.Itoa(req.Target)); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]int{"target": req.Target})
		})

		r.Post("/steps", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				Steps      int    `json:"steps"`
				Notes      string `json:"notes"`
				RecordedAt string `json:"recorded_at"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if req.Steps <= 0 {
				http.Error(w, "steps must be greater than 0", http.StatusBadRequest)
				return
			}
			recordedAt := time.Now().UTC()
			if req.RecordedAt != "" {
				parsed, err := time.Parse(time.RFC3339, req.RecordedAt)
				if err != nil {
					http.Error(w, "invalid recorded_at format, use RFC3339", http.StatusBadRequest)
					return
				}
				recordedAt = parsed.UTC()
			}
			reading, err := habitService.CreateStepsReading(r.Context(), req.Steps, req.Notes, recordedAt)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(reading)
		})

		r.Get("/steps", func(w http.ResponseWriter, r *http.Request) {
			readings, err := habitService.ListStepsReadings(r.Context())
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(readings)
		})

		r.Delete("/steps/{id}", func(w http.ResponseWriter, r *http.Request) {
			id := chi.URLParam(r, "id")
			if err := habitService.DeleteStepsReading(r.Context(), id); err != nil {
				if errors.Is(err, repository.ErrNotFound) {
					http.Error(w, "reading not found", http.StatusNotFound)
					return
				}
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})

		r.Get("/steps/target", func(w http.ResponseWriter, r *http.Request) {
			val, err := habitService.GetSetting(r.Context(), "steps_target")
			target := 15000
			if err == nil {
				if n, parseErr := strconv.Atoi(val); parseErr == nil {
					target = n
				}
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]int{"target": target})
		})

		r.Patch("/steps/target", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				Target int `json:"target"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if req.Target <= 0 {
				http.Error(w, "target must be greater than 0", http.StatusBadRequest)
				return
			}
			if err := habitService.SetSetting(r.Context(), "steps_target", strconv.Itoa(req.Target)); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]int{"target": req.Target})
		})

		r.Post("/weight", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				Weight     float64 `json:"weight"`
				Notes      string  `json:"notes"`
				RecordedAt string  `json:"recorded_at"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if req.Weight <= 0 {
				http.Error(w, "weight must be greater than 0", http.StatusBadRequest)
				return
			}
			recordedAt := time.Now().UTC()
			if req.RecordedAt != "" {
				parsed, err := time.Parse(time.RFC3339, req.RecordedAt)
				if err != nil {
					http.Error(w, "invalid recorded_at format, use RFC3339", http.StatusBadRequest)
					return
				}
				recordedAt = parsed.UTC()
			}
			reading, err := habitService.CreateWeightReading(r.Context(), req.Weight, req.Notes, recordedAt)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(reading)
		})

		r.Get("/weight", func(w http.ResponseWriter, r *http.Request) {
			readings, err := habitService.ListWeightReadings(r.Context())
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(readings)
		})

		r.Delete("/weight/{id}", func(w http.ResponseWriter, r *http.Request) {
			id := chi.URLParam(r, "id")
			if err := habitService.DeleteWeightReading(r.Context(), id); err != nil {
				if errors.Is(err, repository.ErrNotFound) {
					http.Error(w, "reading not found", http.StatusNotFound)
					return
				}
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})

		r.Post("/circumference", func(w http.ResponseWriter, r *http.Request) {
			var req struct {
				Abdomen    float64 `json:"abdomen"`
				Biceps     float64 `json:"biceps"`
				Quads      float64 `json:"quads"`
				Notes      string  `json:"notes"`
				RecordedAt string  `json:"recorded_at"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if req.Abdomen <= 0 || req.Biceps <= 0 || req.Quads <= 0 {
				http.Error(w, "abdomen, biceps, and quads must be greater than 0", http.StatusBadRequest)
				return
			}
			recordedAt := time.Now().UTC()
			if req.RecordedAt != "" {
				parsed, err := time.Parse(time.RFC3339, req.RecordedAt)
				if err != nil {
					http.Error(w, "invalid recorded_at format, use RFC3339", http.StatusBadRequest)
					return
				}
				recordedAt = parsed.UTC()
			}
			reading, err := habitService.CreateCircumferenceReading(r.Context(), req.Abdomen, req.Biceps, req.Quads, req.Notes, recordedAt)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(reading)
		})

		r.Get("/circumference", func(w http.ResponseWriter, r *http.Request) {
			readings, err := habitService.ListCircumferenceReadings(r.Context())
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(readings)
		})

		r.Delete("/circumference/{id}", func(w http.ResponseWriter, r *http.Request) {
			id := chi.URLParam(r, "id")
			if err := habitService.DeleteCircumferenceReading(r.Context(), id); err != nil {
				if errors.Is(err, repository.ErrNotFound) {
					http.Error(w, "reading not found", http.StatusNotFound)
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
