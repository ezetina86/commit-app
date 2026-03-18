import React, { useMemo, useState } from 'react';

export interface CompletionData {
  date: string;
  value: number;
}

interface HabitGridProps {
  completions: CompletionData[];
  measureUnit: string;
  startDate?: Date;
}

const SQUARE_SIZE = 10;
const GAP = 2;
const ROWS = 7; // Sunday to Saturday
const WEEKS = 53; // Full year view

const LABEL_OFFSET_X = 25; // Space for Mon, Wed, Fri
const LABEL_OFFSET_Y = 20; // Space for Jan, Feb, Mar

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const HabitGrid: React.FC<HabitGridProps> = ({ completions, measureUnit, startDate = new Date() }) => {
  const [tooltip, setTooltip] = useState<{ x: number, y: number, text: string } | null>(null);

  const completionMap = useMemo(() => {
    const m = new Map<string, number>();
    completions.forEach(c => m.set(c.date, c.value));
    return m;
  }, [completions]);

  const maxVal = useMemo(() => {
    if (completions.length === 0) return 0;
    return Math.max(...completions.map(c => c.value));
  }, [completions]);
  
  // Calculate squares for the last 365 days
  const { squares, monthLabels } = useMemo(() => {
    const items = [];
    const mLabels = [];
    let currentMonth = -1;

    const end = new Date(startDate);
    end.setHours(0, 0, 0, 0);

    // Start exactly one year ago from the end date
    const start = new Date(end);
    start.setDate(start.getDate() - 365);

    // Adjust start to the previous Sunday to keep columns consistent
    const dayOfWeek = start.getDay();
    start.setDate(start.getDate() - dayOfWeek);

    const current = new Date(start);
    let weekIndex = 0;

    while (current <= end) {
      const dateStr = current.toLocaleDateString('en-CA');
      const val = completionMap.get(dateStr) || 0;
      
      // Calculate intensity (0-4)
      let intensity = 0;
      if (val > 0) {
        if (maxVal === 0) {
          intensity = 1;
        } else {
          const ratio = val / maxVal;
          if (ratio <= 0.25) intensity = 1;
          else if (ratio <= 0.5) intensity = 2;
          else if (ratio <= 0.75) intensity = 3;
          else intensity = 4;
        }
      }

      items.push({
        date: dateStr,
        value: val,
        intensity,
        dayOfWeek: current.getUTCDay(),
        weekIndex,
      });

      // Check if we entered a new month (usually on Sunday or if it's the first week we see it)
      if (current.getUTCDay() === 0) {
        const m = current.getUTCMonth();
        if (m !== currentMonth) {
          // Only push if it's not the very first column, or if it is, maybe skip or align
          mLabels.push({ text: MONTH_NAMES[m], weekIndex });
          currentMonth = m;
        }
      }

      if (current.getUTCDay() === 6) {
        weekIndex++;
      }
      current.setDate(current.getDate() + 1);
    }
    return { squares: items, monthLabels: mLabels };
  }, [startDate, completionMap, maxVal]);

  const gridWidth = WEEKS * (SQUARE_SIZE + GAP) + LABEL_OFFSET_X;
  const gridHeight = ROWS * (SQUARE_SIZE + GAP) + LABEL_OFFSET_Y;

  return (
    <div className="flex flex-col gap-2 overflow-x-auto py-4 scrollbar-hide text-text-primary relative">
      <svg
        width={gridWidth}
        height={gridHeight}
        viewBox={`0 0 ${gridWidth} ${gridHeight}`}
        className="overflow-visible font-sans text-[10px] fill-text-secondary"
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Month Labels */}
        {monthLabels.map((lbl, i) => (
          <text 
            key={i} 
            x={LABEL_OFFSET_X + lbl.weekIndex * (SQUARE_SIZE + GAP)} 
            y={10}
          >
            {lbl.text}
          </text>
        ))}

        {/* Day Labels */}
        <text x={0} y={LABEL_OFFSET_Y + 1 * (SQUARE_SIZE + GAP) + 8} className="text-[9px]">Mon</text>
        <text x={0} y={LABEL_OFFSET_Y + 3 * (SQUARE_SIZE + GAP) + 8} className="text-[9px]">Wed</text>
        <text x={0} y={LABEL_OFFSET_Y + 5 * (SQUARE_SIZE + GAP) + 8} className="text-[9px]">Fri</text>

        {/* Squares */}
        {squares.map((square) => {
          const x = LABEL_OFFSET_X + square.weekIndex * (SQUARE_SIZE + GAP);
          const y = LABEL_OFFSET_Y + square.dayOfWeek * (SQUARE_SIZE + GAP);
          
          let colorClass = 'fill-accent-0 hover:fill-accent-1/50';
          if (square.intensity === 1) colorClass = 'fill-accent-1';
          if (square.intensity === 2) colorClass = 'fill-accent-2';
          if (square.intensity === 3) colorClass = 'fill-accent-3';
          if (square.intensity === 4) colorClass = 'fill-accent-4';

          const unitText = measureUnit ? ` ${measureUnit}` : ' check-ins';
          const tooltipText = square.value > 0 
            ? `${square.value}${unitText} on ${square.date}`
            : `No data on ${square.date}`;

          return (
            <rect
              key={square.date}
              x={x}
              y={y}
              width={SQUARE_SIZE}
              height={SQUARE_SIZE}
              rx={2}
              className={`motion-safe:transition-colors motion-safe:duration-200 cursor-pointer ${colorClass}`}
              aria-label={tooltipText}
              role="img"
              tabIndex={0}
              onMouseEnter={() => setTooltip({ x: x + SQUARE_SIZE / 2, y: y - 5, text: tooltipText })}
              onFocus={() => setTooltip({ x: x + SQUARE_SIZE / 2, y: y - 5, text: tooltipText })}
              onBlur={() => setTooltip(null)}
            />
          );
        })}
      </svg>
      
      {/* Custom Tooltip */}
      {tooltip && (
        <div 
          className="absolute z-50 bg-surface border border-white/20 text-text-primary text-[10px] font-bold px-2 py-1 rounded-sm shadow-xl pointer-events-none whitespace-nowrap"
          style={{ 
            left: tooltip.x, 
            top: tooltip.y,
            transform: 'translate(-50%, -100%)'
          }}
        >
          {tooltip.text}
        </div>
      )}

      <div className="flex justify-between text-[10px] text-text-secondary px-1 uppercase tracking-wider pl-[25px]">
        <span>365 Days</span>
        <div className="flex gap-1 items-center">
          <span>Less</span>
          <div className="w-2 h-2 bg-accent-0 rounded-sm border border-white/5"></div>
          <div className="w-2 h-2 bg-accent-1 rounded-sm"></div>
          <div className="w-2 h-2 bg-accent-2 rounded-sm"></div>
          <div className="w-2 h-2 bg-accent-3 rounded-sm"></div>
          <div className="w-2 h-2 bg-accent-4 rounded-sm"></div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
};
