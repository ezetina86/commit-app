import { useMemo, useState } from 'react';
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

const TOKEN_ACCENT_4 = '#39D353';
const TOKEN_ACCENT_3 = '#26A641';
const TOKEN_TEXT_SECONDARY = '#7D8590';
const TOKEN_CHART_GRID = '#ffffff0d';

export interface EloReading {
  id: string;
  platform: 'duolingo' | 'chesscom';
  rating: number;
  notes: string;
  recorded_at: string;
}

interface EloSectionProps {
  readings: EloReading[];
  target: number;
  onAdd: (platform: 'duolingo' | 'chesscom', rating: number, notes: string) => Promise<void>;
  onDelete: (id: string) => void;
  onTargetChange: (target: number) => Promise<void>;
}

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));

const formatDateShort = (iso: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));

interface EloTooltipPoint {
  date: string;
  duolingo?: number;
  chesscom?: number;
}

function EloTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload as EloTooltipPoint;
  return (
    <div className="bg-surface border border-white/10 p-3 rounded-sm text-xs font-mono">
      <p className="text-text-secondary mb-1">{data.date}</p>
      {data.duolingo !== undefined && (
        <p className="text-accent-4">Duolingo: <span className="font-bold">{data.duolingo}</span></p>
      )}
      {data.chesscom !== undefined && (
        <p className="text-accent-3">Chess.com: <span className="font-bold">{data.chesscom}</span></p>
      )}
    </div>
  );
}

export function EloSection({ readings, target, onAdd, onDelete, onTargetChange }: EloSectionProps) {
  const [platform, setPlatform] = useState<'duolingo' | 'chesscom'>('chesscom');
  const [rating, setRating] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState(String(target));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating || Number(rating) <= 0) {
      setFormError('Rating must be greater than 0');
      return;
    }
    setFormError('');
    setSubmitting(true);
    try {
      await onAdd(platform, Number(rating), notes);
      setRating('');
      setNotes('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTargetSave = async () => {
    const n = parseInt(targetInput, 10);
    if (!n || n <= 0) {
      setTargetInput(String(target));
      setEditingTarget(false);
      return;
    }
    await onTargetChange(n);
    setEditingTarget(false);
  };

  // Merge readings into per-day chart data (latest rating per platform per day)
  const chartData = useMemo(() => {
    const sorted = [...readings].reverse(); // chronological
    const byDay = new Map<string, { dateLabel: string; duolingo?: number; chesscom?: number }>();

    for (const r of sorted) {
      const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(r.recorded_at));
      const existing = byDay.get(dayKey) ?? { dateLabel: formatDateShort(r.recorded_at) };
      if (r.platform === 'duolingo') {
        existing.duolingo = r.rating;
      } else {
        existing.chesscom = r.rating;
      }
      byDay.set(dayKey, existing);
    }

    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [readings]);

  return (
    <section aria-label="Chess ELO Rating" className="w-full bg-surface p-6 rounded-sm border border-white/5">
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-surface border border-white/10 p-8 rounded-sm shadow-2xl max-w-sm w-full">
            <h3 className="text-xl font-bold uppercase tracking-tight text-red-500 mb-2">Delete Reading</h3>
            <p className="text-text-secondary mb-6 text-sm">
              Permanently delete this ELO reading?
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

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold uppercase tracking-tight">
          <span className="text-accent-3 mr-2 select-none" aria-hidden="true">&gt;</span>Chess ELO Rating
        </h2>
        <div className="flex items-center gap-2 text-xs font-mono text-text-secondary">
          <span>Target:</span>
          {editingTarget ? (
            <span className="flex items-center gap-1">
              <input
                type="number"
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleTargetSave(); if (e.key === 'Escape') { setTargetInput(String(target)); setEditingTarget(false); } }}
                aria-label="ELO target"
                className="w-20 bg-background border-none text-text-primary px-2 py-1 rounded-sm text-xs focus-visible:ring-1 focus-visible:ring-accent-4 outline-none"
                autoFocus
              />
              <button onClick={handleTargetSave} className="text-accent-4 hover:text-white uppercase tracking-wider cursor-pointer transition-colors">Save</button>
              <button onClick={() => { setTargetInput(String(target)); setEditingTarget(false); }} className="text-text-secondary hover:text-text-primary uppercase tracking-wider cursor-pointer transition-colors">Cancel</button>
            </span>
          ) : (
            <button
              onClick={() => { setTargetInput(String(target)); setEditingTarget(true); }}
              aria-label={`Current ELO target ${target}, click to edit`}
              className="text-accent-4 font-bold hover:underline cursor-pointer transition-colors"
            >
              {target}
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 mb-2" aria-label="Log ELO rating">
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as 'duolingo' | 'chesscom')}
          aria-label="Platform"
          className="bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none cursor-pointer"
        >
          <option value="chesscom">Chess.com</option>
          <option value="duolingo">Duolingo</option>
        </select>
        <input
          type="number"
          value={rating}
          onChange={(e) => { setRating(e.target.value === '' ? '' : Number(e.target.value)); if (e.target.value) setFormError(''); }}
          placeholder="ELO Rating"
          aria-label="ELO Rating"
          name="elo-rating"
          className="w-32 bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none placeholder:text-text-secondary/50"
        />
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          aria-label="Notes"
          name="elo-notes"
          autoComplete="off"
          className="flex-1 min-w-[140px] bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none placeholder:text-text-secondary/50"
        />
        <button
          type="submit"
          disabled={submitting}
          className="bg-accent-4 cursor-pointer text-background px-5 py-2 rounded-sm font-bold uppercase tracking-wider text-xs hover:bg-white transition-colors disabled:opacity-50"
        >
          Log Rating
        </button>
      </form>
      {formError && (
        <p role="alert" className="text-red-400 text-xs font-mono mb-4 pl-1">{formError}</p>
      )}

      {readings.length > 0 && (
        <div className="mt-6 mb-4" aria-label="Chess ELO trend chart">
          <div className="flex gap-4 mb-3 text-xs font-mono">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 bg-accent-4" />
              <span className="text-text-secondary">Chess.com</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 bg-accent-3" />
              <span className="text-text-secondary">Duolingo</span>
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={TOKEN_CHART_GRID} />
              <XAxis
                dataKey="dateLabel"
                tick={{ fill: TOKEN_TEXT_SECONDARY, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={([dataMin, dataMax]: [number, number]) => [
                  Math.max(0, Math.min(dataMin, target) - 50),
                  Math.max(dataMax, target) + 50,
                ]}
                tick={{ fill: TOKEN_TEXT_SECONDARY, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<EloTooltip />} />
              <ReferenceLine
                y={target}
                stroke={TOKEN_TEXT_SECONDARY}
                strokeDasharray="4 3"
                strokeWidth={1}
                label={{ value: `Target ${target}`, position: 'insideTopRight', fill: TOKEN_TEXT_SECONDARY, fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}
              />
              <Line
                type="monotone"
                dataKey="chesscom"
                name="Chess.com"
                stroke={TOKEN_ACCENT_4}
                strokeWidth={2}
                dot={{ fill: TOKEN_ACCENT_4, r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="duolingo"
                name="Duolingo"
                stroke={TOKEN_ACCENT_3}
                strokeWidth={2}
                dot={{ fill: TOKEN_ACCENT_3, r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {readings.length === 0 ? (
        <p className="text-text-secondary text-xs uppercase tracking-widest py-4">No Ratings Logged</p>
      ) : (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowHistory(v => !v)}
            aria-expanded={showHistory}
            aria-controls="elo-history-list"
            className="text-xs font-mono text-text-secondary hover:text-text-primary uppercase tracking-widest cursor-pointer transition-colors mb-2"
          >
            {showHistory ? '[hide history]' : `[show history (${readings.length})]`}
          </button>
          {showHistory && (
            <div id="elo-history-list" className="overflow-y-auto max-h-[280px] flex flex-col gap-1 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2" role="list" aria-label="ELO readings">
              {readings.map((r) => (
                <div
                  key={r.id}
                  role="listitem"
                  className="flex items-center justify-between gap-4 px-3 py-2 rounded-sm bg-background hover:bg-white/5 transition-colors group"
                >
                  <span className="text-text-secondary text-xs font-mono shrink-0">{formatDate(r.recorded_at)}</span>
                  <span className={`text-xs font-mono uppercase shrink-0 ${r.platform === 'chesscom' ? 'text-accent-4' : 'text-accent-3'}`}>
                    {r.platform === 'chesscom' ? 'Chess.com' : 'Duolingo'}
                  </span>
                  <span className="text-text-primary text-sm font-bold font-mono shrink-0">{r.rating}</span>
                  {r.notes && (
                    <span className="text-text-secondary text-xs font-mono truncate flex-1">{r.notes}</span>
                  )}
                  {!r.notes && <span className="flex-1" />}
                  <button
                    onClick={() => setConfirmDeleteId(r.id)}
                    aria-label={`Delete ELO reading from ${formatDate(r.recorded_at)}`}
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
