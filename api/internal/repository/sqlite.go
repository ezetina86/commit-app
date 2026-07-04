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
		`CREATE TABLE IF NOT EXISTS blood_pressure_readings (
			id          TEXT PRIMARY KEY,
			systolic    INTEGER NOT NULL,
			diastolic   INTEGER NOT NULL,
			notes       TEXT DEFAULT '',
			recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE INDEX IF NOT EXISTS idx_bp_recorded_at ON blood_pressure_readings(recorded_at);`,
		`CREATE TABLE IF NOT EXISTS elo_readings (
			id          TEXT PRIMARY KEY,
			platform    TEXT NOT NULL,
			rating      INTEGER NOT NULL,
			notes       TEXT DEFAULT '',
			recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE INDEX IF NOT EXISTS idx_elo_recorded_at ON elo_readings(recorded_at);`,
		`CREATE TABLE IF NOT EXISTS steps_readings (
			id          TEXT PRIMARY KEY,
			steps       INTEGER NOT NULL,
			notes       TEXT DEFAULT '',
			recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE INDEX IF NOT EXISTS idx_steps_recorded_at ON steps_readings(recorded_at);`,
		`CREATE TABLE IF NOT EXISTS weight_readings (
			id          TEXT PRIMARY KEY,
			weight      REAL NOT NULL,
			notes       TEXT DEFAULT '',
			recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE INDEX IF NOT EXISTS idx_weight_recorded_at ON weight_readings(recorded_at);`,
		`CREATE TABLE IF NOT EXISTS circumference_readings (
			id          TEXT PRIMARY KEY,
			abdomen     REAL NOT NULL,
			biceps      REAL NOT NULL,
			quads       REAL NOT NULL,
			notes       TEXT DEFAULT '',
			recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE INDEX IF NOT EXISTS idx_circumference_recorded_at ON circumference_readings(recorded_at);`,
		`CREATE TABLE IF NOT EXISTS app_settings (
			key   TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);`,
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
	r.db.Exec(`ALTER TABLE habits ADD COLUMN habit_type TEXT DEFAULT 'quantitative'`)

	return nil
}

func (r *SQLiteRepository) CreateHabit(ctx context.Context, name string, measureUnit string, tags []string, offset int, habitType string) (*models.Habit, error) {
	id := uuid.New().String()
	if tags == nil {
		tags = []string{}
	}
	tagsJSON, _ := json.Marshal(tags)

	query := `INSERT INTO habits (id, name, measure_unit, tags, day_start_offset, habit_type) VALUES (?, ?, ?, ?, ?, ?)`
	_, err := r.db.ExecContext(ctx, query, id, name, measureUnit, string(tagsJSON), offset, habitType)
	if err != nil {
		return nil, err
	}
	return &models.Habit{
		ID:             id,
		Name:           name,
		MeasureUnit:    measureUnit,
		HabitType:      habitType,
		Tags:           tags,
		DayStartOffset: offset,
		CreatedAt:      time.Now(),
	}, nil
}

func (r *SQLiteRepository) GetHabits(ctx context.Context, includeArchived bool) ([]*models.Habit, error) {
	query := `SELECT id, name, IFNULL(measure_unit, ''), IFNULL(tags, '[]'), day_start_offset, IFNULL(archived, 0), created_at, IFNULL(habit_type, 'quantitative') FROM habits`
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
		if err := rows.Scan(&h.ID, &h.Name, &h.MeasureUnit, &tagsStr, &h.DayStartOffset, &archived, &h.CreatedAt, &h.HabitType); err != nil {
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
	query := `SELECT id, name, IFNULL(measure_unit, ''), IFNULL(tags, '[]'), day_start_offset, IFNULL(archived, 0), created_at, IFNULL(habit_type, 'quantitative') FROM habits WHERE id = ?`
	h := &models.Habit{}
	var tagsStr string
	var archived int
	err := r.db.QueryRowContext(ctx, query, id).Scan(&h.ID, &h.Name, &h.MeasureUnit, &tagsStr, &h.DayStartOffset, &archived, &h.CreatedAt, &h.HabitType)
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

func (r *SQLiteRepository) UpdateHabit(ctx context.Context, id, name string, measureUnit string, tags []string, offset int, habitType string) error {
	tagsJSON, _ := json.Marshal(tags)
	if string(tagsJSON) == "null" {
		tagsJSON = []byte("[]")
	}

	query := `UPDATE habits SET name = ?, measure_unit = ?, tags = ?, day_start_offset = ?, habit_type = ? WHERE id = ?`
	result, err := r.db.ExecContext(ctx, query, name, measureUnit, string(tagsJSON), offset, habitType, id)
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

func (r *SQLiteRepository) CreateBPReading(ctx context.Context, systolic, diastolic int, notes string, recordedAt time.Time) (*models.BloodPressureReading, error) {
	id := uuid.New().String()
	query := `INSERT INTO blood_pressure_readings (id, systolic, diastolic, notes, recorded_at) VALUES (?, ?, ?, ?, ?)`
	_, err := r.db.ExecContext(ctx, query, id, systolic, diastolic, notes, recordedAt.UTC())
	if err != nil {
		return nil, err
	}
	return &models.BloodPressureReading{
		ID:         id,
		Systolic:   systolic,
		Diastolic:  diastolic,
		Notes:      notes,
		RecordedAt: recordedAt,
	}, nil
}

func (r *SQLiteRepository) ListBPReadings(ctx context.Context) ([]*models.BloodPressureReading, error) {
	query := `SELECT id, systolic, diastolic, IFNULL(notes, ''), recorded_at FROM blood_pressure_readings ORDER BY recorded_at DESC`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var readings []*models.BloodPressureReading
	for rows.Next() {
		bp := &models.BloodPressureReading{}
		if err := rows.Scan(&bp.ID, &bp.Systolic, &bp.Diastolic, &bp.Notes, &bp.RecordedAt); err != nil {
			return nil, err
		}
		readings = append(readings, bp)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if readings == nil {
		readings = []*models.BloodPressureReading{}
	}
	return readings, nil
}

func (r *SQLiteRepository) DeleteBPReading(ctx context.Context, id string) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM blood_pressure_readings WHERE id = ?`, id)
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

func (r *SQLiteRepository) CreateEloReading(ctx context.Context, platform string, rating int, notes string, recordedAt time.Time) (*models.EloReading, error) {
	id := uuid.New().String()
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO elo_readings (id, platform, rating, notes, recorded_at) VALUES (?, ?, ?, ?, ?)`,
		id, platform, rating, notes, recordedAt.UTC(),
	)
	if err != nil {
		return nil, err
	}
	return &models.EloReading{ID: id, Platform: platform, Rating: rating, Notes: notes, RecordedAt: recordedAt}, nil
}

func (r *SQLiteRepository) ListEloReadings(ctx context.Context) ([]*models.EloReading, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, platform, rating, IFNULL(notes, ''), recorded_at FROM elo_readings ORDER BY recorded_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var readings []*models.EloReading
	for rows.Next() {
		e := &models.EloReading{}
		if err := rows.Scan(&e.ID, &e.Platform, &e.Rating, &e.Notes, &e.RecordedAt); err != nil {
			return nil, err
		}
		readings = append(readings, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if readings == nil {
		readings = []*models.EloReading{}
	}
	return readings, nil
}

func (r *SQLiteRepository) DeleteEloReading(ctx context.Context, id string) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM elo_readings WHERE id = ?`, id)
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

func (r *SQLiteRepository) GetSetting(ctx context.Context, key string) (string, error) {
	var val string
	err := r.db.QueryRowContext(ctx, `SELECT value FROM app_settings WHERE key = ?`, key).Scan(&val)
	if err == sql.ErrNoRows {
		return "", ErrNotFound
	}
	return val, err
}

func (r *SQLiteRepository) SetSetting(ctx context.Context, key, value string) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		key, value,
	)
	return err
}

func (r *SQLiteRepository) CreateStepsReading(ctx context.Context, steps int, notes string, recordedAt time.Time) (*models.StepsReading, error) {
	id := uuid.New().String()
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO steps_readings (id, steps, notes, recorded_at) VALUES (?, ?, ?, ?)`,
		id, steps, notes, recordedAt.UTC(),
	)
	if err != nil {
		return nil, err
	}
	return &models.StepsReading{ID: id, Steps: steps, Notes: notes, RecordedAt: recordedAt}, nil
}

func (r *SQLiteRepository) ListStepsReadings(ctx context.Context) ([]*models.StepsReading, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, steps, IFNULL(notes, ''), recorded_at FROM steps_readings ORDER BY recorded_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var readings []*models.StepsReading
	for rows.Next() {
		s := &models.StepsReading{}
		if err := rows.Scan(&s.ID, &s.Steps, &s.Notes, &s.RecordedAt); err != nil {
			return nil, err
		}
		readings = append(readings, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if readings == nil {
		readings = []*models.StepsReading{}
	}
	return readings, nil
}

func (r *SQLiteRepository) DeleteStepsReading(ctx context.Context, id string) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM steps_readings WHERE id = ?`, id)
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

func (r *SQLiteRepository) CreateWeightReading(ctx context.Context, weight float64, notes string, recordedAt time.Time) (*models.WeightReading, error) {
	id := uuid.New().String()
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO weight_readings (id, weight, notes, recorded_at) VALUES (?, ?, ?, ?)`,
		id, weight, notes, recordedAt.UTC(),
	)
	if err != nil {
		return nil, err
	}
	return &models.WeightReading{ID: id, Weight: weight, Notes: notes, RecordedAt: recordedAt}, nil
}

func (r *SQLiteRepository) ListWeightReadings(ctx context.Context) ([]*models.WeightReading, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, weight, IFNULL(notes, ''), recorded_at FROM weight_readings ORDER BY recorded_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var readings []*models.WeightReading
	for rows.Next() {
		w := &models.WeightReading{}
		if err := rows.Scan(&w.ID, &w.Weight, &w.Notes, &w.RecordedAt); err != nil {
			return nil, err
		}
		readings = append(readings, w)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if readings == nil {
		readings = []*models.WeightReading{}
	}
	return readings, nil
}

func (r *SQLiteRepository) DeleteWeightReading(ctx context.Context, id string) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM weight_readings WHERE id = ?`, id)
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

func (r *SQLiteRepository) CreateCircumferenceReading(ctx context.Context, abdomen, biceps, quads float64, notes string, recordedAt time.Time) (*models.CircumferenceReading, error) {
	id := uuid.New().String()
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO circumference_readings (id, abdomen, biceps, quads, notes, recorded_at) VALUES (?, ?, ?, ?, ?, ?)`,
		id, abdomen, biceps, quads, notes, recordedAt.UTC(),
	)
	if err != nil {
		return nil, err
	}
	return &models.CircumferenceReading{ID: id, Abdomen: abdomen, Biceps: biceps, Quads: quads, Notes: notes, RecordedAt: recordedAt}, nil
}

func (r *SQLiteRepository) ListCircumferenceReadings(ctx context.Context) ([]*models.CircumferenceReading, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, abdomen, biceps, quads, IFNULL(notes, ''), recorded_at FROM circumference_readings ORDER BY recorded_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var readings []*models.CircumferenceReading
	for rows.Next() {
		c := &models.CircumferenceReading{}
		if err := rows.Scan(&c.ID, &c.Abdomen, &c.Biceps, &c.Quads, &c.Notes, &c.RecordedAt); err != nil {
			return nil, err
		}
		readings = append(readings, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if readings == nil {
		readings = []*models.CircumferenceReading{}
	}
	return readings, nil
}

func (r *SQLiteRepository) DeleteCircumferenceReading(ctx context.Context, id string) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM circumference_readings WHERE id = ?`, id)
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

func (r *SQLiteRepository) Close() error {
	return r.db.Close()
}
