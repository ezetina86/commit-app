import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Toast } from './toast';

describe('Toast Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when not visible', () => {
    const { container } = render(
      <Toast message="Saved" visible={false} onDismiss={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the message when visible', () => {
    render(<Toast message="Check-in saved" visible={true} onDismiss={() => {}} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Check-in saved')).toBeInTheDocument();
  });

  it('has aria-live polite for screen readers', () => {
    render(<Toast message="Saved" visible={true} onDismiss={() => {}} />);
    const el = screen.getByRole('status');
    expect(el).toHaveAttribute('aria-live', 'polite');
    expect(el).toHaveAttribute('aria-atomic', 'true');
  });

  it('calls onDismiss after 2500ms', () => {
    const onDismiss = vi.fn();
    render(<Toast message="Saved" visible={true} onDismiss={onDismiss} />);
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(2500); });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('does not start dismiss timer when not visible', () => {
    const onDismiss = vi.fn();
    render(<Toast message="Saved" visible={false} onDismiss={onDismiss} />);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
