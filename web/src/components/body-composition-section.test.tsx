import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BodyCompositionSection, type WeightReading, type CircumferenceReading } from './body-composition-section';

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

const makeWeight = (overrides: Partial<WeightReading> = {}): WeightReading => ({
  id: 'w1',
  weight: 185.0,
  notes: '',
  recorded_at: daysAgo(1),
  ...overrides,
});

const makeCircumference = (overrides: Partial<CircumferenceReading> = {}): CircumferenceReading => ({
  id: 'c1',
  abdomen: 36.0,
  biceps: 14.0,
  quads: 22.0,
  notes: '',
  recorded_at: daysAgo(1),
  ...overrides,
});

const defaultProps = {
  weightReadings: [] as WeightReading[],
  circumferenceReadings: [] as CircumferenceReading[],
  onAddWeight: vi.fn().mockResolvedValue(undefined),
  onDeleteWeight: vi.fn().mockResolvedValue(undefined),
  onAddCircumference: vi.fn().mockResolvedValue(undefined),
  onDeleteCircumference: vi.fn().mockResolvedValue(undefined),
};

describe('BodyCompositionSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Rendering ────────────────────────────────────────────────────────────

  it('renders section header', () => {
    render(<BodyCompositionSection {...defaultProps} />);
    expect(screen.getByText('Body Composition')).toBeInTheDocument();
  });

  it('does not render alert banner when alertState is null (empty arrays)', () => {
    render(<BodyCompositionSection {...defaultProps} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows empty state when no weight readings', () => {
    render(<BodyCompositionSection {...defaultProps} />);
    // Both weight and circumference show "No Readings Logged" — confirm at least one exists
    expect(screen.getAllByText(/no readings logged/i).length).toBeGreaterThanOrEqual(1);
  });

  it('does not render weight chart when readings are empty', () => {
    render(<BodyCompositionSection {...defaultProps} />);
    expect(screen.queryByLabelText('Weight trend chart')).not.toBeInTheDocument();
  });

  it('renders weight chart when readings are present', () => {
    render(<BodyCompositionSection {...defaultProps} weightReadings={[makeWeight()]} />);
    expect(screen.getByLabelText('Weight trend chart')).toBeInTheDocument();
  });

  it('does not render circumference chart when readings are empty', () => {
    render(<BodyCompositionSection {...defaultProps} />);
    expect(screen.queryByLabelText('Circumference trend chart')).not.toBeInTheDocument();
  });

  it('renders circumference chart when readings are present', () => {
    render(<BodyCompositionSection {...defaultProps} circumferenceReadings={[makeCircumference()]} />);
    expect(screen.getByLabelText('Circumference trend chart')).toBeInTheDocument();
  });

  // ── Alert: null (insufficient data) ──────────────────────────────────────

  it('no alert with only 1 weight reading in last 7 days', () => {
    render(<BodyCompositionSection {...defaultProps} weightReadings={[makeWeight()]} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('no alert with only 1 circumference reading in last 14 days', () => {
    render(<BodyCompositionSection {...defaultProps} circumferenceReadings={[makeCircumference()]} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // ── Alert: catabolism_warning ─────────────────────────────────────────────
  // delta = (196.9 - 200) / 200 * 100 = -1.55% → < -1.5% → catabolism

  it('shows catabolism_warning when 7-day weight loss exceeds 1.5%', () => {
    const readings = [
      makeWeight({ id: 'w-old', weight: 200, recorded_at: daysAgo(6) }),
      makeWeight({ id: 'w-new', weight: 196.9, recorded_at: daysAgo(1) }),
    ];
    render(<BodyCompositionSection {...defaultProps} weightReadings={readings} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('alert').textContent).toMatch(/catabolism/i);
  });

  it('no catabolism_warning when weight loss is exactly at threshold (1.5% exactly is not triggered)', () => {
    // delta = -1.5% exactly: latest = 200 * (1 - 0.015) = 197.0 → NOT < -1.5%
    const readings = [
      makeWeight({ id: 'w-old', weight: 200, recorded_at: daysAgo(6) }),
      makeWeight({ id: 'w-new', weight: 197.0, recorded_at: daysAgo(1) }),
    ];
    render(<BodyCompositionSection {...defaultProps} weightReadings={readings} />);
    // -1.5% is not strictly less than -1.5
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // ── Alert: protein_deficit_warning ───────────────────────────────────────
  // limb shrinking + weight loss > 1.0% in 7 days

  it('shows protein_deficit_warning when limb shrinks and weight drops > 1%', () => {
    const weightReadings = [
      makeWeight({ id: 'w-old', weight: 200, recorded_at: daysAgo(6) }),
      makeWeight({ id: 'w-new', weight: 197.8, recorded_at: daysAgo(1) }), // -1.1%
    ];
    const circumferenceReadings = [
      makeCircumference({ id: 'c-old', abdomen: 38, biceps: 14, quads: 22, recorded_at: daysAgo(13) }),
      makeCircumference({ id: 'c-new', abdomen: 37, biceps: 13.5, quads: 22, recorded_at: daysAgo(1) }), // biceps shrinking
    ];
    render(<BodyCompositionSection {...defaultProps} weightReadings={weightReadings} circumferenceReadings={circumferenceReadings} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('alert').textContent).toMatch(/protein/i);
  });

  // ── Alert: optimal ───────────────────────────────────────────────────────
  // abdomen decreasing, biceps and quads stable/increasing

  it('shows optimal when waist shrinks and limbs stable or growing', () => {
    const circumferenceReadings = [
      makeCircumference({ id: 'c-old', abdomen: 38, biceps: 14, quads: 22, recorded_at: daysAgo(13) }),
      makeCircumference({ id: 'c-new', abdomen: 36, biceps: 14.1, quads: 22.2, recorded_at: daysAgo(1) }),
    ];
    render(<BodyCompositionSection {...defaultProps} circumferenceReadings={circumferenceReadings} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('alert').textContent).toMatch(/optimal/i);
  });

  // ── Alert: catabolism_warning priority ───────────────────────────────────

  it('shows catabolism_warning even when protein_deficit conditions also met', () => {
    // Both conditions: weight loss > 1.5% AND limb shrinking + weight loss > 1%
    const weightReadings = [
      makeWeight({ id: 'w-old', weight: 200, recorded_at: daysAgo(6) }),
      makeWeight({ id: 'w-new', weight: 196.5, recorded_at: daysAgo(1) }), // -1.75%
    ];
    const circumferenceReadings = [
      makeCircumference({ id: 'c-old', abdomen: 38, biceps: 14, quads: 22, recorded_at: daysAgo(13) }),
      makeCircumference({ id: 'c-new', abdomen: 37, biceps: 13.5, quads: 22, recorded_at: daysAgo(1) }),
    ];
    render(<BodyCompositionSection {...defaultProps} weightReadings={weightReadings} circumferenceReadings={circumferenceReadings} />);
    expect(screen.getByRole('alert').textContent).toMatch(/catabolism/i);
  });

  // ── Alert: banner message content ────────────────────────────────────────

  it('renders catabolism alert message with correct content', () => {
    const readings = [
      makeWeight({ id: 'w-old', weight: 200, recorded_at: daysAgo(6) }),
      makeWeight({ id: 'w-new', weight: 196.9, recorded_at: daysAgo(1) }),
    ];
    render(<BodyCompositionSection {...defaultProps} weightReadings={readings} />);
    expect(screen.getByRole('alert').textContent).toContain('Catabolism risk');
  });

  it('renders optimal alert message with correct content', () => {
    const circumferenceReadings = [
      makeCircumference({ id: 'c-old', abdomen: 38, biceps: 14, quads: 22, recorded_at: daysAgo(13) }),
      makeCircumference({ id: 'c-new', abdomen: 36, biceps: 14.1, quads: 22.2, recorded_at: daysAgo(1) }),
    ];
    render(<BodyCompositionSection {...defaultProps} circumferenceReadings={circumferenceReadings} />);
    expect(screen.getByRole('alert').textContent).toContain('Optimal metabolic response');
  });

  // ── Weight form ───────────────────────────────────────────────────────────

  it('shows validation error when weight field is empty on submit', async () => {
    render(<BodyCompositionSection {...defaultProps} />);
    fireEvent.submit(screen.getByRole('form', { name: /log weight/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(defaultProps.onAddWeight).not.toHaveBeenCalled();
  });

  it('calls onAddWeight with correct args on valid submit', async () => {
    const user = userEvent.setup();
    render(<BodyCompositionSection {...defaultProps} />);
    await user.type(screen.getByLabelText('Weight'), '185.5');
    await user.click(screen.getByRole('button', { name: /log weight/i }));
    await waitFor(() => {
      expect(defaultProps.onAddWeight).toHaveBeenCalledWith(185.5, '', expect.any(String));
    });
  });

  it('calls onAddWeight with notes when provided', async () => {
    const user = userEvent.setup();
    render(<BodyCompositionSection {...defaultProps} />);
    const weightForm = screen.getByRole('form', { name: /log weight/i });
    await user.type(within(weightForm).getByLabelText('Weight'), '185.5');
    await user.type(within(weightForm).getByLabelText('Notes'), 'morning weigh-in');
    await user.click(within(weightForm).getByRole('button', { name: /log weight/i }));
    await waitFor(() => {
      expect(defaultProps.onAddWeight).toHaveBeenCalledWith(185.5, 'morning weigh-in', expect.any(String));
    });
  });

  it('clears weight form after successful submission', async () => {
    const user = userEvent.setup();
    render(<BodyCompositionSection {...defaultProps} />);
    const weightInput = screen.getByLabelText('Weight') as HTMLInputElement;
    await user.type(weightInput, '185.5');
    await user.click(screen.getByRole('button', { name: /log weight/i }));
    await waitFor(() => {
      expect(weightInput.value).toBe('');
    });
  });

  // ── Circumference form ────────────────────────────────────────────────────

  it('shows validation error when circumference fields are empty on submit', async () => {
    render(<BodyCompositionSection {...defaultProps} />);
    fireEvent.submit(screen.getByRole('form', { name: /log circumference/i }));
    await waitFor(() => {
      // weight form error + circ form error - find the circ one
      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThan(0);
    });
    expect(defaultProps.onAddCircumference).not.toHaveBeenCalled();
  });

  it('calls onAddCircumference with correct args on valid submit', async () => {
    const user = userEvent.setup();
    render(<BodyCompositionSection {...defaultProps} />);
    await user.type(screen.getByLabelText('Abdomen'), '36.5');
    await user.type(screen.getByLabelText('Biceps'), '14.0');
    await user.type(screen.getByLabelText('Quads'), '22.0');
    await user.click(screen.getByRole('button', { name: /log measurements/i }));
    await waitFor(() => {
      expect(defaultProps.onAddCircumference).toHaveBeenCalledWith(36.5, 14.0, 22.0, '', expect.any(String));
    });
  });

  it('clears circumference form after successful submission', async () => {
    const user = userEvent.setup();
    render(<BodyCompositionSection {...defaultProps} />);
    const abdomenInput = screen.getByLabelText('Abdomen') as HTMLInputElement;
    await user.type(abdomenInput, '36.5');
    await user.type(screen.getByLabelText('Biceps'), '14.0');
    await user.type(screen.getByLabelText('Quads'), '22.0');
    await user.click(screen.getByRole('button', { name: /log measurements/i }));
    await waitFor(() => {
      expect(abdomenInput.value).toBe('');
    });
  });

  // ── Delete weight ─────────────────────────────────────────────────────────

  it('opens weight delete confirm modal when delete button is clicked', async () => {
    const user = userEvent.setup();
    const readings = [makeWeight({ id: 'w1' })];
    render(<BodyCompositionSection {...defaultProps} weightReadings={readings} />);

    await user.click(screen.getByRole('button', { name: /show history/i }));
    await user.click(screen.getByRole('button', { name: /delete weight reading/i }));

    expect(screen.getByText('Delete Reading')).toBeInTheDocument();
    expect(screen.getByText(/permanently delete this weight reading/i)).toBeInTheDocument();
  });

  it('calls onDeleteWeight when weight delete is confirmed', async () => {
    const user = userEvent.setup();
    const readings = [makeWeight({ id: 'w1' })];
    render(<BodyCompositionSection {...defaultProps} weightReadings={readings} />);

    await user.click(screen.getByRole('button', { name: /show history/i }));
    await user.click(screen.getByRole('button', { name: /delete weight reading/i }));
    await user.click(screen.getByRole('button', { name: /confirm delete/i }));

    expect(defaultProps.onDeleteWeight).toHaveBeenCalledWith('w1');
  });

  it('cancels weight delete when cancel is clicked', async () => {
    const user = userEvent.setup();
    const readings = [makeWeight({ id: 'w1' })];
    render(<BodyCompositionSection {...defaultProps} weightReadings={readings} />);

    await user.click(screen.getByRole('button', { name: /show history/i }));
    await user.click(screen.getByRole('button', { name: /delete weight reading/i }));
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(defaultProps.onDeleteWeight).not.toHaveBeenCalled();
    expect(screen.queryByText(/permanently delete this weight reading/i)).not.toBeInTheDocument();
  });

  // ── Delete circumference ──────────────────────────────────────────────────

  it('opens circumference delete confirm modal when delete button is clicked', async () => {
    const user = userEvent.setup();
    const readings = [makeCircumference({ id: 'c1' })];
    render(<BodyCompositionSection {...defaultProps} circumferenceReadings={readings} />);

    await user.click(screen.getByRole('button', { name: /show history/i }));
    await user.click(screen.getByRole('button', { name: /delete circumference reading/i }));

    expect(screen.getByText('Delete Reading')).toBeInTheDocument();
    expect(screen.getByText(/permanently delete this circumference reading/i)).toBeInTheDocument();
  });

  it('calls onDeleteCircumference when circumference delete is confirmed', async () => {
    const user = userEvent.setup();
    const readings = [makeCircumference({ id: 'c1' })];
    render(<BodyCompositionSection {...defaultProps} circumferenceReadings={readings} />);

    await user.click(screen.getByRole('button', { name: /show history/i }));
    await user.click(screen.getByRole('button', { name: /delete circumference reading/i }));
    await user.click(screen.getByRole('button', { name: /confirm delete/i }));

    expect(defaultProps.onDeleteCircumference).toHaveBeenCalledWith('c1');
  });

  it('cancels circumference delete when cancel is clicked', async () => {
    const user = userEvent.setup();
    const readings = [makeCircumference({ id: 'c1' })];
    render(<BodyCompositionSection {...defaultProps} circumferenceReadings={readings} />);

    await user.click(screen.getByRole('button', { name: /show history/i }));
    await user.click(screen.getByRole('button', { name: /delete circumference reading/i }));
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(defaultProps.onDeleteCircumference).not.toHaveBeenCalled();
    expect(screen.queryByText(/permanently delete this circumference reading/i)).not.toBeInTheDocument();
  });

  // ── Since-date filter helpers ─────────────────────────────────────────────

  const onAddWeight = vi.fn().mockResolvedValue(undefined);
  const onDeleteWeight = vi.fn().mockResolvedValue(undefined);
  const onAddCircumference = vi.fn().mockResolvedValue(undefined);
  const onDeleteCircumference = vi.fn().mockResolvedValue(undefined);

  const makeWeightReading = (overrides: Partial<WeightReading> = {}): WeightReading => ({
    id: 'w1',
    weight: 180,
    notes: '',
    recorded_at: '2026-07-01T12:00:00Z',
    ...overrides,
  });

  const makeCircumferenceReading = (overrides: Partial<CircumferenceReading> = {}): CircumferenceReading => ({
    id: 'c1',
    abdomen: 90,
    biceps: 35,
    quads: 55,
    notes: '',
    recorded_at: '2026-07-01T12:00:00Z',
    ...overrides,
  });

  it('renders weight since-date filter input', () => {
    render(<BodyCompositionSection weightReadings={[]} circumferenceReadings={[]} onAddWeight={onAddWeight} onDeleteWeight={onDeleteWeight} onAddCircumference={onAddCircumference} onDeleteCircumference={onDeleteCircumference} />);
    expect(screen.getByLabelText('Filter weight readings from date')).toBeInTheDocument();
  });

  it('renders circumference since-date filter input', () => {
    render(<BodyCompositionSection weightReadings={[]} circumferenceReadings={[]} onAddWeight={onAddWeight} onDeleteWeight={onDeleteWeight} onAddCircumference={onAddCircumference} onDeleteCircumference={onDeleteCircumference} />);
    expect(screen.getByLabelText('Filter circumference readings from date')).toBeInTheDocument();
  });

  it('shows avg weight when readings exist', () => {
    const weightReadings = [
      makeWeightReading({ id: 'w1', weight: 180, recorded_at: '2026-07-01T12:00:00Z' }),
      makeWeightReading({ id: 'w2', weight: 178, recorded_at: '2026-07-02T12:00:00Z' }),
    ];
    render(<BodyCompositionSection weightReadings={weightReadings} circumferenceReadings={[]} onAddWeight={onAddWeight} onDeleteWeight={onDeleteWeight} onAddCircumference={onAddCircumference} onDeleteCircumference={onDeleteCircumference} />);
    const avgEl = screen.getByLabelText('Average weight');
    expect(avgEl.textContent).toContain('179');
    expect(avgEl.textContent).toContain('2 readings');
  });

  it('filters avg weight when sinceDateWeight is set', () => {
    const weightReadings = [
      makeWeightReading({ id: 'w1', weight: 190, recorded_at: '2026-06-01T12:00:00Z' }),
      makeWeightReading({ id: 'w2', weight: 180, recorded_at: '2026-07-01T12:00:00Z' }),
    ];
    render(<BodyCompositionSection weightReadings={weightReadings} circumferenceReadings={[]} onAddWeight={onAddWeight} onDeleteWeight={onDeleteWeight} onAddCircumference={onAddCircumference} onDeleteCircumference={onDeleteCircumference} />);
    fireEvent.change(screen.getByLabelText('Filter weight readings from date'), { target: { value: '2026-07-01' } });
    const avgEl = screen.getByLabelText('Average weight');
    expect(avgEl.textContent).toContain('180');
    expect(avgEl.textContent).toContain('1 readings');
  });

  it('shows Avg since label for weight when sinceDateWeight is set', () => {
    const weightReadings = [makeWeightReading({ id: 'w1', weight: 180, recorded_at: '2026-07-01T12:00:00Z' })];
    render(<BodyCompositionSection weightReadings={weightReadings} circumferenceReadings={[]} onAddWeight={onAddWeight} onDeleteWeight={onDeleteWeight} onAddCircumference={onAddCircumference} onDeleteCircumference={onDeleteCircumference} />);
    fireEvent.change(screen.getByLabelText('Filter weight readings from date'), { target: { value: '2026-07-01' } });
    expect(screen.getByLabelText('Average weight').textContent).toContain('Avg since 2026-07-01');
  });

  it('weight and circumference sinceDate states are independent', () => {
    const weightReadings = [makeWeightReading({ id: 'w1', weight: 180, recorded_at: '2026-06-01T12:00:00Z' })];
    const circumferenceReadings = [makeCircumferenceReading({ id: 'c1', recorded_at: '2026-06-01T12:00:00Z' })];
    render(<BodyCompositionSection weightReadings={weightReadings} circumferenceReadings={circumferenceReadings} onAddWeight={onAddWeight} onDeleteWeight={onDeleteWeight} onAddCircumference={onAddCircumference} onDeleteCircumference={onDeleteCircumference} />);
    // Set weight filter to future date (filters out all weight readings)
    fireEvent.change(screen.getByLabelText('Filter weight readings from date'), { target: { value: '2026-07-01' } });
    // Circumference avg should still show (unaffected)
    expect(screen.queryByLabelText('Weight trend chart')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Circumference trend chart')).toBeInTheDocument();
  });
});
