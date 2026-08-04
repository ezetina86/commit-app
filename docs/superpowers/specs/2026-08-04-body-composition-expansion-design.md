# Body Composition Expansion — Design Spec

**Date:** 2026-08-04  
**Branch:** feature/body-composition-expansion  
**Status:** Approved, ready for implementation

---

## Overview

Adds four new circumference measurements (neck, hip, chest, calf), a user height profile, a separate Samsung wearable body fat % log, and replaces the current multi-line circumference chart with a KPI card row + per-measurement sparkline grid.

---

## 1. Data Layer

### 1.1 New table: `user_profile`

Single-row table enforced via `CHECK (id = 1)`. Stores height once, used for Navy Method BF% computation.

```sql
CREATE TABLE IF NOT EXISTS user_profile (
    id        INTEGER PRIMARY KEY CHECK (id = 1),
    height_cm REAL NOT NULL
);
```

Upsert pattern: `INSERT OR REPLACE INTO user_profile (id, height_cm) VALUES (1, ?)`.

### 1.2 New table: `body_fat_readings`

Separate from circumferences — Samsung scans occur at different frequency than tape measurements.

```sql
CREATE TABLE IF NOT EXISTS body_fat_readings (
    id           TEXT PRIMARY KEY,
    body_fat_pct REAL NOT NULL,
    notes        TEXT DEFAULT '',
    recorded_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_body_fat_recorded_at ON body_fat_readings(recorded_at);
```

### 1.3 New columns on `circumference_readings`

Four nullable columns added via migration helper (all DEFAULT NULL):

```
neck  REAL
hip   REAL
chest REAL
calf  REAL
```

Migration: `addColumnIfMissing(db, table, col, type)` runs in `initSchema()`. Checks `PRAGMA table_info` and only fires `ALTER TABLE` if the column is absent. Safe on every boot, handles fresh installs and existing DBs.

All circumference fields (including the original abdomen, biceps, quads) become optional in validation. Frontend enforces that at least one field is non-zero before submitting.

### 1.4 API endpoints

**New:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/profile` | Returns `{height_cm}`. 404 if not set. |
| `PUT` | `/api/profile` | Body `{height_cm: float64}`. Upserts single row. |
| `GET` | `/api/body-fat` | List all BF% readings, DESC by recorded_at. |
| `POST` | `/api/body-fat` | Body `{body_fat_pct, notes, recorded_at?}`. |
| `DELETE` | `/api/body-fat/{id}` | Delete one reading. |

**Updated:**

`POST /api/circumference` — accepts four new optional fields: `neck`, `hip`, `chest`, `calf` (all `float64`, omitted or zero treated as not recorded).

---

## 2. Backend Changes

### 2.1 `api/internal/models/models.go`

Update `CircumferenceReading`:
```go
type CircumferenceReading struct {
    ID         string    `json:"id"`
    Abdomen    float64   `json:"abdomen"`
    Biceps     float64   `json:"biceps"`
    Quads      float64   `json:"quads"`
    Neck       float64   `json:"neck"`
    Hip        float64   `json:"hip"`
    Chest      float64   `json:"chest"`
    Calf       float64   `json:"calf"`
    Notes      string    `json:"notes"`
    RecordedAt time.Time `json:"recorded_at"`
}
```

The four new fields use `float64` where `0` is the sentinel for "not recorded" — no circumference can physically be 0 cm. The DB columns are nullable (`DEFAULT NULL`); the repository reads them with `IFNULL(neck, 0)` and writes `NULL` when the Go value is `0`.

New structs:
```go
type UserProfile struct {
    HeightCm float64 `json:"height_cm"`
}

type BodyFatReading struct {
    ID         string    `json:"id"`
    BodyFatPct float64   `json:"body_fat_pct"`
    Notes      string    `json:"notes"`
    RecordedAt time.Time `json:"recorded_at"`
}
```

### 2.2 `api/internal/repository/sqlite.go`

- Add `addColumnIfMissing` helper
- Add four `ALTER TABLE circumference_readings ADD COLUMN ...` calls in `initSchema()`
- Add `CREATE TABLE IF NOT EXISTS user_profile` and `body_fat_readings` in `initSchema()`
- Update `CreateCircumferenceReading` and `ListCircumferenceReadings` for new fields
- Add `GetUserProfile`, `UpsertUserProfile`
- Add `CreateBodyFatReading`, `ListBodyFatReadings`, `DeleteBodyFatReading`

### 2.3 `api/internal/service/habit_service.go`

Add to the `HabitRepository` interface:
```go
GetUserProfile(ctx context.Context) (*models.UserProfile, error)
UpsertUserProfile(ctx context.Context, heightCm float64) (*models.UserProfile, error)
CreateBodyFatReading(ctx context.Context, bodyFatPct float64, notes string, recordedAt time.Time) (*models.BodyFatReading, error)
ListBodyFatReadings(ctx context.Context) ([]*models.BodyFatReading, error)
DeleteBodyFatReading(ctx context.Context, id string) error
```

Update `CreateCircumferenceReading` signature to accept new fields.

### 2.4 `api/cmd/api/main.go`

Register five new route handlers inline (matching existing pattern): profile GET/PUT and body-fat GET/POST/DELETE.

---

## 3. Frontend Changes

### 3.1 New shared types file

`web/src/types/body-composition.ts` — single source of truth, imported by component and export utility (removes current duplication):

```ts
export interface UserProfile {
  height_cm: number;
}

export interface WeightReading {
  id: string;
  weight: number;
  notes: string;
  recorded_at: string;
}

export interface CircumferenceReading {
  id: string;
  abdomen: number;
  biceps: number;
  quads: number;
  neck?: number;
  hip?: number;
  chest?: number;
  calf?: number;
  notes: string;
  recorded_at: string;
}

export interface BodyFatReading {
  id: string;
  body_fat_pct: number;
  notes: string;
  recorded_at: string;
}
```

### 3.2 New utility: `web/src/utils/body-fat.ts`

```ts
export function navyMethodBF(neck: number, abdomen: number, height: number): number {
  return 495 / (1.0324 - 0.19077 * Math.log10(abdomen - neck) + 0.15456 * Math.log10(height)) - 450;
}
```

Returns `NaN` when `abdomen <= neck` (mathematically undefined). Caller guards with `isFinite()` before display.

Formula source: Hodgdon & Beckett (1984), inputs in centimeters, male.

### 3.3 `App.tsx`

Two new state slices:
```ts
const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
const [bodyFatReadings, setBodyFatReadings] = useState<BodyFatReading[]>([]);
```

Two new fetch calls on mount (parallel with existing fetches):
- `GET /api/profile` → `setUserProfile` (treat 404 as null, not an error)
- `GET /api/body-fat` → `setBodyFatReadings`

New handlers passed to `BodyCompositionSection`:
- `onSaveProfile(heightCm: number): Promise<void>`
- `onAddBodyFat(reading: Omit<BodyFatReading, 'id'>): Promise<void>`
- `onDeleteBodyFat(id: string): Promise<void>`

### 3.4 New components

**`web/src/components/kpi-card.tsx`**

Props: `label`, `value: string | null`, `delta: string | null`, `deltaPositive: boolean | null`, `improvementDirection: 'up' | 'down'`.

Renders `—` when `value` is null. Delta badge: green if direction matches `improvementDirection`, red otherwise.

**`web/src/components/sparkline-card.tsx`**

Props: `label`, `unit`, `data: {date: string, value: number}[]`, `color`, `improvementDirection: 'up' | 'down'`.

Renders: label + unit row, latest value + delta, 48px `ResponsiveContainer` + `LineChart` (no axes, no grid, minimal tooltip showing date + value). Uses existing Recharts import.

### 3.5 `body-composition-section.tsx` layout

```
1. Profile row
   ├─ height not set: inline form [Enter height (cm)] [Save]
   └─ height set: "Height: 178 cm" pill + [Edit] button → inline form

2. KPI row (4 KpiCard tiles)
   ├─ BF% Navy    — navyMethodBF(latest neck, latest abdomen, height_cm)
   ├─ BF% Samsung — latest body_fat_readings entry
   ├─ W/H Ratio   — latest abdomen / latest hip
   └─ Weight      — latest weight + delta vs 30d avg
   All show "—" when required data is absent.

3. Weight section [unchanged]

4. Body Fat % section [new, shown only when bodyFatReadings.length > 0]
   ├─ TimeRangeFilter
   ├─ single LineChart (body_fat_pct over time)
   ├─ log form: [BF%] [Date] [Notes] [Log]
   └─ collapsible history list with delete

5. Circumferences section
   ├─ TimeRangeFilter
   ├─ Sparkline grid — 7 SparklineCard components
   │   abdomen (#7D8590) · hip (#7D8590) · neck (#0E4429)
   │   chest (#39D353)   · biceps (#39D353) · quads (#26A641) · calf (#006D32)
   │   grid-cols-2 md:grid-cols-3 lg:grid-cols-4
   ├─ log form: [abdomen] [biceps] [quads] [neck] [hip] [chest] [calf] [date] [notes]
   │   all fields optional; frontend validates ≥1 non-zero value
   └─ collapsible history list with delete
```

Existing alert banner (catabolism + protein deficit warnings) unchanged. Alert logic continues to use only the original three circumference fields (abdomen, biceps, quads) — extending it to chest/calf is out of scope.

---

## 4. Export Utility Updates

`web/src/utils/export-body-composition.ts`:
- Import types from `web/src/types/body-composition.ts` (removes duplicate declarations)
- Add new columns to circumference table: neck, hip, chest, calf (render as `—` when 0 or absent)
- Add BF% readings section when `bodyFatReadings` is non-empty
- Function signature: `generateBodyCompositionMarkdown(weight, circumference, bodyFat, profile)`

---

## 5. Testing

### New test files

**`web/src/utils/body-fat.test.ts`**
- `navyMethodBF(38, 95, 178)` → ~23.5% (known reference value)
- `navyMethodBF(40, 40, 178)` → `NaN` (abdomen ≤ neck guard)
- Result clamped to realistic range in caller (display layer, not formula)

**`web/src/components/kpi-card.test.tsx`**
- Renders `—` when value is null
- Delta badge green when improving, red when worsening, absent when delta is null
- `improvementDirection: 'down'` reverses badge logic

**`web/src/components/sparkline-card.test.tsx`**
- Renders label and unit
- Renders latest value
- Renders `LineChart` when data is non-empty
- Renders no chart (or placeholder) when data is empty

### Updated test files

**`web/src/components/body-composition-section.test.tsx`**
- Profile row: shows setup form when `userProfile` is null
- Profile row: shows height pill when `userProfile` is set
- KPI: BF% Navy shows `—` when height is null
- KPI: BF% Navy shows correct value when all inputs present
- KPI: W/H ratio shows `—` when no hip readings
- Sparkline grid: all 7 cards render
- Circumference form: submit blocked when all fields are zero

**`web/src/utils/export-body-composition.test.ts`**
- New fields appear in circumference table
- Missing optional fields render as `—`
- BF% section included when readings present, omitted when empty

### Coverage target

≥70% for both frontend and backend, matching existing requirement.

---

## 6. File Changelist

| File | Change |
|---|---|
| `api/internal/models/models.go` | Update `CircumferenceReading`; add `UserProfile`, `BodyFatReading` |
| `api/internal/repository/sqlite.go` | Migration helper, new tables, updated queries, new CRUD methods |
| `api/internal/service/habit_service.go` | Extend repository interface |
| `api/cmd/api/main.go` | Five new route handlers |
| `web/src/types/body-composition.ts` | New — shared type definitions |
| `web/src/utils/body-fat.ts` | New — `navyMethodBF()` |
| `web/src/utils/body-fat.test.ts` | New |
| `web/src/components/kpi-card.tsx` | New |
| `web/src/components/kpi-card.test.tsx` | New |
| `web/src/components/sparkline-card.tsx` | New |
| `web/src/components/sparkline-card.test.tsx` | New |
| `web/src/components/body-composition-section.tsx` | Major update |
| `web/src/components/body-composition-section.test.tsx` | Update |
| `web/src/utils/export-body-composition.ts` | Update for new fields |
| `web/src/utils/export-body-composition.test.ts` | Update |
| `web/src/App.tsx` | New state, fetches, handlers |
