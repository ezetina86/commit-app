import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  type TooltipProps,
} from 'recharts';
import {
  TimeRangeFilter,
} from './time-range-filter';
import {
  type TimeRangePreset,
  filterReadingsByPreset,
  calculateDynamicDomain,
  calculatePeriodTrend,
} from '../utils/chart-helpers';

const TOKEN_ACCENT_4 = '#39D353';
const TOKEN_TEXT_SECONDARY = '#7D8590';
const TOKEN_CHART_GRID = '#ffffff0d';

export interface StepsReading {
  id: string;
  steps: number;
  notes: string;
  recorded_at: string;
}

interface StepsSectionProps {
  readings: StepsReading[];
  target: number;
  onAdd: (steps: number, notes: string, date: string) => Promise<void>;
  onDelete: (id: string) => void;
  onTargetChange: (target: number) => void;
}

const formatCentral = (iso: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));

const formatCentralShort = (iso: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));

interface StepsTooltipPayload {
  steps: number;
  notes: string;
  recorded_at: string;
}

function StepsTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload as StepsTooltipPayload;
  return (
    <div className="bg-surface border border-white/10 p-3 rounded-sm text-xs font-mono">
      <p className="text-text-secondary mb-1">{formatCentral(data.recorded_at)}</p>
      <p className="text-accent-4">Steps: <span className="font-bold">{data.steps.toLocaleString()}</span></p>
      {data.notes && <p className="text-text-secondary mt-1 max-w-[160px] whitespace-normal">{data.notes}</p>}
    </div>
  );
}

export function StepsSection({ readings, target, onAdd, onDelete, onTargetChange }: StepsSectionProps) {
  const [steps, setSteps] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Intl.DateTimeFormat('en-CA').format(new Date()));
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState('');

  const [preset, setPreset] = useState<TimeRangePreset>('30d');
  const [sinceDate, setSinceDate] = useState('');

  const filteredReadings = useMemo(
    () => filterReadingsByPreset(readings, (r) => r.recorded_at, preset, sinceDate),
    [readings, preset, sinceDate]
  );

  const previousPeriodReadings = useMemo(() => {
    if (preset !== '30d') return [];
    const now = Date.now();
    const start30 = now - 30 * 24 * 60 * 60 * 1000;
    const start60 = now - 60 * 24 * 60 * 60 * 1000;
    return readings.filter((r) => {
      const t = new Date(r.recorded_at).getTime();
      return t >= start60 && t < start30;
    });
  }, [readings, preset]);

  const trend = useMemo(
    () => calculatePeriodTrend(filteredReadings.map(r => r.steps), previousPeriodReadings.map(r => r.steps)),
    [filteredReadings, previousPeriodReadings]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!steps || Number(steps) <= 0) {
      setFormError('Steps must be greater than 0');
      return;
    }
    setFormError('');
    setSubmitting(true);
    try {
      await onAdd(Number(steps), notes, date);
      setSteps('');
      setNotes('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTargetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(targetInput, 10);
    if (!n || n <= 0) return;
    onTargetChange(n);
    setEditingTarget(false);
    setTargetInput('');
  };

  const chartData = [...filteredReadings].reverse();

  const stepValues = filteredReadings.map(r => r.steps);
  const avgSteps = stepValues.length > 0
    ? Math.round(stepValues.reduce((sum, r) => sum + r, 0) / stepValues.length)
    : null;

  const maxSteps = stepValues.length > 0 ? Math.max(...stepValues) : null;
  const minSteps = stepValues.length > 0 ? Math.min(...stepValues) : null;

  const yDomain = useMemo(
    () => calculateDynamicDomain(stepValues, [target], 0.08, 500),
    [stepValues, target]
  );

  return (
    <section aria-label="Steps tracker" className="w-full bg-surface p-6 rounded-sm border border-white/5">
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-surface border border-white/10 p-8 rounded-sm shadow-2xl max-w-sm w-full">
            <h3 className="text-xl font-bold uppercase tracking-tight text-red-500 mb-2">Delete Reading</h3>
            <p className="text-text-secondary mb-6 text-sm">
              Are you sure you want to permanently delete this steps reading?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDelete(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
                className="bg-red-900/30 hover:bg-red-600 text-red-500 hover:text-white px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold uppercase tracking-tight">
            <span className="text-accent-3 mr-2 select-none" aria-hidden="true">&gt;</span>Steps
          </h2>
          {editingTarget ? (
            <form onSubmit={handleTargetSubmit} className="flex items-center gap-2">
              <input
                type="number"
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                placeholder={String(target)}
                aria-label="Daily target"
                autoFocus
                className="w-24 bg-background border-none text-text-primary px-2 py-1 rounded-sm text-xs focus-visible:ring-1 focus-visible:ring-accent-4 outline-none placeholder:text-text-secondary/50 font-mono"
              />
              <button type="submit" className="text-xs font-bold uppercase tracking-wider text-accent-4 hover:text-white transition-colors cursor-pointer">
                Set
              </button>
              <button type="button" onClick={() => { setEditingTarget(false); setTargetInput(''); }} className="text-xs font-bold uppercase tracking-wider text-text-secondary hover:text-text-primary transition-colors cursor-pointer">
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => { setEditingTarget(true); setTargetInput(String(target)); }}
              aria-label="Edit daily target"
              className="text-xs font-mono text-text-secondary hover:text-text-primary uppercase tracking-widest cursor-pointer transition-colors"
            >
              target: {target.toLocaleString()}
            </button>
          )}
        </div>

        <TimeRangeFilter
          activePreset={preset}
          onPresetChange={setPreset}
          customDate={sinceDate}
          onCustomDateChange={setSinceDate}
        />
      </div>

      {avgSteps !== null && (
        <div className="flex flex-wrap items-baseline gap-3 mb-3" aria-label="Average steps">
          <span className="text-text-secondary text-xs font-mono uppercase tracking-widest">
            {preset === '30d' ? '30D Avg' : preset === '90d' ? '90D Avg' : preset === '1y' ? '1Y Avg' : sinceDate ? `Avg since ${sinceDate}` : 'Avg'}
          </span>
          <span className="text-3xl font-bold font-mono text-accent-4">{avgSteps.toLocaleString()}</span>
          <span className="text-text-secondary text-xs font-mono">steps/day</span>
          <span className="text-text-secondary text-xs font-mono font-bold">({filteredReadings.length} readings)</span>

          {maxSteps !== null && minSteps !== null && (
            <span className="text-text-secondary text-xs font-mono">
              (Peak: <span className="text-text-primary font-bold">{maxSteps.toLocaleString()}</span> / Low: <span className="text-text-primary font-bold">{minSteps.toLocaleString()}</span>)
            </span>
          )}

          {preset === '30d' && previousPeriodReadings.length > 0 && trend.delta !== 0 && (
            <span
              className={`text-xs font-mono font-bold px-2 py-0.5 rounded-sm border ${
                trend.delta > 0
                  ? 'text-accent-4 bg-accent-4/10 border-accent-4/30'
                  : 'text-amber-400 bg-amber-400/10 border-amber-400/30'
              }`}
              aria-label="Period-over-period trend"
            >
              {trend.delta > 0 ? '▲' : '▼'} {Math.abs(trend.delta).toLocaleString()} ({trend.percent > 0 ? '+' : ''}{trend.percent}%) vs prev 30d
            </span>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 mb-2" aria-label="Log steps">
        <input
          type="number"
          value={steps}
          onChange={(e) => { setSteps(e.target.value === '' ? '' : Number(e.target.value)); if (e.target.value) setFormError(''); }}
          placeholder="Steps"
          aria-label="Steps"
          name="steps-count"
          className="w-32 bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none placeholder:text-text-secondary/50 font-mono"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date"
          name="steps-date"
          className="bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none font-mono"
        />
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          aria-label="Notes"
          name="steps-notes"
          autoComplete="off"
          className="flex-1 min-w-[140px] bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none placeholder:text-text-secondary/50 font-mono"
        />
        <button
          type="submit"
          disabled={submitting}
          className="bg-accent-4 cursor-pointer text-background px-5 py-2 rounded-sm font-bold uppercase tracking-wider text-xs hover:bg-white transition-colors disabled:opacity-50"
        >
          Log Steps
        </button>
      </form>
      {formError && (
        <p role="alert" className="text-red-400 text-xs font-mono mb-4 pl-1">{formError}</p>
      )}

      {filteredReadings.length > 0 && (
        <div className="mt-6 mb-6" aria-label="Steps trend chart">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={TOKEN_CHART_GRID} />
              <XAxis
                dataKey="recorded_at"
                tickFormatter={formatCentralShort}
                tick={{ fill: TOKEN_TEXT_SECONDARY, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={yDomain}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                tick={{ fill: TOKEN_TEXT_SECONDARY, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<StepsTooltip />} />
              <ReferenceLine
                y={target}
                stroke={TOKEN_TEXT_SECONDARY}
                strokeDasharray="4 3"
                strokeWidth={1}
                label={{ value: `Target ${(target / 1000).toFixed(0)}k`, position: 'insideTopRight', fill: TOKEN_TEXT_SECONDARY, fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}
              />
              <Line
                type="monotone"
                dataKey="steps"
                stroke={TOKEN_ACCENT_4}
                strokeWidth={2}
                dot={{ fill: TOKEN_ACCENT_4, r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {readings.length === 0 ? (
        <p className="text-text-secondary text-xs uppercase tracking-widest py-4">No Readings Logged</p>
      ) : (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowHistory(v => !v)}
            aria-expanded={showHistory}
            aria-controls="steps-history-list"
            className="text-xs font-mono text-text-secondary hover:text-text-primary uppercase tracking-widest cursor-pointer transition-colors mb-2"
          >
            {showHistory ? '[hide history]' : `[show history (${readings.length})]`}
          </button>
          {showHistory && (
            <div id="steps-history-list" className="overflow-y-auto max-h-[280px] flex flex-col gap-1 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2" role="list" aria-label="Steps readings">
              {readings.map((r) => (
                <div
                  key={r.id}
                  role="listitem"
                  className="flex items-center justify-between gap-4 px-3 py-2 rounded-sm bg-background hover:bg-white/5 transition-colors group"
                >
                  <span className="text-text-secondary text-xs font-mono shrink-0">{formatCentral(r.recorded_at)}</span>
                  <span className="text-accent-4 text-sm font-bold font-mono shrink-0">{r.steps.toLocaleString()} steps</span>
                  {r.notes && (
                    <span className="text-text-secondary text-xs font-mono truncate flex-1">{r.notes}</span>
                  )}
                  {!r.notes && <span className="flex-1" />}
                  <button
                    onClick={() => setConfirmDeleteId(r.id)}
                    aria-label={`Delete reading from ${formatCentral(r.recorded_at)}`}
                    className="text-red-500/50 hover:text-red-500 text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
