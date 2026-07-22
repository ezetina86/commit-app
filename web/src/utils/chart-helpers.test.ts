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

  it('filters readings by 90d preset correctly', () => {
    const result = filterReadingsByPreset(mockReadings, (r) => r.recorded_at, '90d', '', new Date('2026-07-22T10:00:00Z'));
    expect(result).toHaveLength(2);
  });

  it('filters readings by all preset correctly', () => {
    const result = filterReadingsByPreset(mockReadings, (r) => r.recorded_at, 'all', '', new Date('2026-07-22T10:00:00Z'));
    expect(result).toHaveLength(3);
  });

  it('filters readings by custom preset correctly', () => {
    const result = filterReadingsByPreset(mockReadings, (r) => r.recorded_at, 'custom', '2026-01-01', new Date('2026-07-22T10:00:00Z'));
    expect(result).toHaveLength(2);
  });

  it('calculates dynamic domain with padding', () => {
    const domain = calculateDynamicDomain([8000, 12000], [10000], 0.1, 500);
    expect(domain[0]).toBeLessThanOrEqual(8000);
    expect(domain[1]).toBeGreaterThanOrEqual(12000);
  });

  it('handles empty values in dynamic domain calculation', () => {
    const domain = calculateDynamicDomain([]);
    expect(domain).toEqual([0, 100]);
  });

  it('calculates period trend delta and percentage', () => {
    const trend = calculatePeriodTrend([10000, 11000], [8000, 9000]);
    expect(trend.delta).toEqual(2000);
    expect(trend.percent).toBeCloseTo(23.53, 1);
  });

  it('handles empty arrays in period trend calculation', () => {
    const trend = calculatePeriodTrend([], []);
    expect(trend).toEqual({ delta: 0, percent: 0 });
  });
});
