package models

import (
	"time"
)

type CompletionData struct {
	Date  string `json:"date"`
	Value int    `json:"value"`
}

type Habit struct {
	ID             string           `json:"id"`
	Name           string           `json:"name"`
	MeasureUnit    string           `json:"measure_unit"`
	HabitType      string           `json:"habit_type"` // 'quantitative' or 'boolean'
	DayStartOffset int              `json:"day_start_offset"` // Minutes from midnight
	Tags           []string         `json:"tags"`
	Archived       bool             `json:"archived"`
	CreatedAt      time.Time        `json:"created_at"`
	CurrentStreak  int              `json:"current_streak"`
	Completions    []CompletionData `json:"completions"`
}

