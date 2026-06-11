package service

import (
	"context"
	"fmt"
	"github.com/ezetina/commit/api/internal/models"
	"time"
)

type HabitRepository interface {
	CreateHabit(ctx context.Context, name string, measureUnit string, tags []string, offset int, habitType string) (*models.Habit, error)
	GetHabits(ctx context.Context, includeArchived bool) ([]*models.Habit, error)
	GetHabitByID(ctx context.Context, id string) (*models.Habit, error)
	// GetCompletionsByHabitIDs fetches completions for all given IDs in one query.
	GetCompletionsByHabitIDs(ctx context.Context, habitIDs []string) (map[string][]models.CompletionData, error)
	AddCompletion(ctx context.Context, habitID, date string, value int) error
	UpdateHabit(ctx context.Context, id, name string, measureUnit string, tags []string, offset int, habitType string) error
	DeleteHabit(ctx context.Context, id string) error
	ArchiveHabit(ctx context.Context, id string, archived bool) error
	CreateBPReading(ctx context.Context, systolic, diastolic int, notes string, recordedAt time.Time) (*models.BloodPressureReading, error)
	ListBPReadings(ctx context.Context) ([]*models.BloodPressureReading, error)
	DeleteBPReading(ctx context.Context, id string) error
	CreateEloReading(ctx context.Context, platform string, rating int, notes string, recordedAt time.Time) (*models.EloReading, error)
	ListEloReadings(ctx context.Context) ([]*models.EloReading, error)
	DeleteEloReading(ctx context.Context, id string) error
	CreateStepsReading(ctx context.Context, steps int, notes string, recordedAt time.Time) (*models.StepsReading, error)
	ListStepsReadings(ctx context.Context) ([]*models.StepsReading, error)
	DeleteStepsReading(ctx context.Context, id string) error
	GetSetting(ctx context.Context, key string) (string, error)
	SetSetting(ctx context.Context, key, value string) error
}

type HabitService struct {
	repo HabitRepository
}

type Insight struct {
	HabitID   string `json:"habit_id"`
	HabitName string `json:"habit_name"`
	Message   string `json:"message"`
	Count     int    `json:"count"`
}

func NewHabitService(repo HabitRepository) *HabitService {
	return &HabitService{repo: repo}
}

func (s *HabitService) GenerateInsights(ctx context.Context) ([]Insight, error) {
	habits, err := s.ListHabits(ctx, false)
	if err != nil {
		return nil, err
	}

	var insights []Insight
	thirtyDaysAgo := time.Now().UTC().AddDate(0, 0, -30).Format("2006-01-02")

	names := []string{"Enrique", "Henry", "Pal", "Buddy", "Chief", "Mate", "Boss"}

	// Dynamic templates
	templatesUnit := []string{
		"Yo %s! You crushed %d %s of '%s' recently! %s",
		"Hey %s, looking good! You logged %d %s of '%s'. %s",
		"%s, you're on fire! '%s' got %d %s done. %s",
		"Incredible focus, %s! %d %s tracked for '%s'. %s",
	}

	templatesNoUnit := []string{
		"Yo %s! You crushed '%s' %d times recently! %s",
		"Hey %s, looking good! You logged %d days of '%s'. %s",
		"%s, you're on fire! '%s' got done %d times. %s",
		"Incredible focus, %s! %d check-ins for '%s'. %s",
	}

	encouragements := []string{
		"Amazing job!",
		"Well done!",
		"Keep that momentum going!",
		"Solid effort!",
		"Great consistency!",
		"You're absolutely crushing it!",
		"That's exactly how you build a lifelong habit!",
		"Superb work, keep stacking those wins!",
		"Stay locked in!",
		"Unstoppable.",
	}

	for i, h := range habits {
		totalValue := 0
		daysCount := 0
		for _, comp := range h.Completions {
			if comp.Date >= thirtyDaysAgo {
				totalValue += comp.Value
				daysCount++
			}
		}

		if daysCount > 0 {
			name := names[i%len(names)]
			phrase := encouragements[i%len(encouragements)]

			count := totalValue
			if h.HabitType == "boolean" {
				count = daysCount
			}

			var message string
			if h.MeasureUnit != "" && h.HabitType != "boolean" {
				// use unit templates
				tpl := templatesUnit[i%len(templatesUnit)]
				switch i % len(templatesUnit) {
				case 1, 3: // name, count, unit, habit, phrase
					message = fmt.Sprintf(tpl, name, totalValue, h.MeasureUnit, h.Name, phrase)
				case 2: // name, habit, count, unit, phrase
					message = fmt.Sprintf(tpl, name, h.Name, totalValue, h.MeasureUnit, phrase)
				default: // name, count, unit, habit, phrase
					message = fmt.Sprintf(tpl, name, totalValue, h.MeasureUnit, h.Name, phrase)
				}
			} else {
				// use no-unit templates
				tpl := templatesNoUnit[i%len(templatesNoUnit)]
				switch i % len(templatesNoUnit) {
				case 1, 3: // name, count, habit, phrase
					message = fmt.Sprintf(tpl, name, daysCount, h.Name, phrase)
				default: // name, habit, count, phrase
					message = fmt.Sprintf(tpl, name, h.Name, daysCount, phrase)
				}
			}

			insights = append(insights, Insight{
				HabitID:   h.ID,
				HabitName: h.Name,
				Count:     count,
				Message:   message,
			})
		}
	}

	return insights, nil
}

func (s *HabitService) CreateHabit(ctx context.Context, name string, measureUnit string, tags []string, offset int, habitType string) (*models.Habit, error) {
	return s.repo.CreateHabit(ctx, name, measureUnit, tags, offset, habitType)
}

func (s *HabitService) UpdateHabit(ctx context.Context, id, name string, measureUnit string, tags []string, offset int, habitType string) error {
	return s.repo.UpdateHabit(ctx, id, name, measureUnit, tags, offset, habitType)
}

func (s *HabitService) DeleteHabit(ctx context.Context, id string) error {
	return s.repo.DeleteHabit(ctx, id)
}

func (s *HabitService) ArchiveHabit(ctx context.Context, id string, archived bool) error {
	return s.repo.ArchiveHabit(ctx, id, archived)
}

func (s *HabitService) ListHabits(ctx context.Context, includeArchived bool) ([]*models.Habit, error) {
	habits, err := s.repo.GetHabits(ctx, includeArchived)
	if err != nil {
		return nil, err
	}
	if len(habits) == 0 {
		return habits, nil
	}

	// Collect all habit IDs and fetch completions in one query (eliminates N+1).
	ids := make([]string, len(habits))
	for i, h := range habits {
		ids[i] = h.ID
	}
	completionsMap, err := s.repo.GetCompletionsByHabitIDs(ctx, ids)
	if err != nil {
		return nil, err
	}

	for _, h := range habits {
		comps := completionsMap[h.ID]
		if comps == nil {
			comps = []models.CompletionData{}
		}
		h.Completions = comps
		h.CurrentStreak = s.calculateStreak(comps, h.DayStartOffset)
	}

	return habits, nil
}

func (s *HabitService) CreateBPReading(ctx context.Context, systolic, diastolic int, notes string, recordedAt time.Time) (*models.BloodPressureReading, error) {
	return s.repo.CreateBPReading(ctx, systolic, diastolic, notes, recordedAt)
}

func (s *HabitService) ListBPReadings(ctx context.Context) ([]*models.BloodPressureReading, error) {
	return s.repo.ListBPReadings(ctx)
}

func (s *HabitService) DeleteBPReading(ctx context.Context, id string) error {
	return s.repo.DeleteBPReading(ctx, id)
}

func (s *HabitService) CreateEloReading(ctx context.Context, platform string, rating int, notes string, recordedAt time.Time) (*models.EloReading, error) {
	return s.repo.CreateEloReading(ctx, platform, rating, notes, recordedAt)
}

func (s *HabitService) ListEloReadings(ctx context.Context) ([]*models.EloReading, error) {
	return s.repo.ListEloReadings(ctx)
}

func (s *HabitService) DeleteEloReading(ctx context.Context, id string) error {
	return s.repo.DeleteEloReading(ctx, id)
}

func (s *HabitService) CreateStepsReading(ctx context.Context, steps int, notes string, recordedAt time.Time) (*models.StepsReading, error) {
	return s.repo.CreateStepsReading(ctx, steps, notes, recordedAt)
}

func (s *HabitService) ListStepsReadings(ctx context.Context) ([]*models.StepsReading, error) {
	return s.repo.ListStepsReadings(ctx)
}

func (s *HabitService) DeleteStepsReading(ctx context.Context, id string) error {
	return s.repo.DeleteStepsReading(ctx, id)
}

func (s *HabitService) GetSetting(ctx context.Context, key string) (string, error) {
	return s.repo.GetSetting(ctx, key)
}

func (s *HabitService) SetSetting(ctx context.Context, key, value string) error {
	return s.repo.SetSetting(ctx, key, value)
}

func (s *HabitService) CheckIn(ctx context.Context, habitID string, dateStr string, value int) error {
	// If dateStr is empty, use current date according to offset
	if dateStr == "" {
		habit, err := s.repo.GetHabitByID(ctx, habitID)
		if err != nil {
			return err
		}
		dateStr = s.getCurrentDateWithOffset(habit.DayStartOffset)
	}
	return s.repo.AddCompletion(ctx, habitID, dateStr, value)
}

func (s *HabitService) calculateStreak(completions []models.CompletionData, offset int) int {
	if len(completions) == 0 {
		return 0
	}

	todayStr := s.getCurrentDateWithOffset(offset)
	yesterdayStr := s.getYesterdayDateWithOffset(offset)

	streak := 0

	// Need to check if the last completion was today or yesterday to even start a streak
	foundLatest := false
	for _, c := range completions {
		if c.Date == todayStr || c.Date == yesterdayStr {
			foundLatest = true
			break
		}
	}

	if !foundLatest {
		return 0
	}

	// Simple streak logic for sorted dates (descending)
	dateMap := make(map[string]bool)
	for _, c := range completions {
		dateMap[c.Date] = true
	}

	curr := todayStr
	if !dateMap[curr] {
		curr = yesterdayStr
	}

	for curr != "" && dateMap[curr] {
		streak++
		curr = s.getPreviousDate(curr)
	}

	return streak
}

func (s *HabitService) getCurrentDateWithOffset(offsetMinutes int) string {
	now := time.Now().UTC()
	adjusted := now.Add(time.Duration(-offsetMinutes) * time.Minute)
	return adjusted.Format("2006-01-02")
}

func (s *HabitService) getYesterdayDateWithOffset(offsetMinutes int) string {
	now := time.Now().UTC()
	adjusted := now.Add(time.Duration(-offsetMinutes)*time.Minute).AddDate(0, 0, -1)
	return adjusted.Format("2006-01-02")
}

func (s *HabitService) getPreviousDate(dateStr string) string {
	t, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return ""
	}
	return t.AddDate(0, 0, -1).Format("2006-01-02")
}
