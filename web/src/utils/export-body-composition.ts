/**
 * Body Composition Markdown export utilities.
 *
 * Pure functions that generate a structured Markdown report from weight,
 * circumference, and body-fat readings, plus a browser-download helper.
 */

import type { WeightReading, CircumferenceReading, BodyFatReading, UserProfile } from '../types/body-composition';

const formatCentral = (iso: string): string =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));

const round1 = (n: number): number => Math.round(n * 10) / 10;
// ponytail: fmt returns '—' for 0/undefined — same rule as the component
const fmt = (v: number | undefined): string => (v && v > 0 ? String(v) : '—');

// ── Markdown generation ─────────────────────────────────────────────

export function generateBodyCompositionMarkdown(
  weightReadings: WeightReading[],
  circumferenceReadings: CircumferenceReading[],
  bodyFatReadings: BodyFatReading[],
  profile: UserProfile | null,
): string {
  const lines: string[] = [];
  const now = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date());

  lines.push('# Body Composition Report');
  lines.push('');
  lines.push(`> Generated on ${now}`);
  if (profile) lines.push(`> Height: ${profile.height_cm} cm`);
  lines.push('');

  // ── Weight ──
  lines.push('## Weight');
  lines.push('');

  if (weightReadings.length === 0) {
    lines.push('No weight readings recorded.');
    lines.push('');
  } else {
    const sorted = [...weightReadings].sort(
      (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
    );

    const weights = sorted.map((r) => r.weight);
    const avg = round1(weights.reduce((s, w) => s + w, 0) / weights.length);
    const min = round1(Math.min(...weights));
    const max = round1(Math.max(...weights));

    lines.push('### Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('| --- | --- |');
    lines.push(`| Total readings | ${sorted.length} |`);
    lines.push(`| Average | ${avg} lbs |`);
    lines.push(`| Min | ${min} lbs |`);
    lines.push(`| Max | ${max} lbs |`);
    lines.push('');
    lines.push('### Readings');
    lines.push('');
    lines.push('| Date | Weight (lbs) | Notes |');
    lines.push('| --- | ---: | --- |');
    for (const r of sorted) {
      const notes = r.notes ? r.notes.replace(/\|/g, '\\|') : '';
      lines.push(`| ${formatCentral(r.recorded_at)} | ${r.weight} | ${notes} |`);
    }
    lines.push('');
  }

  // ── Body Fat ──
  if (bodyFatReadings.length > 0) {
    lines.push('## Body Fat %');
    lines.push('');
    const sorted = [...bodyFatReadings].sort(
      (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
    );
    const pcts = sorted.map((r) => r.body_fat_pct);
    const avg = round1(pcts.reduce((s, v) => s + v, 0) / pcts.length);

    lines.push('### Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('| --- | --- |');
    lines.push(`| Total readings | ${sorted.length} |`);
    lines.push(`| Average | ${avg}% |`);
    lines.push(`| Min | ${round1(Math.min(...pcts))}% |`);
    lines.push(`| Max | ${round1(Math.max(...pcts))}% |`);
    lines.push('');
    lines.push('### Readings');
    lines.push('');
    lines.push('| Date | BF% | Notes |');
    lines.push('| --- | ---: | --- |');
    for (const r of sorted) {
      const notes = r.notes ? r.notes.replace(/\|/g, '\\|') : '';
      lines.push(`| ${formatCentral(r.recorded_at)} | ${r.body_fat_pct} | ${notes} |`);
    }
    lines.push('');
  }

  // ── Circumference ──
  lines.push('## Circumference');
  lines.push('');

  if (circumferenceReadings.length === 0) {
    lines.push('No circumference readings recorded.');
    lines.push('');
  } else {
    const sorted = [...circumferenceReadings].sort(
      (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
    );

    const avgAbdomen = round1(sorted.reduce((s, r) => s + r.abdomen, 0) / sorted.length);
    const avgBiceps = round1(sorted.reduce((s, r) => s + r.biceps, 0) / sorted.length);
    const avgQuads = round1(sorted.reduce((s, r) => s + r.quads, 0) / sorted.length);

    // Optional fields: only average non-zero values
    const neckVals = sorted.map((r) => r.neck ?? 0).filter((v) => v > 0);
    const hipVals = sorted.map((r) => r.hip ?? 0).filter((v) => v > 0);
    const chestVals = sorted.map((r) => r.chest ?? 0).filter((v) => v > 0);
    const calfVals = sorted.map((r) => r.calf ?? 0).filter((v) => v > 0);

    lines.push('### Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('| --- | --- |');
    lines.push(`| Total readings | ${sorted.length} |`);
    lines.push(`| Avg abdomen | ${avgAbdomen} cm |`);
    lines.push(`| Avg biceps | ${avgBiceps} cm |`);
    lines.push(`| Avg quads | ${avgQuads} cm |`);
    if (neckVals.length > 0) lines.push(`| Avg neck | ${round1(neckVals.reduce((s, v) => s + v, 0) / neckVals.length)} cm |`);
    if (hipVals.length > 0) lines.push(`| Avg hip | ${round1(hipVals.reduce((s, v) => s + v, 0) / hipVals.length)} cm |`);
    if (chestVals.length > 0) lines.push(`| Avg chest | ${round1(chestVals.reduce((s, v) => s + v, 0) / chestVals.length)} cm |`);
    if (calfVals.length > 0) lines.push(`| Avg calf | ${round1(calfVals.reduce((s, v) => s + v, 0) / calfVals.length)} cm |`);
    lines.push('');
    lines.push('### Readings');
    lines.push('');
    lines.push('| Date | Abdomen | Biceps | Quads | Neck | Hip | Chest | Calf | Notes |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
    for (const r of sorted) {
      const notes = r.notes ? r.notes.replace(/\|/g, '\\|') : '';
      lines.push(`| ${formatCentral(r.recorded_at)} | ${r.abdomen} | ${r.biceps} | ${r.quads} | ${fmt(r.neck)} | ${fmt(r.hip)} | ${fmt(r.chest)} | ${fmt(r.calf)} | ${notes} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── File download ───────────────────────────────────────────────────

export function downloadMarkdownFile(content: string, filename?: string): void {
  const defaultName = `body-composition-${new Intl.DateTimeFormat('en-CA').format(new Date())}.md`;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? defaultName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Cleanup after the browser has initiated the download.
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 100);
}
