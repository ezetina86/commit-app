package service

import (
	"context"
	"testing"

	"github.com/ezetina/commit/api/internal/models"
)

func TestCalculateStreak(t *testing.T) {
	s := &HabitService{}

	// Mock dates for today
	today := s.getCurrentDateWithOffset(0)
	yesterday := s.getYesterdayDateWithOffset(0)
	twoDaysAgo := s.getPreviousDate(yesterday)

	tests := []struct {
		name     string
		dates    []string // we will convert this to CompletionData in the test loop
		offset   int
		expected int
	}{
		{
			name:     "no completions",
			dates:    []string{},
			offset:   0,
			expected: 0,
		},
		{
			name:     "completed today only",
			dates:    []string{today},
			offset:   0,
			expected: 1,
		},
		{
			name:     "completed yesterday only",
			dates:    []string{yesterday},
			offset:   0,
			expected: 1,
		},
		{
			name:     "completed today and yesterday",
			dates:    []string{today, yesterday},
			offset:   0,
			expected: 2,
		},
		{
			name:     "completed today, yesterday, and 2 days ago",
			dates:    []string{today, yesterday, twoDaysAgo},
			offset:   0,
			expected: 3,
		},
		{
			name:     "gap between yesterday and 2 days ago",
			dates:    []string{today, yesterday, s.getPreviousDate(twoDaysAgo)},
			offset:   0,
			expected: 2,
		},
		{
			name:     "streak broken (only 2 days ago)",
			dates:    []string{twoDaysAgo},
			offset:   0,
			expected: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var completions []models.CompletionData
			for _, d := range tt.dates {
				completions = append(completions, models.CompletionData{Date: d, Value: 1})
			}

			got := s.calculateStreak(completions, tt.offset)
			if got != tt.expected {
				t.Errorf("calculateStreak() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestCreateHabit(t *testing.T) {
	repo := &mockHabitRepository{
		habits: []*models.Habit{{ID: "new", Name: "Run", MeasureUnit: "km"}},
	}
	svc := NewHabitService(repo)

	habit, err := svc.CreateHabit(context.Background(), "Run", "km", []string{"fitness"}, 0, "numeric")
	if err != nil {
		t.Fatalf("CreateHabit failed: %v", err)
	}
	if habit == nil {
		t.Fatal("CreateHabit returned nil habit")
	}
}

func TestUpdateHabit(t *testing.T) {
	repo := &mockHabitRepository{}
	svc := NewHabitService(repo)

	if err := svc.UpdateHabit(context.Background(), "1", "Run", "miles", []string{"fitness"}, 0, "numeric"); err != nil {
		t.Fatalf("UpdateHabit failed: %v", err)
	}
}

func TestDeleteHabit(t *testing.T) {
	repo := &mockHabitRepository{}
	svc := NewHabitService(repo)

	if err := svc.DeleteHabit(context.Background(), "1"); err != nil {
		t.Fatalf("DeleteHabit failed: %v", err)
	}
}

func TestCheckIn_WithDate(t *testing.T) {
	repo := &mockHabitRepository{}
	svc := NewHabitService(repo)

	if err := svc.CheckIn(context.Background(), "1", "2026-03-31", 5); err != nil {
		t.Fatalf("CheckIn with explicit date failed: %v", err)
	}
}

func TestCheckIn_WithoutDate(t *testing.T) {
	repo := &mockHabitRepository{
		habits: []*models.Habit{{ID: "1", Name: "Run", DayStartOffset: 0}},
	}
	svc := NewHabitService(repo)

	// Empty dateStr — service should look up the habit's offset and derive the date.
	if err := svc.CheckIn(context.Background(), "1", "", 1); err != nil {
		t.Fatalf("CheckIn without date failed: %v", err)
	}
}
