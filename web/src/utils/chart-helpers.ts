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
  const high = Math.ceil((max + padding) / roundStep) * roundStep;

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
