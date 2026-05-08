package repository

import (
	"context"
	"errors"
	"testing"
	"time"
)

// newTestRepo creates an in-memory SQLite repository for testing.
func newTestRepo(t *testing.T) *SQLiteRepository {
	t.Helper()
	repo, err := NewSQLiteRepository(":memory:")
	if err != nil {
		t.Fatalf("failed to create test repository: %v", err)
	}
	t.Cleanup(func() { repo.Close() })
	return repo
}

func TestNewSQLiteRepository(t *testing.T) {
	repo := newTestRepo(t)
	if repo == nil {
		t.Fatal("expected non-nil repository")
	}
}

func TestCreateAndGetHabit(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()

	habit, err := repo.CreateHabit(ctx, "Exercise", "reps", []string{"health", "fitness"}, 0, "quantitative")
	if err != nil {
		t.Fatalf("CreateHabit: %v", err)
	}
	if habit.ID == "" {
		t.Error("expected non-empty habit ID")
	}
	if habit.Name != "Exercise" {
		t.Errorf("got name %q, want %q", habit.Name, "Exercise")
	}

	habits, err := repo.GetHabits(ctx, false)
	if err != nil {
		t.Fatalf("GetHabits: %v", err)
	}
	if len(habits) != 1 {
		t.Fatalf("expected 1 habit, got %d", len(habits))
	}
	if habits[0].Name != "Exercise" {
		t.Errorf("got name %q, want %q", habits[0].Name, "Exercise")
	}
	if len(habits[0].Tags) != 2 {
		t.Errorf("expected 2 tags, got %d", len(habits[0].Tags))
	}
}

func TestCreateHabit_NilTags(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()

	habit, err := repo.CreateHabit(ctx, "Meditate", "", nil, 0, "quantitative")
	if err != nil {
		t.Fatalf("CreateHabit with nil tags: %v", err)
	}
	if habit.Tags == nil {
		t.Error("expected non-nil tags slice, got nil")
	}
}

func TestGetHabitByID(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()

	created, err := repo.CreateHabit(ctx, "Read", "pages", []string{"learning"}, 30, "quantitative")
	if err != nil {
		t.Fatalf("CreateHabit: %v", err)
	}

	fetched, err := repo.GetHabitByID(ctx, created.ID)
	if err != nil {
		t.Fatalf("GetHabitByID: %v", err)
	}
	if fetched.ID != created.ID {
		t.Errorf("ID mismatch: got %q, want %q", fetched.ID, created.ID)
	}
	if fetched.DayStartOffset != 30 {
		t.Errorf("DayStartOffset: got %d, want 30", fetched.DayStartOffset)
	}
}

func TestGetCompletionsByHabitIDs_Batch(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()

	h1, _ := repo.CreateHabit(ctx, "Run", "km", nil, 0, "quantitative")
	h2, _ := repo.CreateHabit(ctx, "Read", "pages", nil, 0, "quantitative")

	today := time.Now().UTC().Format("2006-01-02")
	yesterday := time.Now().UTC().AddDate(0, 0, -1).Format("2006-01-02")

	repo.AddCompletion(ctx, h1.ID, today, 5)
	repo.AddCompletion(ctx, h1.ID, yesterday, 3)
	repo.AddCompletion(ctx, h2.ID, today, 10)

	result, err := repo.GetCompletionsByHabitIDs(ctx, []string{h1.ID, h2.ID})
	if err != nil {
		t.Fatalf("GetCompletionsByHabitIDs: %v", err)
	}

	if len(result[h1.ID]) != 2 {
		t.Errorf("habit1: expected 2 completion days, got %d", len(result[h1.ID]))
	}
	if len(result[h2.ID]) != 1 {
		t.Errorf("habit2: expected 1 completion day, got %d", len(result[h2.ID]))
	}
}

func TestGetCompletionsByHabitIDs_Empty(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()

	result, err := repo.GetCompletionsByHabitIDs(ctx, []string{})
	if err != nil {
		t.Fatalf("GetCompletionsByHabitIDs with empty IDs: %v", err)
	}
	if len(result) != 0 {
		t.Errorf("expected empty map, got %d entries", len(result))
	}
}

func TestGetCompletionsByHabitIDs_SumsMultipleCheckinsPerDay(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()

	h, _ := repo.CreateHabit(ctx, "Walk", "steps", nil, 0, "quantitative")
	today := time.Now().UTC().Format("2006-01-02")

	repo.AddCompletion(ctx, h.ID, today, 3000)
	repo.AddCompletion(ctx, h.ID, today, 5000)

	result, err := repo.GetCompletionsByHabitIDs(ctx, []string{h.ID})
	if err != nil {
		t.Fatalf("GetCompletionsByHabitIDs: %v", err)
	}
	comps := result[h.ID]
	if len(comps) != 1 {
		t.Fatalf("expected 1 grouped day, got %d", len(comps))
	}
	if comps[0].Value != 8000 {
		t.Errorf("expected summed value 8000, got %d", comps[0].Value)
	}
}

func TestUpdateHabit(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()

	h, _ := repo.CreateHabit(ctx, "Old", "", nil, 0, "quantitative")

	if err := repo.UpdateHabit(ctx, h.ID, "New", "reps", []string{"tag"}, 60, "quantitative"); err != nil {
		t.Fatalf("UpdateHabit: %v", err)
	}

	fetched, _ := repo.GetHabitByID(ctx, h.ID)
	if fetched.Name != "New" {
		t.Errorf("expected name %q, got %q", "New", fetched.Name)
	}
	if fetched.MeasureUnit != "reps" {
		t.Errorf("expected unit %q, got %q", "reps", fetched.MeasureUnit)
	}
}

func TestUpdateHabit_NotFound(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()

	err := repo.UpdateHabit(ctx, "non-existent-id", "X", "", nil, 0, "quantitative")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestDeleteHabit(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()

	h, _ := repo.CreateHabit(ctx, "Temp", "", nil, 0, "quantitative")
	today := time.Now().UTC().Format("2006-01-02")
	repo.AddCompletion(ctx, h.ID, today, 1)

	if err := repo.DeleteHabit(ctx, h.ID); err != nil {
		t.Fatalf("DeleteHabit: %v", err)
	}

	habits, _ := repo.GetHabits(ctx, false)
	if len(habits) != 0 {
		t.Errorf("expected 0 habits after delete, got %d", len(habits))
	}

	// Completions should also be deleted
	result, _ := repo.GetCompletionsByHabitIDs(ctx, []string{h.ID})
	if len(result[h.ID]) != 0 {
		t.Errorf("expected completions to be deleted, got %d", len(result[h.ID]))
	}
}

func TestDeleteHabit_NotFound(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()

	err := repo.DeleteHabit(ctx, "non-existent-id")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestArchiveHabit(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()

	h, _ := repo.CreateHabit(ctx, "Habit", "", nil, 0, "quantitative")

	if err := repo.ArchiveHabit(ctx, h.ID, true); err != nil {
		t.Fatalf("ArchiveHabit(true): %v", err)
	}

	// Should be hidden from default list
	active, _ := repo.GetHabits(ctx, false)
	if len(active) != 0 {
		t.Errorf("expected 0 active habits, got %d", len(active))
	}

	// Should appear with includeArchived=true
	all, _ := repo.GetHabits(ctx, true)
	if len(all) != 1 {
		t.Fatalf("expected 1 total habit, got %d", len(all))
	}
	if !all[0].Archived {
		t.Error("expected habit to be archived")
	}

	// Unarchive
	if err := repo.ArchiveHabit(ctx, h.ID, false); err != nil {
		t.Fatalf("ArchiveHabit(false): %v", err)
	}
	active, _ = repo.GetHabits(ctx, false)
	if len(active) != 1 {
		t.Errorf("expected 1 active habit after unarchive, got %d", len(active))
	}
}

func TestArchiveHabit_NotFound(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()

	err := repo.ArchiveHabit(ctx, "non-existent-id", true)
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestCreateHabit_Boolean(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()

	habit, err := repo.CreateHabit(ctx, "Medicine", "", nil, 0, "boolean")
	if err != nil {
		t.Fatalf("CreateHabit boolean: %v", err)
	}
	if habit.HabitType != "boolean" {
		t.Errorf("expected habit_type 'boolean', got %q", habit.HabitType)
	}

	habits, err := repo.GetHabits(ctx, false)
	if err != nil {
		t.Fatalf("GetHabits: %v", err)
	}
	if len(habits) != 1 {
		t.Fatalf("expected 1 habit, got %d", len(habits))
	}
	if habits[0].HabitType != "boolean" {
		t.Errorf("GetHabits: expected habit_type 'boolean', got %q", habits[0].HabitType)
	}
}

func TestCreateHabit_DefaultQuantitative(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()

	habit, err := repo.CreateHabit(ctx, "Read", "pages", nil, 0, "quantitative")
	if err != nil {
		t.Fatalf("CreateHabit: %v", err)
	}
	if habit.HabitType != "quantitative" {
		t.Errorf("expected habit_type 'quantitative', got %q", habit.HabitType)
	}

	fetched, err := repo.GetHabitByID(ctx, habit.ID)
	if err != nil {
		t.Fatalf("GetHabitByID: %v", err)
	}
	if fetched.HabitType != "quantitative" {
		t.Errorf("GetHabitByID: expected habit_type 'quantitative', got %q", fetched.HabitType)
	}
}

func TestUpdateHabit_Boolean(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()

	h, _ := repo.CreateHabit(ctx, "Sleep", "", nil, 0, "quantitative")

	if err := repo.UpdateHabit(ctx, h.ID, "Sleep", "", nil, 0, "boolean"); err != nil {
		t.Fatalf("UpdateHabit to boolean: %v", err)
	}

	fetched, err := repo.GetHabitByID(ctx, h.ID)
	if err != nil {
		t.Fatalf("GetHabitByID: %v", err)
	}
	if fetched.HabitType != "boolean" {
		t.Errorf("expected habit_type 'boolean' after update, got %q", fetched.HabitType)
	}
}

// ── Blood Pressure ────────────────────────────────────────────────────────────

func TestCreateAndListBPReadings(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()
	now := time.Now().UTC()

	bp, err := repo.CreateBPReading(ctx, 120, 80, "resting", now)
	if err != nil {
		t.Fatalf("CreateBPReading: %v", err)
	}
	if bp.ID == "" {
		t.Error("expected non-empty ID")
	}
	if bp.Systolic != 120 || bp.Diastolic != 80 {
		t.Errorf("got %d/%d, want 120/80", bp.Systolic, bp.Diastolic)
	}

	list, err := repo.ListBPReadings(ctx)
	if err != nil {
		t.Fatalf("ListBPReadings: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 reading, got %d", len(list))
	}
	if list[0].Notes != "resting" {
		t.Errorf("expected notes %q, got %q", "resting", list[0].Notes)
	}
}

func TestListBPReadings_Empty(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()

	list, err := repo.ListBPReadings(ctx)
	if err != nil {
		t.Fatalf("ListBPReadings empty: %v", err)
	}
	if list == nil {
		t.Error("expected non-nil empty slice")
	}
	if len(list) != 0 {
		t.Errorf("expected 0 readings, got %d", len(list))
	}
}

func TestDeleteBPReading(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()
	now := time.Now().UTC()

	bp, _ := repo.CreateBPReading(ctx, 130, 85, "", now)

	if err := repo.DeleteBPReading(ctx, bp.ID); err != nil {
		t.Fatalf("DeleteBPReading: %v", err)
	}

	list, _ := repo.ListBPReadings(ctx)
	if len(list) != 0 {
		t.Errorf("expected 0 readings after delete, got %d", len(list))
	}
}

func TestDeleteBPReading_NotFound(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()

	err := repo.DeleteBPReading(ctx, "non-existent-id")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

// ── ELO readings ─────────────────────────────────────────────────────────────

func TestCreateAndListEloReadings(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()
	now := time.Now().UTC()

	r, err := repo.CreateEloReading(ctx, "chesscom", 750, "after tournament", now)
	if err != nil {
		t.Fatalf("CreateEloReading: %v", err)
	}
	if r.ID == "" {
		t.Error("expected non-empty ID")
	}
	if r.Platform != "chesscom" {
		t.Errorf("got platform %q, want %q", r.Platform, "chesscom")
	}
	if r.Rating != 750 {
		t.Errorf("got rating %d, want 750", r.Rating)
	}

	list, err := repo.ListEloReadings(ctx)
	if err != nil {
		t.Fatalf("ListEloReadings: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 reading, got %d", len(list))
	}
	if list[0].Notes != "after tournament" {
		t.Errorf("notes: got %q, want %q", list[0].Notes, "after tournament")
	}
}

func TestListEloReadings_Empty(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()

	list, err := repo.ListEloReadings(ctx)
	if err != nil {
		t.Fatalf("ListEloReadings empty: %v", err)
	}
	if list == nil {
		t.Error("expected non-nil empty slice")
	}
	if len(list) != 0 {
		t.Errorf("expected 0 readings, got %d", len(list))
	}
}

func TestListEloReadings_MultiPlatform(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()
	now := time.Now().UTC()

	repo.CreateEloReading(ctx, "chesscom", 700, "", now)
	repo.CreateEloReading(ctx, "duolingo", 650, "", now.Add(time.Second))

	list, err := repo.ListEloReadings(ctx)
	if err != nil {
		t.Fatalf("ListEloReadings: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("expected 2 readings, got %d", len(list))
	}
	// Newest first
	if list[0].Platform != "duolingo" {
		t.Errorf("expected newest first (duolingo), got %q", list[0].Platform)
	}
}

func TestDeleteEloReading(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()
	now := time.Now().UTC()

	r, _ := repo.CreateEloReading(ctx, "chesscom", 720, "", now)

	if err := repo.DeleteEloReading(ctx, r.ID); err != nil {
		t.Fatalf("DeleteEloReading: %v", err)
	}

	list, _ := repo.ListEloReadings(ctx)
	if len(list) != 0 {
		t.Errorf("expected 0 readings after delete, got %d", len(list))
	}
}

func TestDeleteEloReading_NotFound(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()

	err := repo.DeleteEloReading(ctx, "non-existent-id")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

// ── Settings ──────────────────────────────────────────────────────────────────

func TestGetSetting_NotFound(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()

	_, err := repo.GetSetting(ctx, "missing_key")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestSetAndGetSetting(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()

	if err := repo.SetSetting(ctx, "elo_target", "800"); err != nil {
		t.Fatalf("SetSetting: %v", err)
	}

	val, err := repo.GetSetting(ctx, "elo_target")
	if err != nil {
		t.Fatalf("GetSetting: %v", err)
	}
	if val != "800" {
		t.Errorf("got %q, want %q", val, "800")
	}
}

func TestSetSetting_Upsert(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()

	repo.SetSetting(ctx, "elo_target", "800")
	repo.SetSetting(ctx, "elo_target", "1200")

	val, _ := repo.GetSetting(ctx, "elo_target")
	if val != "1200" {
		t.Errorf("got %q, want %q after upsert", val, "1200")
	}
}
