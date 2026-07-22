import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StepsSection } from './steps-section';
import type { StepsReading } from './steps-section';

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const makeReading = (overrides: Partial<StepsReading> = {}): StepsReading => ({
  id: 'r1',
  steps: 10000,
  notes: '',
  recorded_at: new Date().toISOString(),
  ...overrides,
});

describe('StepsSection', () => {
  const onAdd = vi.fn().mockResolvedValue(undefined);
  const onDelete = vi.fn();
  const onTargetChange = vi.fn();

  beforeEach(() => {
    onAdd.mockClear();
    onDelete.mockClear();
    onTargetChange.mockClear();
  });

  it('renders the section heading', () => {
    render(<StepsSection readings={[]} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    expect(screen.getByText('Steps')).toBeInTheDocument();
  });

  it('shows empty state when no readings', () => {
    render(<StepsSection readings={[]} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    expect(screen.getByText(/no readings logged/i)).toBeInTheDocument();
  });

  it('shows target button with formatted value', () => {
    render(<StepsSection readings={[]} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    expect(screen.getByRole('button', { name: /edit daily target/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit daily target/i }).textContent).toContain('15,000');
  });

  it('shows history toggle when readings are present', () => {
    const readings = [makeReading()];
    render(<StepsSection readings={readings} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    expect(screen.getByRole('button', { name: /show history/i })).toBeInTheDocument();
  });

  it('hides reading rows by default', () => {
    const readings = [makeReading({ id: 'r1', steps: 12000 })];
    render(<StepsSection readings={readings} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    expect(screen.queryByText(/12,000 steps/i)).not.toBeInTheDocument();
  });

  it('shows reading rows after toggling history on', async () => {
    const user = userEvent.setup();
    const readings = [
      makeReading({ id: 'r1', steps: 12000 }),
      makeReading({ id: 'r2', steps: 8500, notes: 'rainy day' }),
    ];
    render(<StepsSection readings={readings} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    await user.click(screen.getByRole('button', { name: /show history/i }));
    expect(screen.getByText('12,000 steps')).toBeInTheDocument();
    expect(screen.getByText('8,500 steps')).toBeInTheDocument();
    expect(screen.getByText('rainy day')).toBeInTheDocument();
  });

  it('hides reading rows after toggling history off', async () => {
    const user = userEvent.setup();
    const readings = [makeReading({ id: 'r1', steps: 12000 })];
    render(<StepsSection readings={readings} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    await user.click(screen.getByRole('button', { name: /show history/i }));
    expect(screen.getByText('12,000 steps')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /hide history/i }));
    expect(screen.queryByText('12,000 steps')).not.toBeInTheDocument();
  });

  it('shows avg steps when readings exist', () => {
    const readings = [
      makeReading({ id: 'r1', steps: 10000 }),
      makeReading({ id: 'r2', steps: 20000 }),
    ];
    render(<StepsSection readings={readings} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    const avgEl = screen.getByLabelText('Average steps');
    expect(avgEl).toBeInTheDocument();
    expect(avgEl.textContent).toContain('15,000');
    expect(avgEl.textContent).toContain('2 readings');
  });

  it('hides avg when no readings', () => {
    render(<StepsSection readings={[]} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    expect(screen.queryByLabelText('Average steps')).not.toBeInTheDocument();
  });

  it('does not render chart when no readings', () => {
    render(<StepsSection readings={[]} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    expect(screen.queryByLabelText('Steps trend chart')).not.toBeInTheDocument();
  });

  it('renders chart when readings are present', () => {
    const readings = [makeReading()];
    render(<StepsSection readings={readings} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    expect(screen.getByLabelText('Steps trend chart')).toBeInTheDocument();
  });

  it('shows validation error when submitting zero steps', async () => {
    render(<StepsSection readings={[]} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    const form = screen.getByRole('form', { name: /log steps/i });
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('calls onAdd with correct args on valid submit', async () => {
    const user = userEvent.setup();
    render(<StepsSection readings={[]} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);

    await user.type(screen.getByLabelText('Steps'), '13500');
    await user.type(screen.getByLabelText('Notes'), 'morning walk');
    await user.click(screen.getByRole('button', { name: /log steps/i }));

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith(13500, 'morning walk', expect.any(String));
    });
  });

  it('clears form fields after successful submission', async () => {
    const user = userEvent.setup();
    render(<StepsSection readings={[]} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);

    const stepsInput = screen.getByLabelText('Steps') as HTMLInputElement;
    await user.type(stepsInput, '8000');
    await user.click(screen.getByRole('button', { name: /log steps/i }));

    await waitFor(() => {
      expect(stepsInput.value).toBe('');
    });
  });

  it('opens target edit form when target button is clicked', async () => {
    const user = userEvent.setup();
    render(<StepsSection readings={[]} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    await user.click(screen.getByRole('button', { name: /edit daily target/i }));
    expect(screen.getByRole('button', { name: /^set$/i })).toBeInTheDocument();
  });

  it('calls onTargetChange with new value', async () => {
    const user = userEvent.setup();
    render(<StepsSection readings={[]} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    await user.click(screen.getByRole('button', { name: /edit daily target/i }));
    const input = screen.getByLabelText('Daily target') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '12000');
    await user.click(screen.getByRole('button', { name: /^set$/i }));
    expect(onTargetChange).toHaveBeenCalledWith(12000);
  });

  it('cancels target edit without calling onTargetChange', async () => {
    const user = userEvent.setup();
    render(<StepsSection readings={[]} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    await user.click(screen.getByRole('button', { name: /edit daily target/i }));
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onTargetChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /edit daily target/i })).toBeInTheDocument();
  });

  it('opens confirmation modal when delete is clicked', async () => {
    const user = userEvent.setup();
    const readings = [makeReading({ id: 'r1' })];
    render(<StepsSection readings={readings} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);

    await user.click(screen.getByRole('button', { name: /show history/i }));
    await user.click(screen.getByRole('button', { name: /delete reading/i }));

    expect(screen.getByText('Delete Reading')).toBeInTheDocument();
  });

  it('calls onDelete when confirmation is confirmed', async () => {
    const user = userEvent.setup();
    const readings = [makeReading({ id: 'r1' })];
    render(<StepsSection readings={readings} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);

    await user.click(screen.getByRole('button', { name: /show history/i }));
    await user.click(screen.getByRole('button', { name: /delete reading/i }));
    await user.click(screen.getByRole('button', { name: /confirm delete/i }));

    expect(onDelete).toHaveBeenCalledWith('r1');
  });

  it('cancels delete when cancel is clicked', async () => {
    const user = userEvent.setup();
    const readings = [makeReading({ id: 'r1' })];
    render(<StepsSection readings={readings} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);

    await user.click(screen.getByRole('button', { name: /show history/i }));
    await user.click(screen.getByRole('button', { name: /delete reading/i }));
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete Reading')).not.toBeInTheDocument();
  });

  it('renders the since-date filter input and preset buttons', () => {
    render(<StepsSection readings={[]} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    expect(screen.getByLabelText('Filter readings from date')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /30d/i })).toBeInTheDocument();
  });

  it('filters avg when sinceDate is set', () => {
    const readings = [
      makeReading({ id: 'r1', steps: 5000, recorded_at: '2026-06-01T12:00:00Z' }),
      makeReading({ id: 'r2', steps: 15000, recorded_at: '2026-07-01T12:00:00Z' }),
    ];
    render(<StepsSection readings={readings} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    fireEvent.change(screen.getByLabelText('Filter readings from date'), { target: { value: '2026-07-01' } });
    const avgEl = screen.getByLabelText('Average steps');
    expect(avgEl.textContent).toContain('15,000');
    expect(avgEl.textContent).toContain('1 readings');
  });

  it('shows Avg since label when sinceDate is set', () => {
    const readings = [makeReading({ id: 'r1', steps: 10000, recorded_at: '2026-07-01T12:00:00Z' })];
    render(<StepsSection readings={readings} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    fireEvent.change(screen.getByLabelText('Filter readings from date'), { target: { value: '2026-07-01' } });
    expect(screen.getByLabelText('Average steps').textContent).toContain('Avg since 2026-07-01');
  });

  it('restores full avg after clearing sinceDate', async () => {
    const user = userEvent.setup();
    const readings = [
      makeReading({ id: 'r1', steps: 5000, recorded_at: '2026-06-01T12:00:00Z' }),
      makeReading({ id: 'r2', steps: 15000, recorded_at: '2026-07-01T12:00:00Z' }),
    ];
    render(<StepsSection readings={readings} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    fireEvent.change(screen.getByLabelText('Filter readings from date'), { target: { value: '2026-07-01' } });
    await user.click(screen.getByRole('button', { name: /\[clear\]/i }));
    expect(screen.getByLabelText('Average steps').textContent).toContain('2 readings');
    expect(screen.getByLabelText('Average steps').textContent).not.toContain('Avg since');
  });

  it('switches time range presets when clicked', async () => {
    const user = userEvent.setup();
    const readings = [
      makeReading({ id: 'r1', steps: 5000, recorded_at: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString() }),
      makeReading({ id: 'r2', steps: 15000, recorded_at: new Date().toISOString() }),
    ];
    render(<StepsSection readings={readings} target={15000} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);

    expect(screen.getByLabelText('Average steps').textContent).toContain('1 readings');
    await user.click(screen.getByRole('button', { name: /90d/i }));
    expect(screen.getByLabelText('Average steps').textContent).toContain('2 readings');
  });
});
