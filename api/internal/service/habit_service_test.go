package service

import (
	"github.com/ezetina/commit/api/internal/models"
	"testing"
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
