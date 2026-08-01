# Body Composition Markdown Export

## Summary

Add a client-side "Export MD" button to the Body Composition section that generates a Markdown report containing summary statistics and full data tables for weight and circumference readings, and triggers a browser file download.

## Architecture

- **Client-side only** — no backend changes required
- New utility module: `web/src/utils/export-body-composition.ts`
- Component change: button added to `body-composition-section.tsx`

## Utility Module: `export-body-composition.ts`

### `generateBodyCompositionMarkdown(weightReadings, circumferenceReadings): string`

Builds a Markdown document with:

1. **Header**: `# Body Composition Report` + generation timestamp
2. **Weight Summary**: total readings, average, min, max (lbs)
3. **Weight Table**: `| Date | Weight (lbs) | Notes |` — chronological (oldest → newest)
4. **Circumference Summary**: total readings, averages for abdomen/biceps/quads (cm)
5. **Circumference Table**: `| Date | Abdomen (cm) | Biceps (cm) | Quads (cm) | Notes |` — chronological

Dates formatted in Central Time (`America/Chicago`). Pure function, no side effects.

### `downloadMarkdownFile(content: string, filename: string): void`

Creates a Blob, generates an object URL, triggers download via hidden `<a>` element.
Default filename: `body-composition-YYYY-MM-DD.md`.

## Component Change

- "Export MD" button next to the `<h2>` header
- Disabled when both reading arrays are empty
- On click: generate markdown → trigger download

## Data Scope

- Exports ALL readings (ignores active time-range filters)

## Testing

- Unit tests for `generateBodyCompositionMarkdown` (stats, table rows, edge cases)
- Component test for button rendering and disabled state
