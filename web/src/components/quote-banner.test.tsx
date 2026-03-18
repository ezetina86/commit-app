import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { QuoteBanner } from './quote-banner';

describe('QuoteBanner Component', () => {
  beforeEach(() => {
    // Reset fetch mock before each test
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders loading state initially', () => {
    // Mock fetch to never resolve immediately
    (fetch as Mock).mockImplementation(() => new Promise(() => {}));
    
    render(<QuoteBanner />);
    expect(screen.getByText('_')).toHaveClass('motion-safe:animate-pulse');
  });

  it('renders quote when fetched successfully', async () => {
    const mockQuote = {
      quote: "Test quote",
      author: "Test Author",
      category: "success"
    };

    (fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockQuote,
    });

    render(<QuoteBanner />);

    await waitFor(() => {
      expect(screen.getByText(/\u201CTest quote\u201D/)).toBeInTheDocument();
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

    (fetch as Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockQuote,
    });

    render(<QuoteBanner />);

    await waitFor(() => {
      // Should find the truncated version (200 chars + …)
      const truncated = "A".repeat(200) + "…";
      expect(screen.getByText(new RegExp('\u201C' + truncated + '\u201D'))).toBeInTheDocument();
    });
  });
});
