/**
 * Body Composition Markdown export utilities.
 *
 * Pure functions that generate a structured Markdown report from weight
 * and circumference readings, plus a browser-download helper.
 */

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
  notes: string;
  recorded_at: string;
}

const formatCentral = (iso: string): string =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));

const round1 = (n: number): number => Math.round(n * 10) / 10;

// ── Markdown generation ─────────────────────────────────────────────

export function generateBodyCompositionMarkdown(
  weightReadings: WeightReading[],
  circumferenceReadings: CircumferenceReading[],
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
    lines.push(`| Metric | Value |`);
    lines.push(`| --- | --- |`);
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

    lines.push('### Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('| --- | --- |');
    lines.push(`| Total readings | ${sorted.length} |`);
    lines.push(`| Avg abdomen | ${avgAbdomen} cm |`);
    lines.push(`| Avg biceps | ${avgBiceps} cm |`);
    lines.push(`| Avg quads | ${avgQuads} cm |`);
    lines.push('');
    lines.push('### Readings');
    lines.push('');
    lines.push('| Date | Abdomen (cm) | Biceps (cm) | Quads (cm) | Notes |');
    lines.push('| --- | ---: | ---: | ---: | --- |');
    for (const r of sorted) {
      const notes = r.notes ? r.notes.replace(/\|/g, '\\|') : '';
      lines.push(`| ${formatCentral(r.recorded_at)} | ${r.abdomen} | ${r.biceps} | ${r.quads} | ${notes} |`);
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
