import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuoteBanner } from './quote-banner';

describe('QuoteBanner Component', () => {
  beforeEach(() => {
    // Reset fetch mock before each test
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders loading state initially', () => {
    // Mock fetch to never resolve immediately
    (fetch as vi.Mock).mockImplementation(() => new Promise(() => {}));
    
    render(<QuoteBanner />);
    expect(screen.getByText('_')).toHaveClass('animate-pulse');
  });

  it('renders quote when fetched successfully', async () => {
    const mockQuote = {
      quote: "Test quote",
      author: "Test Author",
      category: "success"
    };

    (fetch as vi.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockQuote,
    });

    render(<QuoteBanner />);

    await waitFor(() => {
      expect(screen.getByText(/"Test quote"/)).toBeInTheDocument();
      expect(screen.getByText(/Test Author/)).toBeInTheDocument();
      expect(screen.getByText(/--category success/)).toBeInTheDocument();
    });
  });

  it('truncates long quotes', async () => {
    const longQuoteText = "A".repeat(250);
    const mockQuote = {
      quote: longQuoteText,
      author: "Test Author",
      category: "success"
    };

    (fetch as vi.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockQuote,
    });

    render(<QuoteBanner />);

    await waitFor(() => {
      // Should find the truncated version (200 chars + ...)
      const truncated = "A".repeat(200) + "...";
      expect(screen.getByText(`"${truncated}"`)).toBeInTheDocument();
    });
  });
});
