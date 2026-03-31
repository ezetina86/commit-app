package service

import (
	"context"
	"testing"
	"time"

	"github.com/ezetina/commit/api/internal/models"
)

type mockHabitRepository struct {
	habits      []*models.Habit
	completions map[string][]models.CompletionData
}

func (m *mockHabitRepository) CreateHabit(ctx context.Context, name string, measureUnit string, tags []string, offset int, habitType string) (*models.Habit, error) {
	if len(m.habits) > 0 {
		return m.habits[0], nil
	}
	return &models.Habit{Name: name, MeasureUnit: measureUnit}, nil
}
func (m *mockHabitRepository) GetHabits(ctx context.Context, includeArchived bool) ([]*models.Habit, error) {
	return m.habits, nil
}
func (m *mockHabitRepository) GetHabitByID(ctx context.Context, id string) (*models.Habit, error) {
	for _, h := range m.habits {
		if h.ID == id {
			return h, nil
		}
	}
	return nil, nil
}
func (m *mockHabitRepository) GetCompletionsByHabitIDs(ctx context.Context, habitIDs []string) (map[string][]models.CompletionData, error) {
	result := make(map[string][]models.CompletionData, len(habitIDs))
	for _, id := range habitIDs {
		if comps, ok := m.completions[id]; ok {
			result[id] = comps
		}
	}
	return result, nil
}
func (m *mockHabitRepository) AddCompletion(ctx context.Context, habitID, date string, value int) error {
	return nil
}
func (m *mockHabitRepository) UpdateHabit(ctx context.Context, id, name string, measureUnit string, tags []string, offset int, habitType string) error {
	return nil
}
func (m *mockHabitRepository) DeleteHabit(ctx context.Context, id string) error {
	return nil
}
func (m *mockHabitRepository) ArchiveHabit(ctx context.Context, id string, archived bool) error {
	return nil
}

func TestGenerateInsights(t *testing.T) {
	today := time.Now().UTC().Format("2006-01-02")
	yesterday := time.Now().UTC().AddDate(0, 0, -1).Format("2006-01-02")
	oldDate := time.Now().UTC().AddDate(0, 0, -40).Format("2006-01-02")

	repo := &mockHabitRepository{
		habits: []*models.Habit{
			{ID: "1", Name: "Read", MeasureUnit: "pages"},
			{ID: "2", Name: "Run", MeasureUnit: ""},
			{ID: "3", Name: "No Data", MeasureUnit: ""},
		},
		completions: map[string][]models.CompletionData{
			"1": {
				{Date: today, Value: 10},
				{Date: yesterday, Value: 20},
				{Date: oldDate, Value: 50}, // Should be ignored by insights (older than 30 days)
			},
			"2": {
				{Date: today, Value: 1},
				{Date: yesterday, Value: 1},
			},
			"3": {},
		},
	}

	service := NewHabitService(repo)

	insights, err := service.GenerateInsights(context.Background())
	if err != nil {
		t.Fatalf("GenerateInsights failed: %v", err)
	}

	if len(insights) != 2 {
		t.Fatalf("Expected 2 insights, got %d", len(insights))
	}

	// Read has 30 pages total in last 30 days
	if insights[0].HabitName != "Read" || insights[0].Count != 30 {
		t.Errorf("Expected Read to have count 30, got %d", insights[0].Count)
	}

	// Run has 2 days total in last 30 days
	if insights[1].HabitName != "Run" || insights[1].Count != 2 {
		t.Errorf("Expected Run to have count 2, got %d", insights[1].Count)
	}
}

func TestListHabits(t *testing.T) {
	today := time.Now().UTC().Format("2006-01-02")

	repo := &mockHabitRepository{
		habits: []*models.Habit{
			{ID: "1", Name: "Read", MeasureUnit: "pages", DayStartOffset: 0},
		},
		completions: map[string][]models.CompletionData{
			"1": {
				{Date: today, Value: 10},
			},
		},
	}

	service := NewHabitService(repo)

	habits, err := service.ListHabits(context.Background(), false)
	if err != nil {
		t.Fatalf("ListHabits failed: %v", err)
	}

	if len(habits) != 1 {
		t.Fatalf("Expected 1 habit, got %d", len(habits))
	}

	if habits[0].CurrentStreak != 1 {
		t.Errorf("Expected streak 1, got %d", habits[0].CurrentStreak)
	}
}

func TestArchiveHabit(t *testing.T) {
	repo := &mockHabitRepository{
		habits:      []*models.Habit{{ID: "1", Name: "Read"}},
		completions: map[string][]models.CompletionData{},
	}
	svc := NewHabitService(repo)

	if err := svc.ArchiveHabit(context.Background(), "1", true); err != nil {
		t.Fatalf("ArchiveHabit(true) failed: %v", err)
	}

	if err := svc.ArchiveHabit(context.Background(), "1", false); err != nil {
		t.Fatalf("ArchiveHabit(false) failed: %v", err)
	}
}

func TestListHabitsWithArchived(t *testing.T) {
	today := time.Now().UTC().Format("2006-01-02")

	repo := &mockHabitRepository{
		habits: []*models.Habit{
			{ID: "1", Name: "Active", Archived: false},
			{ID: "2", Name: "Archived", Archived: true},
		},
		completions: map[string][]models.CompletionData{
			"1": {{Date: today, Value: 1}},
			"2": {{Date: today, Value: 1}},
		},
	}

	svc := NewHabitService(repo)

	all, err := svc.ListHabits(context.Background(), true)
	if err != nil {
		t.Fatalf("ListHabits(true) failed: %v", err)
	}
	if len(all) != 2 {
		t.Errorf("Expected 2 habits with archived, got %d", len(all))
	}

	active, err := svc.ListHabits(context.Background(), false)
	if err != nil {
		t.Fatalf("ListHabits(false) failed: %v", err)
	}
	// mock returns all habits regardless (filtering is done by the repository layer)
	if len(active) != 2 {
		t.Errorf("Expected 2 from mock (filtering at repo layer), got %d", len(active))
	}
}

func TestGenerateInsights_Boolean(t *testing.T) {
	today := time.Now().UTC().Format("2006-01-02")
	yesterday := time.Now().UTC().AddDate(0, 0, -1).Format("2006-01-02")

	repo := &mockHabitRepository{
		habits: []*models.Habit{
			{ID: "1", Name: "Medicine", MeasureUnit: "", HabitType: "boolean"},
		},
		completions: map[string][]models.CompletionData{
			"1": {
				{Date: today, Value: 2}, // two check-ins on same day (summed by repo)
				{Date: yesterday, Value: 1},
			},
		},
	}

	svc := NewHabitService(repo)
	insights, err := svc.GenerateInsights(context.Background())
	if err != nil {
		t.Fatalf("GenerateInsights failed: %v", err)
	}

	if len(insights) != 1 {
		t.Fatalf("Expected 1 insight, got %d", len(insights))
	}

	// Boolean habits use daysCount (2), not totalValue (3)
	if insights[0].Count != 2 {
		t.Errorf("Expected Count 2 (daysCount) for boolean habit, got %d", insights[0].Count)
	}
}
