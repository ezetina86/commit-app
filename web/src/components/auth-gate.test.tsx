import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthGate } from './auth-gate';

vi.mock('../App', () => ({ default: () => <div>App Content</div> }));
vi.mock('./login-page', () => ({
  LoginPage: ({ onLogin }: { onLogin: () => void }) => (
    <button onClick={onLogin}>Login button</button>
  ),
}));

describe('AuthGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders App when /api/auth/me returns 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    render(<AuthGate />);
    await waitFor(() =>
      expect(screen.getByText('App Content')).toBeInTheDocument()
    );
  });

  it('renders LoginPage when /api/auth/me returns 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    render(<AuthGate />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Login button' })).toBeInTheDocument()
    );
  });
});
