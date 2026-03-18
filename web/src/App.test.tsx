import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import App from './App';

const mockHabits = [
  {
    id: '1',
    name: 'Read',
    measure_unit: 'Pages',
    tags: ['personal'],
    day_start_offset: 0,
    current_streak: 3,
    archived: false,
    completions: [],
  },
  {
    id: '2',
    name: 'Exercise',
    measure_unit: 'Minutes',
    tags: ['health'],
    day_start_offset: 0,
    current_streak: 7,
    archived: false,
    completions: [],
  },
];

const mockInsights = [
  { habit_id: '1', habit_name: 'Read', count: 10, message: "You crushed 10 pages of 'Read'!" },
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  (fetch as Mock).mockImplementation((url: string) => {
    if (url.includes('/api/habits')) {
      return Promise.resolve({ ok: true, json: async () => mockHabits });
    }
    if (url.includes('/api/insights')) {
      return Promise.resolve({ ok: true, json: async () => mockInsights });
    }
    if (url.includes('/api/quote')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ quote: 'Test quote', author: 'Author', category: 'success' }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
});

describe('App — Add form validation', () => {
  it('shows error message when Add is submitted with empty name', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Habit name is required');
  });

  it('clears error when user starts typing a valid name', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: /habit name/i }), {
      target: { value: 'New habit' },
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('name input gets aria-invalid when error is set', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /habit name/i })).toHaveAttribute('aria-invalid', 'true');
    });
  });
});

describe('App — Filter chips', () => {
  it('renders tag filter chips with habit counts', async () => {
    render(<App />);
    // Wait for chips with aria-labels that include counts
    await waitFor(() =>
      expect(screen.getByLabelText(/filter by personal, 1 habit/i)).toBeInTheDocument()
    );
    expect(screen.getByLabelText(/filter by health, 1 habit/i)).toBeInTheDocument();
  });
});

describe('App — Summary row', () => {
  it('shows total active habits count', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/total/i)).toBeInTheDocument());
    expect(screen.getByText(/total/i).closest('div')).toHaveTextContent('2');
  });

  it('shows today check-in progress', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/today/i)).toBeInTheDocument());
    expect(screen.getByText(/today/i).closest('span')).toBeInTheDocument();
  });
});

describe('App — Streak milestone badges', () => {
  it('shows 7d milestone badge when streak is 7', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole('article').length).toBe(2));
    // Exercise has streak 7
    expect(screen.getByLabelText(/7-day streak milestone/i)).toBeInTheDocument();
  });

  it('does not show a badge when streak is below 7', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole('article').length).toBe(2));
    // Read has streak 3, no badge
    expect(screen.queryByLabelText(/3-day streak milestone/i)).toBeNull();
  });
});

describe('App — Habit cards accessibility', () => {
  it('renders habit cards as article elements with aria-labelledby', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole('article').length).toBe(2));

    const articles = screen.getAllByRole('article');
    articles.forEach(article => {
      expect(article).toHaveAttribute('aria-labelledby');
    });
  });

  it('Track buttons have descriptive aria-labels', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText(/track read/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/track exercise/i)).toBeInTheDocument();
  });
});

describe('App — Archive / show archived', () => {
  it('renders archive button on each habit card', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole('article').length).toBe(2));
    const archiveBtns = screen.getAllByLabelText(/archive habit/i);
    expect(archiveBtns.length).toBe(2);
  });

  it('calls PATCH archive endpoint when archive button is clicked', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole('article').length).toBe(2));

    const archiveBtn = screen.getAllByLabelText(/archive habit/i)[0];
    fireEvent.click(archiveBtn);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/archive'),
        expect.objectContaining({ method: 'PATCH' })
      );
    });
  });

  it('toggles show-archived button', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/show archived/i)).toBeInTheDocument());

    const btn = screen.getByText(/show archived/i);
    expect(btn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByText(/hide archived/i)).toBeInTheDocument());
  });
});

describe('App — Insights panel', () => {
  it('opens insights panel as a fixed overlay on toggle', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText(/toggle insights panel/i)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/toggle insights panel/i));

    await waitFor(() => expect(screen.getByText('system_insights.sh')).toBeInTheDocument());
    // Panel wrapper should be fixed-positioned
    const wrapper = screen.getByText('system_insights.sh').closest('[class*="fixed"]');
    expect(wrapper).not.toBeNull();
  });
});

describe('App — Track (check-in) form', () => {
  it('opens inline check-in form when Track is clicked', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText(/track read/i)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/track read/i));

    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/check-in date/i)).toBeInTheDocument();
  });

  it('closes the check-in form when Cancel is clicked', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText(/track read/i)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/track read/i));
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/cancel tracking read/i));
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });

  it('submits check-in and shows toast on success', async () => {
    (fetch as Mock).mockImplementation((url: string) => {
      if (url === '/api/check-in') return Promise.resolve({ ok: true });
      if (url.includes('/api/quote')) return Promise.resolve({ ok: true, json: async () => ({ quote: 'Q', author: 'A', category: 'success' }) });
      if (url.includes('/api/habits')) return Promise.resolve({ ok: true, json: async () => mockHabits });
      if (url.includes('/api/insights')) return Promise.resolve({ ok: true, json: async () => mockInsights });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    render(<App />);
    await waitFor(() => expect(screen.getByLabelText(/track read/i)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/track read/i));

    const valueInput = screen.getByLabelText(/check-in value/i);
    fireEvent.change(valueInput, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Check-in saved'));
  });
});

describe('App — Delete habit modal', () => {
  it('opens delete confirmation modal when Delete is clicked', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole('article').length).toBe(2));

    const deleteBtn = screen.getByLabelText(/delete habit: read/i);
    fireEvent.click(deleteBtn);

    expect(screen.getByText(/delete habit/i)).toBeInTheDocument();
    expect(screen.getByText(/permanently delete/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm delete/i })).toBeInTheDocument();
  });

  it('closes modal when Cancel is clicked in delete confirmation', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole('article').length).toBe(2));

    fireEvent.click(screen.getByLabelText(/delete habit: read/i));
    expect(screen.getByRole('button', { name: /confirm delete/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByRole('button', { name: /confirm delete/i })).toBeNull();
  });

  it('calls DELETE endpoint when Confirm Delete is clicked', async () => {
    (fetch as Mock).mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'DELETE') return Promise.resolve({ ok: true });
      if (url.includes('/api/quote')) return Promise.resolve({ ok: true, json: async () => ({ quote: 'Q', author: 'A', category: 'success' }) });
      if (url.includes('/api/habits')) return Promise.resolve({ ok: true, json: async () => mockHabits });
      if (url.includes('/api/insights')) return Promise.resolve({ ok: true, json: async () => mockInsights });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    render(<App />);
    await waitFor(() => expect(screen.getAllByRole('article').length).toBe(2));

    fireEvent.click(screen.getByLabelText(/delete habit: read/i));
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/habits/1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });
});

describe('App — Edit habit', () => {
  it('shows edit form when habit name is clicked', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole('article').length).toBe(2));

    fireEvent.click(screen.getByLabelText(/edit habit: read/i));

    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument();
  });

  it('cancels edit and restores view when Cancel is clicked', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole('article').length).toBe(2));

    fireEvent.click(screen.getByLabelText(/edit habit: read/i));
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull();
  });
});

describe('App — Create habit', () => {
  it('submits the form and clears fields on successful habit creation', async () => {
    (fetch as Mock).mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST' && url === '/api/habits') return Promise.resolve({ ok: true, json: async () => ({ ...mockHabits[0], id: '99' }) });
      if (url.includes('/api/quote')) return Promise.resolve({ ok: true, json: async () => ({ quote: 'Q', author: 'A', category: 'success' }) });
      if (url.includes('/api/habits')) return Promise.resolve({ ok: true, json: async () => mockHabits });
      if (url.includes('/api/insights')) return Promise.resolve({ ok: true, json: async () => mockInsights });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument());

    const nameInput = screen.getByRole('textbox', { name: /habit name/i });
    fireEvent.change(nameInput, { target: { value: 'Meditate' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/habits',
        expect.objectContaining({ method: 'POST' })
      );
    });

    await waitFor(() => expect(nameInput).toHaveValue(''));
  });
});
