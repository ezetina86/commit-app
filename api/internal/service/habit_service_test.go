package service

import (
	"context"
	"testing"
	"time"

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

func TestCreateBPReading(t *testing.T) {
	repo := &mockHabitRepository{}
	svc := NewHabitService(repo)

	now := time.Now().UTC()
	bp, err := svc.CreateBPReading(context.Background(), 120, 80, "after exercise", now)
	if err != nil {
		t.Fatalf("CreateBPReading failed: %v", err)
	}
	if bp == nil {
		t.Fatal("CreateBPReading returned nil")
	}
	if bp.Systolic != 120 {
		t.Errorf("expected systolic 120, got %d", bp.Systolic)
	}
	if bp.Diastolic != 80 {
		t.Errorf("expected diastolic 80, got %d", bp.Diastolic)
	}
	if bp.Notes != "after exercise" {
		t.Errorf("expected notes 'after exercise', got %q", bp.Notes)
	}
}

func TestListBPReadings(t *testing.T) {
	now := time.Now().UTC()
	repo := &mockHabitRepository{
		bpReadings: []*models.BloodPressureReading{
			{ID: "1", Systolic: 120, Diastolic: 80, Notes: "", RecordedAt: now},
			{ID: "2", Systolic: 130, Diastolic: 85, Notes: "stressed", RecordedAt: now.Add(-time.Hour)},
		},
	}
	svc := NewHabitService(repo)

	readings, err := svc.ListBPReadings(context.Background())
	if err != nil {
		t.Fatalf("ListBPReadings failed: %v", err)
	}
	if len(readings) != 2 {
		t.Errorf("expected 2 readings, got %d", len(readings))
	}
}

func TestDeleteBPReading_Exists(t *testing.T) {
	now := time.Now().UTC()
	repo := &mockHabitRepository{
		bpReadings: []*models.BloodPressureReading{
			{ID: "bp-1", Systolic: 120, Diastolic: 80, RecordedAt: now},
		},
	}
	svc := NewHabitService(repo)

	if err := svc.DeleteBPReading(context.Background(), "bp-1"); err != nil {
		t.Fatalf("DeleteBPReading failed: %v", err)
	}
	readings, _ := svc.ListBPReadings(context.Background())
	if len(readings) != 0 {
		t.Errorf("expected 0 readings after delete, got %d", len(readings))
	}
}

func TestDeleteBPReading_NotFound(t *testing.T) {
	repo := &mockHabitRepository{}
	svc := NewHabitService(repo)

	err := svc.DeleteBPReading(context.Background(), "nonexistent")
	if err == nil {
		t.Fatal("expected error for missing reading, got nil")
	}
}

func TestCreateWeightReading(t *testing.T) {
	repo := &mockHabitRepository{}
	svc := NewHabitService(repo)

	now := time.Now().UTC()
	r, err := svc.CreateWeightReading(context.Background(), 185.5, "morning", now)
	if err != nil {
		t.Fatalf("CreateWeightReading failed: %v", err)
	}
	if r == nil {
		t.Fatal("CreateWeightReading returned nil")
	}
	if r.Weight != 185.5 {
		t.Errorf("expected weight 185.5, got %v", r.Weight)
	}
	if r.Notes != "morning" {
		t.Errorf("expected notes 'morning', got %q", r.Notes)
	}
}

func TestListWeightReadings(t *testing.T) {
	now := time.Now().UTC()
	repo := &mockHabitRepository{
		weightReadings: []*models.WeightReading{
			{ID: "w1", Weight: 185.5, RecordedAt: now},
			{ID: "w2", Weight: 184.0, RecordedAt: now.Add(-24 * time.Hour)},
		},
	}
	svc := NewHabitService(repo)

	readings, err := svc.ListWeightReadings(context.Background())
	if err != nil {
		t.Fatalf("ListWeightReadings failed: %v", err)
	}
	if len(readings) != 2 {
		t.Errorf("expected 2 readings, got %d", len(readings))
	}
}

func TestDeleteWeightReading_Exists(t *testing.T) {
	now := time.Now().UTC()
	repo := &mockHabitRepository{
		weightReadings: []*models.WeightReading{
			{ID: "w-1", Weight: 185.5, RecordedAt: now},
		},
	}
	svc := NewHabitService(repo)

	if err := svc.DeleteWeightReading(context.Background(), "w-1"); err != nil {
		t.Fatalf("DeleteWeightReading failed: %v", err)
	}
	readings, _ := svc.ListWeightReadings(context.Background())
	if len(readings) != 0 {
		t.Errorf("expected 0 readings after delete, got %d", len(readings))
	}
}

func TestDeleteWeightReading_NotFound(t *testing.T) {
	repo := &mockHabitRepository{}
	svc := NewHabitService(repo)

	err := svc.DeleteWeightReading(context.Background(), "nonexistent")
	if err == nil {
		t.Fatal("expected error for missing reading, got nil")
	}
}

func TestCreateCircumferenceReading(t *testing.T) {
	repo := &mockHabitRepository{}
	svc := NewHabitService(repo)

	now := time.Now().UTC()
	r, err := svc.CreateCircumferenceReading(context.Background(), 36.5, 14.0, 22.0, "post-workout", now)
	if err != nil {
		t.Fatalf("CreateCircumferenceReading failed: %v", err)
	}
	if r == nil {
		t.Fatal("CreateCircumferenceReading returned nil")
	}
	if r.Abdomen != 36.5 {
		t.Errorf("expected abdomen 36.5, got %v", r.Abdomen)
	}
	if r.Biceps != 14.0 {
		t.Errorf("expected biceps 14.0, got %v", r.Biceps)
	}
	if r.Quads != 22.0 {
		t.Errorf("expected quads 22.0, got %v", r.Quads)
	}
}

func TestListCircumferenceReadings(t *testing.T) {
	now := time.Now().UTC()
	repo := &mockHabitRepository{
		circumferenceReadings: []*models.CircumferenceReading{
			{ID: "c1", Abdomen: 36.5, Biceps: 14.0, Quads: 22.0, RecordedAt: now},
			{ID: "c2", Abdomen: 35.0, Biceps: 14.2, Quads: 22.5, RecordedAt: now.Add(-24 * time.Hour)},
		},
	}
	svc := NewHabitService(repo)

	readings, err := svc.ListCircumferenceReadings(context.Background())
	if err != nil {
		t.Fatalf("ListCircumferenceReadings failed: %v", err)
	}
	if len(readings) != 2 {
		t.Errorf("expected 2 readings, got %d", len(readings))
	}
}

func TestDeleteCircumferenceReading_Exists(t *testing.T) {
	now := time.Now().UTC()
	repo := &mockHabitRepository{
		circumferenceReadings: []*models.CircumferenceReading{
			{ID: "c-1", Abdomen: 36.5, Biceps: 14.0, Quads: 22.0, RecordedAt: now},
		},
	}
	svc := NewHabitService(repo)

	if err := svc.DeleteCircumferenceReading(context.Background(), "c-1"); err != nil {
		t.Fatalf("DeleteCircumferenceReading failed: %v", err)
	}
	readings, _ := svc.ListCircumferenceReadings(context.Background())
	if len(readings) != 0 {
		t.Errorf("expected 0 readings after delete, got %d", len(readings))
	}
}

func TestDeleteCircumferenceReading_NotFound(t *testing.T) {
	repo := &mockHabitRepository{}
	svc := NewHabitService(repo)

	err := svc.DeleteCircumferenceReading(context.Background(), "nonexistent")
	if err == nil {
		t.Fatal("expected error for missing reading, got nil")
	}
}
