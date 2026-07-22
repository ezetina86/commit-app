import { type TimeRangePreset } from '../utils/chart-helpers';

interface TimeRangeFilterProps {
  activePreset: TimeRangePreset;
  onPresetChange: (preset: TimeRangePreset) => void;
  customDate: string;
  onCustomDateChange: (date: string) => void;
}

const PRESETS: { label: string; value: TimeRangePreset }[] = [
  { label: '30D', value: '30d' },
  { label: '90D', value: '90d' },
  { label: '1Y', value: '1y' },
  { label: 'ALL', value: 'all' },
];

export function TimeRangeFilter({
  activePreset,
  onPresetChange,
  customDate,
  onCustomDateChange,
}: TimeRangeFilterProps) {
  return (
    <div className="flex items-center gap-1 font-mono text-xs" aria-label="Time range filter controls">
      {PRESETS.map((p) => {
        const isActive = activePreset === p.value;
        return (
          <button
            key={p.value}
            type="button"
            onClick={() => onPresetChange(p.value)}
            aria-pressed={isActive}
            className={`px-2 py-0.5 rounded-sm uppercase tracking-wider transition-colors cursor-pointer text-[11px] ${
              isActive
                ? 'bg-accent-4/20 text-accent-4 font-bold border border-accent-4/40'
                : 'text-text-secondary hover:text-text-primary border border-white/5 bg-background/50'
            }`}
          >
            {p.label}
          </button>
        );
      })}
      <input
        type="date"
        value={customDate}
        onChange={(e) => {
          onCustomDateChange(e.target.value);
          if (e.target.value) onPresetChange('custom');
        }}
        aria-label="Filter readings from date"
        className={`bg-background border-none text-xs px-2 py-0.5 rounded-sm outline-none ${
          activePreset === 'custom' ? 'text-accent-4 font-bold ring-1 ring-accent-4' : 'text-text-secondary'
        }`}
      />
      {customDate && (
        <button
          type="button"
          onClick={() => {
            onCustomDateChange('');
            onPresetChange('all');
          }}
          className="text-text-secondary hover:text-text-primary text-[10px] font-mono cursor-pointer transition-colors px-1"
        >
          [clear]
        </button>
      )}
    </div>
  );
}
