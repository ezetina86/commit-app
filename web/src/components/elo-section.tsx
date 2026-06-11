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

const TOKEN_GREEN          = '#39D353';
const TOKEN_TEXT_SECONDARY = '#7D8590';
const TOKEN_CHART_GRID     = '#ffffff0d';
const TOKEN_ACCENT_1       = '#0E4429';

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
  onAdd: (platform: 'duolingo' | 'chesscom', rating: number) => Promise<void>;
  onDelete: (id: string) => void;
  onTargetChange: (target: number) => Promise<void>;
}

// ── Tooltip ──────────────────────────────────────────────────────────────────

interface EloTooltipPoint {
  dateLabel: string;
  rating: number;
}

function EloTooltip({ active, payload }: TooltipProps<number, string>) {
  /* v8 ignore next */
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload as EloTooltipPoint;
  return (
    <div className="bg-surface border border-white/10 p-3 rounded-sm text-xs font-mono">
      <p className="text-text-secondary mb-1">{data.dateLabel}</p>
      <p style={{ color: TOKEN_GREEN }}>
        <span className="inline-block w-2 h-2 mr-1" style={{ background: TOKEN_GREEN }} />
        <span className="font-bold">{data.rating}</span>
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

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

export function EloSection({ readings, target, onAdd, onDelete, onTargetChange }: EloSectionProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<'chesscom' | 'duolingo'>('chesscom');
  const [platform, setPlatform] = useState<'duolingo' | 'chesscom'>('chesscom');
  const [rating, setRating] = useState<number | ''>('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState(String(target));

  const handleTabChange = (p: 'chesscom' | 'duolingo') => {
    setSelectedPlatform(p);
    setPlatform(p);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating || Number(rating) <= 0) {
      setFormError('Rating must be greater than 0');
      return;
    }
    setFormError('');
    setSubmitting(true);
    try {
      await onAdd(platform, Number(rating));
      setRating('');
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

  const visibleReadings = useMemo(
    () => readings.filter((r) => r.platform === selectedPlatform),
    [readings, selectedPlatform],
  );

  const chartData = useMemo(() => {
    return visibleReadings
      .slice()
      .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
      .map((r) => ({
        recorded_at: r.recorded_at,
        dateLabel: formatDate(r.recorded_at),
        rating: r.rating,
      }));
  }, [visibleReadings]);

  const maxRating = useMemo(() => {
    if (visibleReadings.length === 0) return 0;
    return Math.max(...visibleReadings.map((r) => r.rating));
  }, [visibleReadings]);

  return (
    <section aria-label="Chess ELO Rating" className="w-full bg-surface p-6 rounded-sm border border-white/5">
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-surface border border-white/10 p-8 rounded-sm shadow-2xl max-w-sm w-full">
            <h3 className="text-xl font-bold uppercase tracking-tight text-red-500 mb-2">Delete Reading</h3>
            <p className="text-text-secondary mb-6 text-sm">Permanently delete this ELO reading?</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => { onDelete(confirmDeleteId); setConfirmDeleteId(null); }}
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTargetSave();
                  if (e.key === 'Escape') { setTargetInput(String(target)); setEditingTarget(false); }
                }}
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

      <div className="flex gap-1 mb-4" role="tablist" aria-label="Platform">
        {(['chesscom', 'duolingo'] as const).map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={selectedPlatform === p}
            onClick={() => handleTabChange(p)}
            className="px-3 py-1 text-xs font-mono uppercase tracking-wider rounded-sm border transition-colors cursor-pointer"
            style={
              selectedPlatform === p
                ? { color: TOKEN_GREEN, background: TOKEN_ACCENT_1, borderColor: TOKEN_GREEN + '66' }
                : { color: TOKEN_TEXT_SECONDARY, background: 'transparent', borderColor: 'rgba(255,255,255,0.08)' }
            }
          >
            {p === 'chesscom' ? 'Chess.com' : 'Duolingo'}
          </button>
        ))}
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

      {visibleReadings.length > 0 && (
        <div className="mt-6 mb-4" aria-label="Chess ELO trend chart">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={TOKEN_CHART_GRID} />
              <XAxis
                dataKey="recorded_at"
                tickFormatter={formatDateShort}
                tick={{ fill: TOKEN_TEXT_SECONDARY, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                /* v8 ignore next */
                domain={([dataMin, dataMax]: [number, number]) => [
                  Math.max(0, Math.min(dataMin, target) - 50),
                  Math.max(dataMax, target, maxRating) + 50,
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
              {maxRating > 0 && maxRating !== target && (
                <ReferenceLine
                  y={maxRating}
                  stroke={TOKEN_TEXT_SECONDARY}
                  strokeDasharray="2 4"
                  strokeWidth={1}
                  label={{ value: `Max ${maxRating}`, position: 'insideBottomRight', fill: TOKEN_TEXT_SECONDARY, fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}
                />
              )}
              <Line
                type="monotone"
                dataKey="rating"
                stroke={TOKEN_GREEN}
                strokeWidth={2}
                dot={{ r: 3, fill: TOKEN_GREEN }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {visibleReadings.length === 0 ? (
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
            {showHistory ? '[hide history]' : `[show history (${visibleReadings.length})]`}
          </button>
          {showHistory && (
            <div
              id="elo-history-list"
              className="overflow-y-auto max-h-[280px] flex flex-col gap-1 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2"
              role="list"
              aria-label="ELO readings"
            >
              {visibleReadings.map((r) => (
                <div
                  key={r.id}
                  role="listitem"
                  className="flex items-center justify-between gap-4 px-3 py-2 rounded-sm bg-background hover:bg-white/5 transition-colors group"
                >
                  <span className="text-text-secondary text-xs font-mono shrink-0">{formatDate(r.recorded_at)}</span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {r.platform === 'chesscom'
                      ? <svg width="7" height="7" aria-hidden="true"><rect width="7" height="7" fill={TOKEN_GREEN} /></svg>
                      : <svg width="7" height="7" aria-hidden="true"><circle cx="3.5" cy="3.5" r="3.5" fill={TOKEN_GREEN} /></svg>}
                    <span className="text-xs font-mono text-accent-4">
                      {r.platform === 'chesscom' ? 'Chess.com' : 'Duolingo'}
                    </span>
                  </span>
                  <span className="text-text-primary text-sm font-bold font-mono shrink-0">{r.rating}</span>
                  <span className="flex-1" />
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
