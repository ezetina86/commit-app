# Enhanced Chart Visual Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the line charts in the app (`Steps`, `Blood Pressure`, `Body Composition`, and `ELO`) to default to the last 30 days, auto-scale Y-axis dynamically based on active range data, display period-over-period trend badges, and offer preset filter buttons (`30D`, `90D`, `1Y`, `ALL`, `Custom`).

**Architecture:** Create reusable utility functions for date window filtering, dynamic Y-axis domain calculation, and period trend delta calculations in `web/src/utils/chart-helpers.ts`. Create a reusable `TimeRangeFilter` component in `web/src/components/time-range-filter.tsx`. Update the four progress section components to use the time range state and dynamic scaling rules.

**Tech Stack:** React 19, Recharts, TypeScript, Vitest, TailwindCSS.

## Global Constraints
- Every chart section must default to the `30D` time range filter on initial render.
- Y-axis domains must dynamically compute bounds `[min - padding, max + padding]` for active readings without forcing `0` as baseline.
- All existing Vitest unit tests (160 tests) must continue to pass, with new tests verifying filtering, dynamic scaling, and trend pill rendering.

---

### Task 1: Create Chart Helper Utilities & Unit Tests

**Files:**
- Create: `web/src/utils/chart-helpers.ts`
- Create: `web/src/utils/chart-helpers.test.ts`

**Interfaces:**
- Produces:
  - `filterReadingsByPreset<T>(readings: T[], getDate: (item: T) => string, preset: TimeRangePreset, customSinceDate?: string): T[]`
  - `calculateDynamicDomain(values: number[], targets?: number[], paddingPercent?: number, roundStep?: number): [number, number]`
  - `calculatePeriodTrend(currentValues: number[], previousValues: number[]): { delta: number; percent: number }`

- [ ] **Step 1: Write failing tests for chart helpers**

Create `web/src/utils/chart-helpers.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { filterReadingsByPreset, calculateDynamicDomain, calculatePeriodTrend } from './chart-helpers';

describe('chart-helpers', () => {
  const mockReadings = [
    { id: '1', recorded_at: '2026-07-20T10:00:00Z', steps: 10000 },
    { id: '2', recorded_at: '2026-06-01T10:00:00Z', steps: 8000 },
    { id: '3', recorded_at: '2025-01-01T10:00:00Z', steps: 6000 },
  ];

  it('filters readings by 30d preset correctly', () => {
    const result = filterReadingsByPreset(mockReadings, (r) => r.recorded_at, '30d', '', new Date('2026-07-22T10:00:00Z'));
    expect(result).toHaveLength(1);
    expect(result[0].id).toEqual('1');
  });

  it('calculates dynamic domain with padding', () => {
    const domain = calculateDynamicDomain([8000, 12000], [10000], 0.1, 500);
    expect(domain[0]).toBeLessThanOrEqual(8000);
    expect(domain[1]).toBeGreaterThanOrEqual(12000);
  });

  it('calculates period trend delta and percentage', () => {
    const trend = calculatePeriodTrend([10000, 11000], [8000, 9000]);
    expect(trend.delta).toEqual(2000);
    expect(trend.percent).toBeCloseTo(23.53, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/chart-helpers.test.ts`
Expected: FAIL ("Cannot find module ./chart-helpers")

- [ ] **Step 3: Implement `web/src/utils/chart-helpers.ts`**

Create `web/src/utils/chart-helpers.ts`:
```typescript
export type TimeRangePreset = '30d' | '90d' | '1y' | 'all' | 'custom';

export function filterReadingsByPreset<T>(
  readings: T[],
  getDateIso: (item: T) => string,
  preset: TimeRangePreset,
  customSinceDate?: string,
  now = new Date()
): T[] {
  if (preset === 'all') return readings;
  if (preset === 'custom') {
    if (!customSinceDate) return readings;
    return readings.filter((item) => getDateIso(item) >= customSinceDate);
  }

  const msMap: Record<'30d' | '90d' | '1y', number> = {
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
    '1y': 365 * 24 * 60 * 60 * 1000,
  };

  const cutoff = now.getTime() - msMap[preset];
  return readings.filter((item) => new Date(getDateIso(item)).getTime() >= cutoff);
}

export function calculateDynamicDomain(
  values: number[],
  targets: number[] = [],
  paddingPercent = 0.05,
  roundStep = 1
): [number, number] {
  const allValues = [...values, ...targets].filter((v) => typeof v === 'number' && !isNaN(v));
  if (allValues.length === 0) return [0, 100];

  let min = Math.min(...allValues);
  let max = Math.max(...allValues);

  if (min === max) {
    min = min - 10;
    max = max + 10;
  }

  const range = max - min;
  const padding = Math.max(range * paddingPercent, roundStep);

  let low = Math.floor((min - padding) / roundStep) * roundStep;
  let high = Math.ceil((max + padding) / roundStep) * roundStep;

  if (low < 0 && min >= 0) low = 0;

  return [low, high];
}

export function calculatePeriodTrend(
  currentValues: number[],
  previousValues: number[]
): { delta: number; percent: number } {
  if (currentValues.length === 0 || previousValues.length === 0) {
    return { delta: 0, percent: 0 };
  }

  const currentAvg = currentValues.reduce((a, b) => a + b, 0) / currentValues.length;
  const previousAvg = previousValues.reduce((a, b) => a + b, 0) / previousValues.length;

  const delta = Math.round((currentAvg - previousAvg) * 10) / 10;
  const percent = previousAvg !== 0 ? Math.round(((currentAvg - previousAvg) / previousAvg) * 1000) / 10 : 0;

  return { delta, percent };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/chart-helpers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/utils/chart-helpers.ts web/src/utils/chart-helpers.test.ts
git commit -m "feat: add chart date filter and dynamic domain utilities"
```

---

### Task 2: Create Reusable `TimeRangeFilter` Component & Tests

**Files:**
- Create: `web/src/components/time-range-filter.tsx`
- Create: `web/src/components/time-range-filter.test.tsx`

- [ ] **Step 1: Write failing test for `TimeRangeFilter`**

Create `web/src/components/time-range-filter.test.tsx`:
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TimeRangeFilter } from './time-range-filter';

describe('TimeRangeFilter', () => {
  it('renders preset options and triggers callback on click', () => {
    const onPresetChange = vi.fn();
    const onCustomDateChange = vi.fn();

    render(
      <TimeRangeFilter
        activePreset="30d"
        onPresetChange={onPresetChange}
        customDate=""
        onCustomDateChange={onCustomDateChange}
      />
    );

    expect(screen.getByRole('button', { name: /30d/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /90d/i }));
    expect(onPresetChange).toHaveBeenCalledWith('90d');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/time-range-filter.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `web/src/components/time-range-filter.tsx`**

Create `web/src/components/time-range-filter.tsx`:
```typescript
import { type TimeRangePreset } from '../utils/chart-helpers';

interface TimeRangeFilterProps {
  activePreset: TimeRangePreset;
  onPresetChange: (preset: TimeRangePreset) => void;
  customDate: string;
  onCustomDateChange: (date: string) => void;
}

const PRESETS: { label: string; value: TimeRangePreset }[] = [
  { label: '30D', value: '30d' },
  { label: '90D', value: '90d' },
  { label: '1Y', value: '1y' },
  { label: 'ALL', value: 'all' },
];

export function TimeRangeFilter({
  activePreset,
  onPresetChange,
  customDate,
  onCustomDateChange,
}: TimeRangeFilterProps) {
  return (
    <div className="flex items-center gap-1.5 font-mono text-xs" aria-label="Time range filter controls">
      {PRESETS.map((p) => {
        const isActive = activePreset === p.value;
        return (
          <button
            key={p.value}
            type="button"
            onClick={() => onPresetChange(p.value)}
            className={`px-2 py-0.5 rounded-sm uppercase tracking-wider transition-colors cursor-pointer ${
              isActive
                ? 'bg-accent-4/20 text-accent-4 font-bold border border-accent-4/40'
                : 'text-text-secondary hover:text-text-primary border border-transparent'
            }`}
          >
            {p.label}
          </button>
        );
      })}
      <input
        type="date"
        value={customDate}
        onChange={(e) => {
          onCustomDateChange(e.target.value);
          if (e.target.value) onPresetChange('custom');
        }}
        aria-label="Filter from custom date"
        className={`bg-background border-none text-xs px-2 py-0.5 rounded-sm outline-none ${
          activePreset === 'custom' ? 'text-accent-4 font-bold' : 'text-text-secondary'
        }`}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/time-range-filter.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/components/time-range-filter.tsx web/src/components/time-range-filter.test.tsx
git commit -m "feat: add TimeRangeFilter preset controls component"
```

---

### Task 3: Update `StepsSection` with 30D Default, Dynamic Y-Axis & Trend Badges

**Files:**
- Modify: `web/src/components/steps-section.tsx`
- Modify: `web/src/components/steps-section.test.tsx`

- [ ] **Step 1: Update `StepsSection` component implementation**

Integrate `TimeRangeFilter`, `filterReadingsByPreset`, `calculateDynamicDomain`, `calculatePeriodTrend`, and render 30D default and dynamic Y-axis bounds.

- [ ] **Step 2: Update `steps-section.test.tsx`**

Ensure test suite covers 30D default filter, dynamic Y-axis calculation, preset switching, and trend metric calculations.

- [ ] **Step 3: Run Vitest on `steps-section.test.tsx`**

Run: `npx vitest run src/components/steps-section.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add web/src/components/steps-section.tsx web/src/components/steps-section.test.tsx
git commit -m "feat: add 30D default filtering and dynamic Y-axis domain to StepsSection"
```

---

### Task 4: Update `BloodPressureSection`, `BodyCompositionSection` & `EloSection`

**Files:**
- Modify: `web/src/components/blood-pressure-section.tsx`
- Modify: `web/src/components/blood-pressure-section.test.tsx`
- Modify: `web/src/components/body-composition-section.tsx`
- Modify: `web/src/components/body-composition-section.test.tsx`
- Modify: `web/src/components/elo-section.tsx`
- Modify: `web/src/components/elo-section.test.tsx`

- [ ] **Step 1: Update components with `TimeRangeFilter` and dynamic Y-axis domains**

Update `BloodPressureSection`, `BodyCompositionSection` (Weight & Circumference charts), and `EloSection` to default to `30d` filtering and use `calculateDynamicDomain`.

- [ ] **Step 2: Run all section tests**

Run: `npx vitest run`
Expected: All 160+ tests PASS

- [ ] **Step 3: Commit**

```bash
git add web/src/components/
git commit -m "feat: complete 30D default filtering, dynamic Y-axis and trend metrics across all progress charts"
```

---
