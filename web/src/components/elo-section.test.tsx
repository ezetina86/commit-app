import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EloSection } from './elo-section';
import type { EloReading } from './elo-section';

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const makeReading = (overrides: Partial<EloReading> = {}): EloReading => ({
  id: 'e1',
  platform: 'chesscom',
  rating: 700,
  notes: '',
  recorded_at: new Date().toISOString(),
  ...overrides,
});

describe('EloSection', () => {
  const onAdd = vi.fn().mockResolvedValue(undefined);
  const onDelete = vi.fn();
  const onTargetChange = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    onAdd.mockClear();
    onDelete.mockClear();
    onTargetChange.mockClear();
  });

  it('renders the section heading', () => {
    render(<EloSection readings={[]} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    expect(screen.getByText('Chess ELO Rating')).toBeInTheDocument();
  });

  it('shows the current target', () => {
    render(<EloSection readings={[]} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    expect(screen.getByRole('button', { name: /elo target 800/i })).toBeInTheDocument();
  });

  it('shows empty state when no readings', () => {
    render(<EloSection readings={[]} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    expect(screen.getByText(/no ratings logged/i)).toBeInTheDocument();
  });

  it('renders history toggle with count when readings present', () => {
    const readings = [makeReading({ id: 'e1' }), makeReading({ id: 'e2' })];
    render(<EloSection readings={readings} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    expect(screen.getByRole('button', { name: /show history/i })).toBeInTheDocument();
  });

  it('hides reading rows by default', () => {
    const readings = [makeReading({ id: 'e1', rating: 720 })];
    render(<EloSection readings={readings} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    expect(screen.queryByRole('list', { name: /elo readings/i })).not.toBeInTheDocument();
  });

  it('shows readings after toggling history on', async () => {
    const user = userEvent.setup();
    const readings = [
      makeReading({ id: 'e1', platform: 'chesscom', rating: 720 }),
      makeReading({ id: 'e2', platform: 'duolingo', rating: 650 }),
    ];
    render(<EloSection readings={readings} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    await user.click(screen.getByRole('button', { name: /show history/i }));
    const list = screen.getByRole('list', { name: /elo readings/i });
    expect(list).toHaveTextContent('720');
    expect(list).not.toHaveTextContent('650');
  });

  it('hides readings after toggling history off', async () => {
    const user = userEvent.setup();
    const readings = [makeReading({ id: 'e1', rating: 720 })];
    render(<EloSection readings={readings} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    await user.click(screen.getByRole('button', { name: /show history/i }));
    expect(screen.getByRole('list', { name: /elo readings/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /hide history/i }));
    expect(screen.queryByRole('list', { name: /elo readings/i })).not.toBeInTheDocument();
  });

  it('shows validation error when rating is empty', async () => {
    const user = userEvent.setup();
    render(<EloSection readings={[]} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    await user.click(screen.getByRole('button', { name: /log rating/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/rating must be greater than 0/i);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('calls onAdd without notes and clears form', async () => {
    const user = userEvent.setup();
    render(<EloSection readings={[]} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    await user.selectOptions(screen.getByRole('combobox', { name: /platform/i }), 'duolingo');
    await user.clear(screen.getByRole('spinbutton', { name: /elo rating/i }));
    await user.type(screen.getByRole('spinbutton', { name: /elo rating/i }), '750');
    await user.click(screen.getByRole('button', { name: /log rating/i }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith('duolingo', 750));
  });

  it('form has no notes field', () => {
    render(<EloSection readings={[]} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    expect(screen.queryByRole('textbox', { name: /notes/i })).not.toBeInTheDocument();
  });

  it('opens target edit input on target button click', async () => {
    const user = userEvent.setup();
    render(<EloSection readings={[]} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    await user.click(screen.getByRole('button', { name: /elo target 800/i }));
    expect(screen.getByRole('spinbutton', { name: /elo target/i })).toBeInTheDocument();
  });

  it('calls onTargetChange with new value on save', async () => {
    const user = userEvent.setup();
    render(<EloSection readings={[]} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    await user.click(screen.getByRole('button', { name: /elo target 800/i }));
    const input = screen.getByRole('spinbutton', { name: /elo target/i });
    await user.clear(input);
    await user.type(input, '1200');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(onTargetChange).toHaveBeenCalledWith(1200));
  });

  it('cancels target edit without calling onTargetChange', async () => {
    const user = userEvent.setup();
    render(<EloSection readings={[]} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    await user.click(screen.getByRole('button', { name: /elo target 800/i }));
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onTargetChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /elo target 800/i })).toBeInTheDocument();
  });

  it('reverts target and closes edit on invalid (zero) save', async () => {
    const user = userEvent.setup();
    render(<EloSection readings={[]} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    await user.click(screen.getByRole('button', { name: /elo target 800/i }));
    const input = screen.getByRole('spinbutton', { name: /elo target/i });
    await user.clear(input);
    await user.type(input, '0');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onTargetChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /elo target 800/i })).toBeInTheDocument();
  });

  it('opens delete confirm modal and calls onDelete', async () => {
    const user = userEvent.setup();
    const readings = [makeReading({ id: 'e1', rating: 720 })];
    render(<EloSection readings={readings} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    await user.click(screen.getByRole('button', { name: /show history/i }));
    await user.click(screen.getByRole('button', { name: /delete elo reading/i }));
    expect(screen.getByText(/permanently delete this elo reading/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /confirm delete/i }));
    expect(onDelete).toHaveBeenCalledWith('e1');
  });

  it('cancel delete modal keeps reading intact', async () => {
    const user = userEvent.setup();
    const readings = [makeReading({ id: 'e1', rating: 720 })];
    render(<EloSection readings={readings} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    await user.click(screen.getByRole('button', { name: /show history/i }));
    await user.click(screen.getByRole('button', { name: /delete elo reading/i }));
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('renders platform tabs for chess.com and duolingo', () => {
    render(<EloSection readings={[]} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    expect(screen.getByRole('tab', { name: /chess\.com/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /duolingo/i })).toBeInTheDocument();
  });

  it('chess.com tab is selected by default', () => {
    render(<EloSection readings={[]} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    expect(screen.getByRole('tab', { name: /chess\.com/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /duolingo/i })).toHaveAttribute('aria-selected', 'false');
  });

  it('switching to duolingo tab shows only duolingo readings in history', async () => {
    const user = userEvent.setup();
    const readings = [
      makeReading({ id: 'e1', platform: 'chesscom', rating: 720 }),
      makeReading({ id: 'e2', platform: 'duolingo', rating: 650 }),
    ];
    render(<EloSection readings={readings} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    await user.click(screen.getByRole('tab', { name: /duolingo/i }));
    await user.click(screen.getByRole('button', { name: /show history/i }));
    const list = screen.getByRole('list', { name: /elo readings/i });
    expect(list).toHaveTextContent('650');
    expect(list).not.toHaveTextContent('720');
  });

  it('switching tab pre-selects form platform', async () => {
    const user = userEvent.setup();
    render(<EloSection readings={[]} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    await user.click(screen.getByRole('tab', { name: /duolingo/i }));
    expect(screen.getByRole('combobox', { name: /platform/i })).toHaveValue('duolingo');
  });

  it('shows empty state when selected platform has no readings', async () => {
    const user = userEvent.setup();
    const readings = [makeReading({ id: 'e1', platform: 'chesscom', rating: 720 })];
    render(<EloSection readings={readings} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    await user.click(screen.getByRole('tab', { name: /duolingo/i }));
    expect(screen.getByText(/no ratings logged/i)).toBeInTheDocument();
  });

  it('history count reflects selected platform only', () => {
    const readings = [
      makeReading({ id: 'e1', platform: 'chesscom', rating: 720 }),
      makeReading({ id: 'e2', platform: 'chesscom', rating: 730 }),
      makeReading({ id: 'e3', platform: 'duolingo', rating: 650 }),
    ];
    render(<EloSection readings={readings} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    expect(screen.getByRole('button', { name: /show history \(2\)/i })).toBeInTheDocument();
  });

  it('renders the since-date filter input', () => {
    render(<EloSection readings={[]} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    expect(screen.getByLabelText('Filter ratings from date')).toBeInTheDocument();
  });

  it('shows avg rating when readings exist', () => {
    const readings = [
      makeReading({ id: 'r1', platform: 'chesscom', rating: 700, recorded_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() }),
      makeReading({ id: 'r2', platform: 'chesscom', rating: 900, recorded_at: new Date().toISOString() }),
    ];
    render(<EloSection readings={readings} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    const avgEl = screen.getByLabelText('Average ELO rating');
    expect(avgEl.textContent).toContain('800');
    expect(avgEl.textContent).toContain('2 readings');
  });

  it('filters avg when sinceDate is set', () => {
    const readings = [
      makeReading({ id: 'r1', platform: 'chesscom', rating: 700, recorded_at: '2026-06-01T12:00:00Z' }),
      makeReading({ id: 'r2', platform: 'chesscom', rating: 900, recorded_at: '2026-07-01T12:00:00Z' }),
    ];
    render(<EloSection readings={readings} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    fireEvent.change(screen.getByLabelText('Filter ratings from date'), { target: { value: '2026-07-01' } });
    const avgEl = screen.getByLabelText('Average ELO rating');
    expect(avgEl.textContent).toContain('900');
    expect(avgEl.textContent).toContain('1 readings');
  });

  it('shows Avg since label when sinceDate is set', () => {
    const readings = [makeReading({ id: 'r1', platform: 'chesscom', rating: 800, recorded_at: '2026-07-01T12:00:00Z' })];
    render(<EloSection readings={readings} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    fireEvent.change(screen.getByLabelText('Filter ratings from date'), { target: { value: '2026-07-01' } });
    expect(screen.getByLabelText('Average ELO rating').textContent).toContain('Avg since 2026-07-01');
  });

  it('restores full avg after clearing sinceDate', async () => {
    const user = userEvent.setup();
    const readings = [
      makeReading({ id: 'r1', platform: 'chesscom', rating: 700, recorded_at: '2026-06-01T12:00:00Z' }),
      makeReading({ id: 'r2', platform: 'chesscom', rating: 900, recorded_at: '2026-07-01T12:00:00Z' }),
    ];
    render(<EloSection readings={readings} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    fireEvent.change(screen.getByLabelText('Filter ratings from date'), { target: { value: '2026-07-01' } });
    await user.click(screen.getByRole('button', { name: /\[clear\]/i }));
    expect(screen.getByLabelText('Average ELO rating').textContent).toContain('2 readings');
    expect(screen.getByLabelText('Average ELO rating').textContent).not.toContain('Avg since');
  });

  it('hides chart when sinceDate filters out all readings', () => {
    const readings = [makeReading({ id: 'r1', platform: 'chesscom', rating: 800, recorded_at: new Date().toISOString() })];
    render(<EloSection readings={readings} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    expect(screen.getByLabelText('Chess ELO trend chart')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter ratings from date'), { target: { value: '2029-01-01' } });
    expect(screen.queryByLabelText('Chess ELO trend chart')).not.toBeInTheDocument();
  });

  it('sinceDate persists across platform tab switch', async () => {
    const user = userEvent.setup();
    const readings = [
      makeReading({ id: 'r1', platform: 'chesscom', rating: 800, recorded_at: '2026-07-01T12:00:00Z' }),
      makeReading({ id: 'r2', platform: 'duolingo', rating: 500, recorded_at: '2026-07-01T12:00:00Z' }),
    ];
    render(<EloSection readings={readings} target={800} onAdd={onAdd} onDelete={onDelete} onTargetChange={onTargetChange} />);
    fireEvent.change(screen.getByLabelText('Filter ratings from date'), { target: { value: '2026-07-01' } });
    await user.click(screen.getByRole('tab', { name: /duolingo/i }));
    expect(screen.getByLabelText('Average ELO rating').textContent).toContain('Avg since 2026-07-01');
  });
});
