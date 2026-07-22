import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BloodPressureSection } from './blood-pressure-section';
import type { BloodPressureReading } from './blood-pressure-section';

// Recharts uses ResizeObserver — polyfill for jsdom
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const makeReading = (overrides: Partial<BloodPressureReading> = {}): BloodPressureReading => ({
  id: 'r1',
  systolic: 120,
  diastolic: 80,
  notes: '',
  recorded_at: new Date().toISOString(),
  ...overrides,
});

describe('BloodPressureSection', () => {
  const onAdd = vi.fn().mockResolvedValue(undefined);
  const onDelete = vi.fn();

  beforeEach(() => {
    onAdd.mockClear();
    onDelete.mockClear();
  });

  it('renders the section heading', () => {
    render(<BloodPressureSection readings={[]} onAdd={onAdd} onDelete={onDelete} />);
    expect(screen.getByText('Blood Pressure')).toBeInTheDocument();
  });

  it('shows empty state when no readings', () => {
    render(<BloodPressureSection readings={[]} onAdd={onAdd} onDelete={onDelete} />);
    expect(screen.getByText(/no readings logged/i)).toBeInTheDocument();
  });

  it('hides reading rows by default when readings are provided', () => {
    const readings = [
      makeReading({ id: 'r1', systolic: 120, diastolic: 80 }),
      makeReading({ id: 'r2', systolic: 130, diastolic: 85, notes: 'stressed' }),
    ];
    render(<BloodPressureSection readings={readings} onAdd={onAdd} onDelete={onDelete} />);
    expect(screen.queryByText('120/80')).not.toBeInTheDocument();
    expect(screen.queryByText('130/85')).not.toBeInTheDocument();
  });

  it('shows history toggle button with count when readings are present', () => {
    const readings = [
      makeReading({ id: 'r1' }),
      makeReading({ id: 'r2' }),
    ];
    render(<BloodPressureSection readings={readings} onAdd={onAdd} onDelete={onDelete} />);
    expect(screen.getByRole('button', { name: /show history/i })).toBeInTheDocument();
  });

  it('shows reading rows after toggling history on', async () => {
    const user = userEvent.setup();
    const readings = [
      makeReading({ id: 'r1', systolic: 120, diastolic: 80 }),
      makeReading({ id: 'r2', systolic: 130, diastolic: 85, notes: 'stressed' }),
    ];
    render(<BloodPressureSection readings={readings} onAdd={onAdd} onDelete={onDelete} />);
    await user.click(screen.getByRole('button', { name: /show history/i }));
    expect(screen.getByText('120/80')).toBeInTheDocument();
    expect(screen.getByText('130/85')).toBeInTheDocument();
    expect(screen.getByText('stressed')).toBeInTheDocument();
  });

  it('hides reading rows after toggling history off', async () => {
    const user = userEvent.setup();
    const readings = [makeReading({ id: 'r1', systolic: 120, diastolic: 80 })];
    render(<BloodPressureSection readings={readings} onAdd={onAdd} onDelete={onDelete} />);
    await user.click(screen.getByRole('button', { name: /show history/i }));
    expect(screen.getByText('120/80')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /hide history/i }));
    expect(screen.queryByText('120/80')).not.toBeInTheDocument();
  });

  it('shows avg blood pressure before title when readings exist', () => {
    const readings = [
      makeReading({ id: 'r1', systolic: 120, diastolic: 80 }),
      makeReading({ id: 'r2', systolic: 130, diastolic: 90 }),
    ];
    render(<BloodPressureSection readings={readings} onAdd={onAdd} onDelete={onDelete} />);
    const avgEl = screen.getByLabelText('Average blood pressure');
    expect(avgEl).toBeInTheDocument();
    expect(avgEl.textContent).toContain('125');
    expect(avgEl.textContent).toContain('85');
    expect(avgEl.textContent).toContain('mmHg');
    expect(avgEl.textContent).toContain('2 readings');
  });

  it('hides avg when no readings', () => {
    render(<BloodPressureSection readings={[]} onAdd={onAdd} onDelete={onDelete} />);
    expect(screen.queryByLabelText('Average blood pressure')).not.toBeInTheDocument();
  });

  it('does not render chart when no readings', () => {
    render(<BloodPressureSection readings={[]} onAdd={onAdd} onDelete={onDelete} />);
    expect(screen.queryByLabelText('Blood pressure trend chart')).not.toBeInTheDocument();
  });

  it('renders chart when readings are present', () => {
    const readings = [makeReading()];
    render(<BloodPressureSection readings={readings} onAdd={onAdd} onDelete={onDelete} />);
    expect(screen.getByLabelText('Blood pressure trend chart')).toBeInTheDocument();
  });

  it('shows validation error when submitting empty systolic/diastolic', async () => {
    render(<BloodPressureSection readings={[]} onAdd={onAdd} onDelete={onDelete} />);
    const form = screen.getByRole('form', { name: /log blood pressure reading/i });
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('calls onAdd with correct args on valid submit', async () => {
    const user = userEvent.setup();
    render(<BloodPressureSection readings={[]} onAdd={onAdd} onDelete={onDelete} />);

    await user.type(screen.getByLabelText('Systolic'), '118');
    await user.type(screen.getByLabelText('Diastolic'), '76');
    await user.type(screen.getByLabelText('Notes'), 'morning');
    await user.click(screen.getByRole('button', { name: /log reading/i }));

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith(118, 76, 'morning');
    });
  });

  it('clears form fields after successful submission', async () => {
    const user = userEvent.setup();
    render(<BloodPressureSection readings={[]} onAdd={onAdd} onDelete={onDelete} />);

    const systolicInput = screen.getByLabelText('Systolic') as HTMLInputElement;
    const diastolicInput = screen.getByLabelText('Diastolic') as HTMLInputElement;

    await user.type(systolicInput, '120');
    await user.type(diastolicInput, '80');
    await user.click(screen.getByRole('button', { name: /log reading/i }));

    await waitFor(() => {
      expect(systolicInput.value).toBe('');
      expect(diastolicInput.value).toBe('');
    });
  });

  it('opens confirmation modal when delete is clicked', async () => {
    const user = userEvent.setup();
    const readings = [makeReading({ id: 'r1' })];
    render(<BloodPressureSection readings={readings} onAdd={onAdd} onDelete={onDelete} />);

    await user.click(screen.getByRole('button', { name: /show history/i }));
    const deleteBtn = screen.getByRole('button', { name: /delete reading/i });
    await user.click(deleteBtn);

    expect(screen.getByText('Delete Reading')).toBeInTheDocument();
  });

  it('calls onDelete when confirmation is confirmed', async () => {
    const user = userEvent.setup();
    const readings = [makeReading({ id: 'r1' })];
    render(<BloodPressureSection readings={readings} onAdd={onAdd} onDelete={onDelete} />);

    await user.click(screen.getByRole('button', { name: /show history/i }));
    await user.click(screen.getByRole('button', { name: /delete reading/i }));
    await user.click(screen.getByRole('button', { name: /confirm delete/i }));

    expect(onDelete).toHaveBeenCalledWith('r1');
  });

  it('cancels delete when cancel is clicked', async () => {
    const user = userEvent.setup();
    const readings = [makeReading({ id: 'r1' })];
    render(<BloodPressureSection readings={readings} onAdd={onAdd} onDelete={onDelete} />);

    await user.click(screen.getByRole('button', { name: /show history/i }));
    await user.click(screen.getByRole('button', { name: /delete reading/i }));
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete Reading')).not.toBeInTheDocument();
  });

  it('shows error for zero systolic value', async () => {
    const user = userEvent.setup();
    render(<BloodPressureSection readings={[]} onAdd={onAdd} onDelete={onDelete} />);

    await user.type(screen.getByLabelText('Systolic'), '0');
    await user.type(screen.getByLabelText('Diastolic'), '80');
    await user.click(screen.getByRole('button', { name: /log reading/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('renders the since-date filter input', () => {
    render(<BloodPressureSection readings={[]} onAdd={onAdd} onDelete={onDelete} />);
    expect(screen.getByLabelText('Filter readings from date')).toBeInTheDocument();
  });

  it('filters avg when sinceDate is set', () => {
    const readings = [
      makeReading({ id: 'r1', systolic: 100, diastolic: 60, recorded_at: '2026-06-01T12:00:00Z' }),
      makeReading({ id: 'r2', systolic: 140, diastolic: 100, recorded_at: '2026-07-01T12:00:00Z' }),
    ];
    render(<BloodPressureSection readings={readings} onAdd={onAdd} onDelete={onDelete} />);
    fireEvent.change(screen.getByLabelText('Filter readings from date'), { target: { value: '2026-07-01' } });
    const avgEl = screen.getByLabelText('Average blood pressure');
    expect(avgEl.textContent).toContain('140');
    expect(avgEl.textContent).toContain('100');
    expect(avgEl.textContent).toContain('1 readings');
  });

  it('shows Avg since label when sinceDate is set', () => {
    const readings = [makeReading({ id: 'r1', recorded_at: '2026-07-01T12:00:00Z' })];
    render(<BloodPressureSection readings={readings} onAdd={onAdd} onDelete={onDelete} />);
    fireEvent.change(screen.getByLabelText('Filter readings from date'), { target: { value: '2026-07-01' } });
    expect(screen.getByLabelText('Average blood pressure').textContent).toContain('Avg since 2026-07-01');
  });

  it('shows [clear] button when sinceDate is set and hides it when cleared', async () => {
    const user = userEvent.setup();
    const readings = [makeReading({ id: 'r1', recorded_at: '2026-07-01T12:00:00Z' })];
    render(<BloodPressureSection readings={readings} onAdd={onAdd} onDelete={onDelete} />);
    expect(screen.queryByRole('button', { name: /\[clear\]/i })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter readings from date'), { target: { value: '2026-07-01' } });
    expect(screen.getByRole('button', { name: /\[clear\]/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /\[clear\]/i }));
    expect(screen.queryByRole('button', { name: /\[clear\]/i })).not.toBeInTheDocument();
  });

  it('restores full avg after clearing sinceDate', async () => {
    const user = userEvent.setup();
    const readings = [
      makeReading({ id: 'r1', systolic: 100, diastolic: 60, recorded_at: '2026-06-01T12:00:00Z' }),
      makeReading({ id: 'r2', systolic: 140, diastolic: 100, recorded_at: '2026-07-01T12:00:00Z' }),
    ];
    render(<BloodPressureSection readings={readings} onAdd={onAdd} onDelete={onDelete} />);
    fireEvent.change(screen.getByLabelText('Filter readings from date'), { target: { value: '2026-07-01' } });
    await user.click(screen.getByRole('button', { name: /\[clear\]/i }));
    const avgEl = screen.getByLabelText('Average blood pressure');
    expect(avgEl.textContent).toContain('2 readings');
    expect(avgEl.textContent).not.toContain('Avg since');
  });

  it('hides chart when sinceDate filters out all readings', () => {
    const readings = [makeReading({ id: 'r1', recorded_at: new Date().toISOString() })];
    render(<BloodPressureSection readings={readings} onAdd={onAdd} onDelete={onDelete} />);
    expect(screen.getByLabelText('Blood pressure trend chart')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter readings from date'), { target: { value: '2029-01-01' } });
    expect(screen.queryByLabelText('Blood pressure trend chart')).not.toBeInTheDocument();
  });
});
