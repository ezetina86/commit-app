import { describe, it, expect } from 'vitest';
import { navyMethodBF } from './body-fat';

describe('navyMethodBF', () => {
  it('returns ~23.5% for a known reference input (neck=38, abdomen=95, height=178)', () => {
    const result = navyMethodBF(38, 95, 178);
    expect(result).toBeCloseTo(23.5, 0);
  });

  it('returns NaN when abdomen <= neck (mathematically undefined)', () => {
    expect(isNaN(navyMethodBF(40, 40, 178))).toBe(true);
    expect(isNaN(navyMethodBF(41, 40, 178))).toBe(true);
  });

  it('returns a finite positive number for realistic inputs', () => {
    const result = navyMethodBF(36, 85, 175);
    expect(isFinite(result)).toBe(true);
    expect(result).toBeGreaterThan(0);
  });
});
