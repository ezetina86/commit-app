import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TimeRangeFilter } from './time-range-filter';

describe('TimeRangeFilter', () => {
  it('renders preset options and triggers callback on click', () => {
    const onPresetChange = vi.fn();
    const onCustomDateChange = vi.fn();

    render(
      <TimeRangeFilter
        activePreset="30d"
        onPresetChange={onPresetChange}
        customDate=""
        onCustomDateChange={onCustomDateChange}
      />
    );

    expect(screen.getByRole('button', { name: /30d/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /90d/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /90d/i }));
    expect(onPresetChange).toHaveBeenCalledWith('90d');
  });

  it('handles custom date input and clear button', () => {
    const onPresetChange = vi.fn();
    const onCustomDateChange = vi.fn();

    const { rerender } = render(
      <TimeRangeFilter
        activePreset="30d"
        onPresetChange={onPresetChange}
        customDate=""
        onCustomDateChange={onCustomDateChange}
      />
    );

    const input = screen.getByLabelText(/Filter readings from date/i);
    fireEvent.change(input, { target: { value: '2026-06-01' } });
    expect(onCustomDateChange).toHaveBeenCalledWith('2026-06-01');
    expect(onPresetChange).toHaveBeenCalledWith('custom');

    rerender(
      <TimeRangeFilter
        activePreset="custom"
        onPresetChange={onPresetChange}
        customDate="2026-06-01"
        onCustomDateChange={onCustomDateChange}
      />
    );

    const clearButton = screen.getByRole('button', { name: /clear/i });
    fireEvent.click(clearButton);
    expect(onCustomDateChange).toHaveBeenCalledWith('');
    expect(onPresetChange).toHaveBeenCalledWith('30d');
  });
});
