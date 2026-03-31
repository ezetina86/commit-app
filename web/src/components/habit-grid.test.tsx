import { render, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HabitGrid } from './habit-grid';

describe('HabitGrid Component', () => {
  it('renders correctly with no completions', () => {
    const { container } = render(<HabitGrid completions={[]} measureUnit="pages" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBeGreaterThan(360);
    
    const highIntensity = container.querySelectorAll('.fill-accent-4');
    expect(highIntensity.length).toBe(0);
  });

  it('renders correctly with completions and scales intensity', () => {
    const todayStr = new Date().toLocaleDateString('en-CA');
    const data = [{ date: todayStr, value: 100 }];

    const { container, getByText } = render(<HabitGrid completions={data} measureUnit="pages" />);
    
    const highIntensity = container.querySelectorAll('.fill-accent-4');
    expect(highIntensity.length).toBeGreaterThan(0);
    
    // Simulate hover to trigger tooltip
    const rect = highIntensity[0];
    fireEvent.mouseEnter(rect);
    
    expect(getByText(`100 pages on ${todayStr}`)).toBeInTheDocument();
  });

  it('renders check-ins when measure unit is empty', () => {
    const todayStr = new Date().toLocaleDateString('en-CA');
    const data = [{ date: todayStr, value: 5 }];

    const { container, getByText } = render(<HabitGrid completions={data} measureUnit="" />);

    // Find the square with value 5 (it should be the only non-zero one, so it gets max intensity fill-accent-4)
    const activeRects = container.querySelectorAll('.fill-accent-4');
    expect(activeRects.length).toBeGreaterThan(0);

    fireEvent.mouseEnter(activeRects[0]);

    expect(getByText(`5 check-ins on ${todayStr}`)).toBeInTheDocument();
  });
});

describe('HabitGrid — boolean habit', () => {
  it('shows Done on date tooltip for boolean habit', () => {
    const todayStr = new Date().toLocaleDateString('en-CA');
    const data = [{ date: todayStr, value: 1 }];

    const { container, getByText } = render(<HabitGrid completions={data} measureUnit="" habitType="boolean" />);

    const highIntensity = container.querySelectorAll('.fill-accent-4');
    expect(highIntensity.length).toBeGreaterThan(0);

    fireEvent.mouseEnter(highIntensity[0]);

    expect(getByText(`Done on ${todayStr}`)).toBeInTheDocument();
  });

  it('shows No data and Done legend labels for boolean habit', () => {
    render(<HabitGrid completions={[]} measureUnit="" habitType="boolean" />);

    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('shows Less and More legend labels for quantitative habit', () => {
    render(<HabitGrid completions={[]} measureUnit="pages" />);

    expect(screen.getByText('Less')).toBeInTheDocument();
    expect(screen.getByText('More')).toBeInTheDocument();
  });
});