# Design Document: Enhanced Chart Visual Experience & Insights

**Date:** 2026-07-22  
**Branch:** `feature/improved-chart-visual-experience`  
**Status:** Approved  

---

## 1. Overview
The current line charts for health and progress tracking (`Steps`, `Blood Pressure`, `Body Composition` [Weight & Circumferences], and `ELO Ratings`) display all historical data by default and start Y-axis domain scaling from `0`. When users accumulate a large volume of readings or when daily values vary within an elevated band (e.g. steps between 8,000 and 14,000, or weight around 175 lbs), differences appear marginal, charts look flat and cluttered, and progress is difficult to visualize.

This feature introduces a default **Last 30 Days (`30D`)** view, time-range preset filter controls (`30D`, `90D`, `1Y`, `ALL`, `Custom`), **Dynamic Y-Axis Domain Auto-Scaling**, and **Period-over-Period Visual Insights** (averages, peaks, lows, and trend badges).

---

## 2. Goals & User Experience Improvements

### 2.1 Default 30-Day Filtering & Quick Preset Controls
- **Default Range:** By default, all progress charts render readings from the **Last 30 Days** relative to the most recent entry / current date.
- **Preset Buttons:** Filter controls on every section header:
  - `30D` (Default)
  - `90D`
  - `1Y`
  - `ALL`
  - `Custom Date` (date picker)
- **Unified Filtering:** Selecting a preset updates the chart line rendering, period averages, peak/low statistics, and period comparison metrics synchronously.

### 2.2 Dynamic Y-Axis Domain Auto-Scaling
- **Dynamic Domain Calculation:** Instead of defaulting to zero-baseline `0`, Y-axis bounds are automatically computed based on the data minimum (`min`) and data maximum (`max`) within the selected active time range, adding a 5% to 10% padding margin.
- **Chart Specific Scaling Rules:**
  - **Steps (`StepsSection`):** Domain set to `[Math.max(0, Math.floor(minSteps / 500) * 500 - 500), Math.ceil(maxSteps / 500) * 500 + 500]` (ensuring `target` is within view).
  - **Weight (`BodyCompositionSection`):** Domain set to `[Math.floor(minWeight - 2), Math.ceil(maxWeight + 2)]`.
  - **Circumference (`BodyCompositionSection`):** Domain set to `[Math.floor(minVal - 1), Math.ceil(maxVal + 1)]`.
  - **Blood Pressure (`BloodPressureSection`):** Domain bounds wrapping `systolic` & `diastolic` readings with margin around normal reference lines (120/80).
  - **ELO Rating (`EloSection`):** Domain set to `[Math.max(0, minRating - 50), maxRating + 50]` (including target).

### 2.3 Visual Insights Header & Trend Badges
- **Header Stat Cards:**
  - **Period Average:** Large font display of average in the active range.
  - **Peak & Low:** Compact display showing the maximum and minimum readings in the period.
  - **Trend Badge:** Delta vs previous equal period (e.g. current 30D avg vs prior 30D avg). Format: `▲ +520 steps/day (+6.4%)` or `▼ -1.5 lbs (-0.8%)`.
- **Target Progress Indicators:** Highlighted dashed target reference lines with labels.

### 2.4 Aesthetics & Accessibility
- Clean typography (JetBrains Mono for numerical data and dates).
- Dark terminal visual style (`#39D353` green accents, `#7D8590` text secondary, `#0ffffff0d` chart grids).
- Fully accessible keyboard navigation and standard `aria-label` attributes.

---

## 3. Architecture & Shared Helper Modules

### 3.1 `web/src/utils/chart-helpers.ts`
Create unit-tested utility functions for date filtering and domain calculation:
- `filterReadingsByPreset<T>(readings: T[], getDate: (item: T) => string, preset: '30d' | '90d' | '1y' | 'all' | 'custom', customSinceDate?: string): T[]`
- `calculateDynamicDomain(values: number[], target?: number, paddingPercent?: number, roundStep?: number): [number, number]`
- `calculatePeriodTrend(currentReadings: number[], previousPeriodReadings: number[]): { delta: number; percent: number }`

### 3.2 UI Component Updates
- **`web/src/components/time-range-filter.tsx`**: Shared preset pill bar component.
- **`web/src/components/steps-section.tsx`**: Integrate `TimeRangeFilter`, dynamic Y-axis, trend pill, and 30D default.
- **`web/src/components/blood-pressure-section.tsx`**: Integrate `TimeRangeFilter`, dynamic Y-axis, trend pill, and 30D default.
- **`web/src/components/body-composition-section.tsx`**: Integrate `TimeRangeFilter`, dynamic Y-axis, trend pills for Weight & Circumference, and 30D default.
- **`web/src/components/elo-section.tsx`**: Integrate `TimeRangeFilter`, dynamic Y-axis, trend pill, and 30D default.

---

## 4. Verification Plan

### Automated Tests
- Create unit tests for `web/src/utils/chart-helpers.ts`.
- Update section test suites (`steps-section.test.tsx`, `blood-pressure-section.test.tsx`, `body-composition-section.test.tsx`, `elo-section.test.tsx`) to verify:
  1. Default selection is `30D`.
  2. Clicking `90D`, `1Y`, `ALL` filters dataset correctly.
  3. Dynamic Y-axis domains scale accurately without baseline zero forcing.
  4. Trend comparison pills compute correctly.
  5. All 160+ test cases pass without regressions.

---
