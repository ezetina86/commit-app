import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiCard } from './kpi-card';

describe('KpiCard', () => {
  it('renders label', () => {
    render(<KpiCard label="BF% Navy" value={null} delta={null} deltaPositive={null} improvementDirection="down" />);
    expect(screen.getByText('BF% Navy')).toBeTruthy();
  });

  it('renders dash when value is null', () => {
    render(<KpiCard label="BF% Navy" value={null} delta={null} deltaPositive={null} improvementDirection="down" />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('renders value when provided', () => {
    render(<KpiCard label="Weight" value="185.2 lbs" delta="-1.3" deltaPositive={true} improvementDirection="down" />);
    expect(screen.getByText('185.2 lbs')).toBeTruthy();
  });

  it('renders green delta badge when deltaPositive matches improvementDirection=down (lower is better)', () => {
    const { container } = render(
      <KpiCard label="BF%" value="18.5%" delta="-0.5%" deltaPositive={false} improvementDirection="down" />
    );
    const badge = container.querySelector('[data-testid="delta-badge"]');
    expect(badge?.className).toContain('text-accent-4');
  });

  it('renders red delta badge when deltaPositive does not match improvementDirection', () => {
    const { container } = render(
      <KpiCard label="BF%" value="18.5%" delta="+0.5%" deltaPositive={true} improvementDirection="down" />
    );
    const badge = container.querySelector('[data-testid="delta-badge"]');
    expect(badge?.className).toContain('text-red');
  });

  it('renders no delta badge when delta is null', () => {
    const { container } = render(
      <KpiCard label="BF%" value="18.5%" delta={null} deltaPositive={null} improvementDirection="down" />
    );
    expect(container.querySelector('[data-testid="delta-badge"]')).toBeNull();
  });
});
