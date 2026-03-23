package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/ezetina/commit/api/internal/models"
	"github.com/google/uuid"
	_ "modernc.org/sqlite"
)

// ErrNotFound is returned when an operation targets a record that does not exist.
var ErrNotFound = errors.New("record not found")

type SQLiteRepository struct {
	db *sql.DB
}

func NewSQLiteRepository(dbPath string) (*SQLiteRepository, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// SQLite allows only one concurrent writer; a pool > 1 causes "database is locked" errors.
	db.SetMaxOpenConns(1)
	db.SetConnMaxLifetime(0)
	db.SetConnMaxIdleTime(0)

	repo := &SQLiteRepository{db: db}
	if err := repo.initSchema(); err != nil {
		return nil, fmt.Errorf("failed to init schema: %w", err)
	}

	return repo, nil
}

func (r *SQLiteRepository) initSchema() error {
	// Enable WAL mode for better read concurrency and FK enforcement.
	// These must be set before DDL runs; with MaxOpenConns(1) the same
	// connection is always reused so PRAGMAs persist for the process lifetime.
	pragmas := []string{
		`PRAGMA journal_mode=WAL`,
		`PRAGMA foreign_keys=ON`,
	}
	for _, p := range pragmas {
		if _, err := r.db.Exec(p); err != nil {
			return fmt.Errorf("failed to set pragma %q: %w", p, err)
		}
	}

	queries := []string{
		`CREATE TABLE IF NOT EXISTS habits (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			day_start_offset INTEGER DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE TABLE IF NOT EXISTS completions (
			id TEXT PRIMARY KEY,
			habit_id TEXT NOT NULL,
			completed_at DATETIME NOT NULL,
			date TEXT NOT NULL,
			FOREIGN KEY(habit_id) REFERENCES habits(id)
		);`,
		`CREATE INDEX IF NOT EXISTS idx_completions_habit_id ON completions(habit_id);`,
		`CREATE INDEX IF NOT EXISTS idx_completions_date ON completions(date);`,
	}

	for _, q := range queries {
		if _, err := r.db.Exec(q); err != nil {
			return err
		}
	}

	// Safely add new columns. Errors are ignored as they fail when columns already exist.
	r.db.Exec(`ALTER TABLE habits ADD COLUMN measure_unit TEXT DEFAULT ''`)
	r.db.Exec(`ALTER TABLE completions ADD COLUMN value INTEGER DEFAULT 1`)
	r.db.Exec(`ALTER TABLE habits ADD COLUMN tags TEXT DEFAULT '[]'`)
	r.db.Exec(`ALTER TABLE habits ADD COLUMN archived INTEGER DEFAULT 0`)

	return nil
}

func (r *SQLiteRepository) CreateHabit(ctx context.Context, name string, measureUnit string, tags []string, offset int) (*models.Habit, error) {
	id := uuid.New().String()
	tagsJSON, _ := json.Marshal(tags)
	if string(tagsJSON) == "null" {
		tagsJSON = []byte("[]")
	}

	query := `INSERT INTO habits (id, name, measure_unit, tags, day_start_offset) VALUES (?, ?, ?, ?, ?)`
	_, err := r.db.ExecContext(ctx, query, id, name, measureUnit, string(tagsJSON), offset)
	if err != nil {
		return nil, err
	}
	return &models.Habit{
		ID:             id,
		Name:           name,
		MeasureUnit:    measureUnit,
		Tags:           tags,
		DayStartOffset: offset,
		CreatedAt:      time.Now(),
	}, nil
}

func (r *SQLiteRepository) GetHabits(ctx context.Context, includeArchived bool) ([]*models.Habit, error) {
	query := `SELECT id, name, IFNULL(measure_unit, ''), IFNULL(tags, '[]'), day_start_offset, IFNULL(archived, 0), created_at FROM habits`
	if !includeArchived {
		query += ` WHERE IFNULL(archived, 0) = 0`
	}
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var habits []*models.Habit
	for rows.Next() {
		h := &models.Habit{}
		var tagsStr string
		var archived int
		if err := rows.Scan(&h.ID, &h.Name, &h.MeasureUnit, &tagsStr, &h.DayStartOffset, &archived, &h.CreatedAt); err != nil {
			return nil, err
		}
		h.Archived = archived != 0

		var tags []string
		if err := json.Unmarshal([]byte(tagsStr), &tags); err != nil {
			return nil, fmt.Errorf("failed to parse tags for habit %s: %w", h.ID, err)
		}
		h.Tags = tags

		habits = append(habits, h)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return habits, nil
}

func (r *SQLiteRepository) ArchiveHabit(ctx context.Context, id string, archived bool) error {
	val := 0
	if archived {
		val = 1
	}
	result, err := r.db.ExecContext(ctx, `UPDATE habits SET archived = ? WHERE id = ?`, val, id)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *SQLiteRepository) GetHabitByID(ctx context.Context, id string) (*models.Habit, error) {
	query := `SELECT id, name, IFNULL(measure_unit, ''), IFNULL(tags, '[]'), day_start_offset, IFNULL(archived, 0), created_at FROM habits WHERE id = ?`
	h := &models.Habit{}
	var tagsStr string
	var archived int
	err := r.db.QueryRowContext(ctx, query, id).Scan(&h.ID, &h.Name, &h.MeasureUnit, &tagsStr, &h.DayStartOffset, &archived, &h.CreatedAt)
	if err != nil {
		return nil, err
	}
	h.Archived = archived != 0

	var tags []string
	if err := json.Unmarshal([]byte(tagsStr), &tags); err != nil {
		return nil, fmt.Errorf("failed to parse tags for habit %s: %w", h.ID, err)
	}
	h.Tags = tags

	return h, nil
}

// GetCompletionsByHabitIDs fetches completions for all given habit IDs in a
// single query, eliminating the N+1 pattern in ListHabits.
func (r *SQLiteRepository) GetCompletionsByHabitIDs(ctx context.Context, habitIDs []string) (map[string][]models.CompletionData, error) {
	result := make(map[string][]models.CompletionData, len(habitIDs))
	if len(habitIDs) == 0 {
		return result, nil
	}

	placeholders := strings.Repeat("?,", len(habitIDs))
	placeholders = placeholders[:len(placeholders)-1] // trim trailing comma

	query := fmt.Sprintf(`
		SELECT habit_id, date, SUM(IFNULL(value, 1)) AS total_value
		FROM completions
		WHERE habit_id IN (%s)
		GROUP BY habit_id, date
		ORDER BY habit_id, date DESC
	`, placeholders)

	args := make([]any, len(habitIDs))
	for i, id := range habitIDs {
		args[i] = id
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var habitID string
		var cd models.CompletionData
		if err := rows.Scan(&habitID, &cd.Date, &cd.Value); err != nil {
			return nil, err
		}
		result[habitID] = append(result[habitID], cd)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func (r *SQLiteRepository) AddCompletion(ctx context.Context, habitID, date string, value int) error {
	id := uuid.New().String()
	query := `INSERT INTO completions (id, habit_id, completed_at, date, value) VALUES (?, ?, ?, ?, ?)`
	_, err := r.db.ExecContext(ctx, query, id, habitID, time.Now().UTC(), date, value)
	return err
}

func (r *SQLiteRepository) UpdateHabit(ctx context.Context, id, name string, measureUnit string, tags []string, offset int) error {
	tagsJSON, _ := json.Marshal(tags)
	if string(tagsJSON) == "null" {
		tagsJSON = []byte("[]")
	}

	query := `UPDATE habits SET name = ?, measure_unit = ?, tags = ?, day_start_offset = ? WHERE id = ?`
	result, err := r.db.ExecContext(ctx, query, name, measureUnit, string(tagsJSON), offset, id)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *SQLiteRepository) DeleteHabit(ctx context.Context, id string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `DELETE FROM completions WHERE habit_id = ?`, id); err != nil {
		return err
	}

	result, err := tx.ExecContext(ctx, `DELETE FROM habits WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}

	return tx.Commit()
}

func (r *SQLiteRepository) Close() error {
	return r.db.Close()
}
