import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SparklineCard } from './sparkline-card';

// Recharts uses ResizeObserver which isn't available in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  Tooltip: () => null,
}));

const data = [
  { date: '2026-07-01T12:00:00Z', value: 90 },
  { date: '2026-07-15T12:00:00Z', value: 88 },
  { date: '2026-08-01T12:00:00Z', value: 86 },
];

describe('SparklineCard', () => {
  it('renders label', () => {
    render(<SparklineCard label="Abdomen" unit="cm" data={data} color="#7D8590" improvementDirection="down" />);
    expect(screen.getByText('Abdomen')).toBeTruthy();
  });

  it('renders unit', () => {
    render(<SparklineCard label="Abdomen" unit="cm" data={data} color="#7D8590" improvementDirection="down" />);
    expect(screen.getByText('cm')).toBeTruthy();
  });

  it('renders latest value', () => {
    render(<SparklineCard label="Abdomen" unit="cm" data={data} color="#7D8590" improvementDirection="down" />);
    expect(screen.getByText('86')).toBeTruthy();
  });

  it('renders LineChart when data is non-empty', () => {
    render(<SparklineCard label="Abdomen" unit="cm" data={data} color="#7D8590" improvementDirection="down" />);
    expect(screen.getByTestId('line-chart')).toBeTruthy();
  });

  it('renders no chart and shows placeholder when data is empty', () => {
    render(<SparklineCard label="Abdomen" unit="cm" data={[]} color="#7D8590" improvementDirection="down" />);
    expect(screen.queryByTestId('line-chart')).toBeNull();
    expect(screen.getByText('—')).toBeTruthy();
  });
});
