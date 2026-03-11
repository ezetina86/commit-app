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

func (m *mockHabitRepository) CreateHabit(ctx context.Context, name string, measureUnit string, tags []string, offset int) (*models.Habit, error) {
	return nil, nil
}
func (m *mockHabitRepository) GetHabits(ctx context.Context) ([]*models.Habit, error) {
	return m.habits, nil
}
func (m *mockHabitRepository) GetHabitByID(ctx context.Context, id string) (*models.Habit, error) {
	return nil, nil
}
func (m *mockHabitRepository) GetCompletionsForHabit(ctx context.Context, habitID string) ([]models.CompletionData, error) {
	return m.completions[habitID], nil
}
func (m *mockHabitRepository) AddCompletion(ctx context.Context, habitID, date string, value int) error {
	return nil
}
func (m *mockHabitRepository) UpdateHabit(ctx context.Context, id, name string, measureUnit string, tags []string, offset int) error {
	return nil
}
func (m *mockHabitRepository) DeleteHabit(ctx context.Context, id string) error {
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

	habits, err := service.ListHabits(context.Background())
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
