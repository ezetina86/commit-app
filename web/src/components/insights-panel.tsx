import { useReducer, useEffect } from 'react';

export interface Insight {
  habit_id: string;
  habit_name: string;
  message: string;
  count: number;
}

interface InsightsPanelProps {
  insights: Insight[];
  onClose: () => void;
}

type AnimState = {
  displayedText: string[];
  currentIndex: number;
  charIndex: number;
  isTyping: boolean;
};

type AnimAction =
  | { type: 'skip'; texts: string[] }
  | { type: 'start'; count: number }
  | { type: 'advance_char'; lineIndex: number; text: string }
  | { type: 'advance_line' };

function animReducer(state: AnimState, action: AnimAction): AnimState {
  switch (action.type) {
    case 'skip':
      return { displayedText: action.texts, currentIndex: action.texts.length, charIndex: 0, isTyping: false };
    case 'start':
      return { displayedText: Array(action.count).fill(''), currentIndex: 0, charIndex: 0, isTyping: true };
    case 'advance_char': {
      const next = [...state.displayedText];
      next[action.lineIndex] = action.text;
      return { ...state, displayedText: next, charIndex: state.charIndex + 1 };
    }
    case 'advance_line':
      return { ...state, currentIndex: state.currentIndex + 1, charIndex: 0 };
  }
}

export const InsightsPanel: React.FC<InsightsPanelProps> = ({ insights, onClose }) => {
  const [{ displayedText, currentIndex, charIndex, isTyping }, dispatch] = useReducer(animReducer, {
    displayedText: [],
    currentIndex: 0,
    charIndex: 0,
    isTyping: false,
  });

  useEffect(() => {
    if (insights.length === 0) return;
    const prefersReduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    dispatch(
      prefersReduced
        ? { type: 'skip', texts: insights.map(i => i.message) }
        : { type: 'start', count: insights.length }
    );
  }, [insights]);

  useEffect(() => {
    if (!isTyping || currentIndex >= insights.length) return;

    const currentMessage = insights[currentIndex].message;

    if (charIndex < currentMessage.length) {
      const timeout = setTimeout(() => {
        dispatch({ type: 'advance_char', lineIndex: currentIndex, text: currentMessage.substring(0, charIndex + 1) });
      }, 30);
      return () => clearTimeout(timeout);
    } else {
      const timeout = setTimeout(() => {
        dispatch({ type: 'advance_line' });
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [charIndex, currentIndex, isTyping, insights]);

  if (insights.length === 0) return null;

  return (
    <div className="w-full bg-background border border-white/10 rounded-sm shadow-2xl font-mono relative overflow-hidden group flex flex-col">
      {/* Decorative background scanline effect */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] opacity-20 pointer-events-none"></div>
      
      {/* Terminal Title Bar */}
      <div className="flex items-center justify-between bg-surface border-b border-white/10 px-4 py-2 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent-4 motion-safe:animate-pulse"></div>
          <h3 className="text-[10px] uppercase tracking-widest text-text-secondary font-bold">system_insights.sh</h3>
        </div>
        <button
          onClick={onClose}
          className="text-text-secondary hover:text-text-primary transition-colors cursor-pointer text-xs"
          aria-label="Close insights panel"
          title="Close terminal"
        >
          [X]
        </button>
      </div>

      <div className="p-6 space-y-2 relative z-10 text-sm overflow-y-auto max-h-[300px]">
        {displayedText.map((text, i) => {
          if (i > currentIndex) return null; // Don't render lines we haven't reached yet
          
          const habitName = insights[i]?.habit_name || "";
          const escapedHabitName = habitName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const highlightRegex = new RegExp(`(\\d+|'${escapedHabitName}')`, 'g');

          return (
            <div key={i} className="flex gap-4 items-start">
              <span className="text-accent-3 select-none">{`$`}</span>
              <p className="text-accent-3 whitespace-pre-wrap">
                {/* Highlight the exact habit name and numbers */}
                {text.split(highlightRegex).map((part, j) => {
                  if (/^\d+$/.test(part)) return <span key={j} className="text-accent-4 font-bold">{part}</span>;
                  if (part === `'${habitName}'`) return <span key={j} className="text-text-primary font-bold">{part}</span>;
                  return part;
                })}
                {/* Cursor effect on the currently typing line */}
                {i === currentIndex && isTyping && (
                  <span className="inline-block w-2 h-4 bg-accent-4 ml-1 motion-safe:animate-pulse align-middle"></span>
                )}
              </p>
            </div>
          );
        })}
        {currentIndex >= insights.length && (
          <div className="flex gap-4 items-start mt-4 opacity-50">
             <span className="text-accent-3 select-none">{`$`}</span>
             <span className="inline-block w-2 h-4 bg-accent-4 motion-safe:animate-pulse align-middle"></span>
          </div>
        )}
      </div>
    </div>
  );
};
