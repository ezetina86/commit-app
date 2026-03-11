import { useState, useEffect } from 'react';

interface QuoteResponse {
  quote: string;
  author: string;
  category: string;
}

export const QuoteBanner = () => {
  const [quoteData, setQuoteData] = useState<QuoteResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchQuote = async () => {
      try {
        const res = await fetch('/api/quote');
        if (res.ok) {
          const data = await res.json();
          setQuoteData(data);
        }
      } catch (err) {
        console.error('Failed to fetch quote:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchQuote();
  }, []);

  if (loading) {
    return (
      <div className="w-full bg-surface/90 border-b border-white/20 p-5 font-mono relative z-10 backdrop-blur-md shadow-md">
        <div className="max-w-3xl mx-auto flex gap-3 items-baseline text-base sm:text-lg">
          <span className="text-accent-4 font-bold">root@commit-sys:~#</span>
          <span className="text-text-primary font-bold animate-pulse">_</span>
        </div>
      </div>
    );
  }

  if (!quoteData) return null;

  // Protect against malformed API data that returns massive paragraphs
  const maxQuoteLength = 200;
  const safeQuote = quoteData.quote.length > maxQuoteLength 
    ? quoteData.quote.substring(0, maxQuoteLength).trim() + "..."
    : quoteData.quote;

  return (
    <div className="w-full bg-surface/90 border-b border-white/20 p-5 font-mono relative z-10 backdrop-blur-md shadow-md">
      <div className="max-w-3xl mx-auto flex flex-col gap-3">
        <div className="flex gap-3 items-baseline text-base sm:text-lg whitespace-nowrap overflow-x-auto scrollbar-hide">
          <span className="text-accent-4 font-bold">root@commit-sys:~#</span>
          <span className="text-text-primary font-bold">./quote.sh --category {quoteData.category}</span>
        </div>
        <div className="text-text-primary italic border-l-[3px] border-accent-3 pl-4 py-1 sm:before:content-['>'] sm:before:mr-3 sm:before:text-accent-3 text-lg leading-relaxed tracking-wide">
          "{safeQuote}" 
          <span className="text-accent-4 flex items-center mt-2 not-italic font-bold text-base tracking-normal">
            <span className="w-4 h-[2px] bg-accent-4 mr-2 inline-block"></span>
            {quoteData.author}
          </span>
        </div>
      </div>
    </div>
  );
};
