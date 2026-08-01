import { describe, it, expect } from 'vitest';
import {
  generateBodyCompositionMarkdown,
  type WeightReading,
  type CircumferenceReading,
} from './export-body-composition';

const makeWeight = (weight: number, date: string, notes = ''): WeightReading => ({
  id: `w-${date}`,
  weight,
  notes,
  recorded_at: `${date}T12:00:00Z`,
});

const makeCirc = (
  abdomen: number,
  biceps: number,
  quads: number,
  date: string,
  notes = '',
): CircumferenceReading => ({
  id: `c-${date}`,
  abdomen,
  biceps,
  quads,
  notes,
  recorded_at: `${date}T12:00:00Z`,
});

describe('generateBodyCompositionMarkdown', () => {
  it('produces a report with header and generated-on line', () => {
    const md = generateBodyCompositionMarkdown([], []);
    expect(md).toContain('# Body Composition Report');
    expect(md).toContain('> Generated on');
  });

  it('shows "No weight readings" when weight array is empty', () => {
    const md = generateBodyCompositionMarkdown([], [makeCirc(90, 35, 55, '2026-07-01')]);
    expect(md).toContain('No weight readings recorded.');
  });

  it('shows "No circumference readings" when circumference array is empty', () => {
    const md = generateBodyCompositionMarkdown([makeWeight(180, '2026-07-01')], []);
    expect(md).toContain('No circumference readings recorded.');
  });

  it('computes correct weight summary stats', () => {
    const readings = [
      makeWeight(180, '2026-07-01'),
      makeWeight(175, '2026-07-08'),
      makeWeight(185, '2026-07-15'),
    ];
    const md = generateBodyCompositionMarkdown(readings, []);

    expect(md).toContain('| Total readings | 3 |');
    expect(md).toContain('| Average | 180 lbs |');
    expect(md).toContain('| Min | 175 lbs |');
    expect(md).toContain('| Max | 185 lbs |');
  });

  it('sorts weight readings chronologically (oldest first)', () => {
    const readings = [
      makeWeight(185, '2026-07-15'),
      makeWeight(175, '2026-07-01'),
      makeWeight(180, '2026-07-08'),
    ];
    const md = generateBodyCompositionMarkdown(readings, []);

    // Extract the weight data rows: lines between "### Readings" and the next "##"
    const readingsSection = md.split('### Readings')[1].split('##')[0];
    const dataRows = readingsSection
      .split('\n')
      .filter((l) => l.startsWith('|') && !l.includes('Date') && !l.includes('---'));

    expect(dataRows).toHaveLength(3);
    expect(dataRows[0]).toContain('175');
    expect(dataRows[1]).toContain('180');
    expect(dataRows[2]).toContain('185');
  });

  it('computes correct circumference summary stats', () => {
    const readings = [
      makeCirc(90, 35, 55, '2026-07-01'),
      makeCirc(88, 36, 56, '2026-07-08'),
    ];
    const md = generateBodyCompositionMarkdown([], readings);

    expect(md).toContain('| Total readings | 2 |');
    expect(md).toContain('| Avg abdomen | 89 cm |');
    expect(md).toContain('| Avg biceps | 35.5 cm |');
    expect(md).toContain('| Avg quads | 55.5 cm |');
  });

  it('includes both weight and circumference sections in a full report', () => {
    const md = generateBodyCompositionMarkdown(
      [makeWeight(180, '2026-07-01')],
      [makeCirc(90, 35, 55, '2026-07-01')],
    );

    expect(md).toContain('## Weight');
    expect(md).toContain('## Circumference');
    expect(md).toContain('| Date | Weight (lbs) | Notes |');
    expect(md).toContain('| Date | Abdomen (cm) | Biceps (cm) | Quads (cm) | Notes |');
  });

  it('escapes pipe characters in notes', () => {
    const md = generateBodyCompositionMarkdown(
      [makeWeight(180, '2026-07-01', 'before | after')],
      [],
    );

    expect(md).toContain('before \\| after');
    expect(md).not.toContain('before | after |');
  });

  it('handles single reading correctly', () => {
    const md = generateBodyCompositionMarkdown(
      [makeWeight(172.5, '2026-07-10', 'morning weigh-in')],
      [],
    );

    expect(md).toContain('| Total readings | 1 |');
    expect(md).toContain('| Average | 172.5 lbs |');
    expect(md).toContain('| Min | 172.5 lbs |');
    expect(md).toContain('| Max | 172.5 lbs |');
    expect(md).toContain('morning weigh-in');
  });
});
