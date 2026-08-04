import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from 'recharts';
import { TimeRangeFilter } from './time-range-filter';
import {
  type TimeRangePreset,
  filterReadingsByPreset,
  calculateDynamicDomain,
  calculatePeriodTrend,
} from '../utils/chart-helpers';
import {
  generateBodyCompositionMarkdown,
  downloadMarkdownFile,
} from '../utils/export-body-composition';
import type { UserProfile, WeightReading, CircumferenceReading, BodyFatReading } from '../types/body-composition';
import { navyMethodBF } from '../utils/body-fat';
import { KpiCard } from './kpi-card';
import { SparklineCard } from './sparkline-card';

// Design token mirrors — Recharts SVG props require literal values, not CSS vars
const WEIGHT_COLOR = '#39D353';
const TOKEN_TEXT_SECONDARY = '#7D8590';
const TOKEN_CHART_GRID = '#ffffff0d';

interface Props {
  weightReadings: WeightReading[];
  circumferenceReadings: CircumferenceReading[];
  onAddWeight: (weight: number, notes: string, recordedAt: string) => Promise<void>;
  onDeleteWeight: (id: string) => Promise<void>;
  onAddCircumference: (abdomen: number, biceps: number, quads: number, neck: number, hip: number, chest: number, calf: number, notes: string, recordedAt: string) => Promise<void>;
  onDeleteCircumference: (id: string) => Promise<void>;
  bodyFatReadings: BodyFatReading[];
  userProfile: UserProfile | null;
  onSaveProfile: (heightCm: number) => Promise<void>;
  onAddBodyFat: (bodyFatPct: number, notes: string, recordedAt: string) => Promise<void>;
  onDeleteBodyFat: (id: string) => Promise<void>;
}

type AlertState = 'catabolism_warning' | 'protein_deficit_warning' | 'optimal' | null;

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

interface WeightTooltipPayload {
  weight: number;
  notes: string;
  recorded_at: string;
}

function WeightTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload as WeightTooltipPayload;
  return (
    <div className="bg-surface border border-white/10 p-3 rounded-sm text-xs font-mono">
      <p className="text-text-secondary mb-1">{formatCentral(data.recorded_at)}</p>
      <p style={{ color: WEIGHT_COLOR }}>Weight: <span className="font-bold">{data.weight} lbs</span></p>
      {data.notes && <p className="text-text-secondary mt-1 max-w-[160px] whitespace-normal">{data.notes}</p>}
    </div>
  );
}

export function BodyCompositionSection({
  weightReadings,
  circumferenceReadings,
  onAddWeight,
  onDeleteWeight,
  onAddCircumference,
  onDeleteCircumference,
  bodyFatReadings,
  userProfile,
  onSaveProfile,
  onAddBodyFat,
  onDeleteBodyFat,
}: Props) {
  const today = new Intl.DateTimeFormat('en-CA').format(new Date());

  const [weightForm, setWeightForm] = useState({ weight: '', notes: '', date: today });
  const [circumferenceForm, setCircumferenceForm] = useState({ abdomen: '', biceps: '', quads: '', notes: '', date: today });
  const [weightSubmitting, setWeightSubmitting] = useState(false);
  const [circumferenceSubmitting, setCircumferenceSubmitting] = useState(false);
  const [weightFormError, setWeightFormError] = useState('');
  const [circumferenceFormError, setCircumferenceFormError] = useState('');
  const [showWeightHistory, setShowWeightHistory] = useState(false);
  const [showCircumferenceHistory, setShowCircumferenceHistory] = useState(false);
  const [confirmDeleteWeightId, setConfirmDeleteWeightId] = useState<string | null>(null);
  const [confirmDeleteCircumferenceId, setConfirmDeleteCircumferenceId] = useState<string | null>(null);

  const [weightPreset, setWeightPreset] = useState<TimeRangePreset>('30d');
  const [sinceDateWeight, setSinceDateWeight] = useState('');

  const [circPreset, setCircPreset] = useState<TimeRangePreset>('30d');
  const [sinceDateCircumference, setSinceDateCircumference] = useState('');

  // Step 3: profile/BF/new circumference state
  const [editingProfile, setEditingProfile] = useState(false);
  const [heightInput, setHeightInput] = useState('');
  const [bfForm, setBfForm] = useState({ pct: '', notes: '', date: new Intl.DateTimeFormat('en-CA').format(new Date()) });
  const [neckInput, setNeckInput] = useState('');
  const [hipInput, setHipInput] = useState('');
  const [chestInput, setChestInput] = useState('');
  const [calfInput, setCalfInput] = useState('');

  const alertState = useMemo((): AlertState => {
    const now = Date.now();
    const ms7 = 7 * 24 * 60 * 60 * 1000;
    const ms14 = 14 * 24 * 60 * 60 * 1000;

    const weightLast7 = weightReadings
      .filter(r => now - new Date(r.recorded_at).getTime() <= ms7)
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

    const circumLast14 = circumferenceReadings
      .filter(r => now - new Date(r.recorded_at).getTime() <= ms14)
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

    if (weightLast7.length >= 2) {
      const oldest = weightLast7[0];
      const latest = weightLast7[weightLast7.length - 1];
      const delta = (latest.weight - oldest.weight) / oldest.weight * 100;
      if (delta < -1.5) return 'catabolism_warning';
    }

    if (circumLast14.length >= 2) {
      const oldestC = circumLast14[0];
      const latestC = circumLast14[circumLast14.length - 1];
      const limbShrinking = latestC.biceps < oldestC.biceps || latestC.quads < oldestC.quads;

      if (limbShrinking && weightLast7.length >= 2) {
        const ow = weightLast7[0];
        const lw = weightLast7[weightLast7.length - 1];
        const weightDelta7 = (lw.weight - ow.weight) / ow.weight * 100;
        if (weightDelta7 < -1.0) return 'protein_deficit_warning';
      }

      if (
        latestC.abdomen < oldestC.abdomen &&
        latestC.biceps >= oldestC.biceps &&
        latestC.quads >= oldestC.quads
      ) return 'optimal';
    }

    return null;
  }, [weightReadings, circumferenceReadings]);

  const filteredWeightReadings = useMemo(
    () => filterReadingsByPreset(weightReadings, (r) => r.recorded_at, weightPreset, sinceDateWeight),
    [weightReadings, weightPreset, sinceDateWeight]
  );

  const prevWeightReadings = useMemo(() => {
    if (weightPreset !== '30d') return [];
    const now = Date.now();
    const start30 = now - 30 * 24 * 60 * 60 * 1000;
    const start60 = now - 60 * 24 * 60 * 60 * 1000;
    return weightReadings.filter((r) => {
      const t = new Date(r.recorded_at).getTime();
      return t >= start60 && t < start30;
    });
  }, [weightReadings, weightPreset]);

  const weightTrend = useMemo(
    () => calculatePeriodTrend(filteredWeightReadings.map(r => r.weight), prevWeightReadings.map(r => r.weight)),
    [filteredWeightReadings, prevWeightReadings]
  );

  const filteredCircumferenceReadings = useMemo(
    () => filterReadingsByPreset(circumferenceReadings, (r) => r.recorded_at, circPreset, sinceDateCircumference),
    [circumferenceReadings, circPreset, sinceDateCircumference]
  );

  const handleWeightSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = Number(weightForm.weight);
    if (!weightForm.weight || w <= 0) {
      setWeightFormError('Weight must be greater than 0');
      return;
    }
    setWeightFormError('');
    setWeightSubmitting(true);
    try {
      await onAddWeight(w, weightForm.notes, weightForm.date);
      setWeightForm(f => ({ ...f, weight: '', notes: '' }));
    } finally {
      setWeightSubmitting(false);
    }
  };

  // Step 4: updated validation — at least one field required
  const handleCircumferenceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const allZero = [circumferenceForm.abdomen, circumferenceForm.biceps, circumferenceForm.quads, neckInput, hipInput, chestInput, calfInput]
      .every(v => !v || Number(v) <= 0);
    if (allZero) {
      setCircumferenceFormError('At least one measurement must be greater than 0');
      return;
    }
    setCircumferenceFormError('');
    setCircumferenceSubmitting(true);
    try {
      await onAddCircumference(
        Number(circumferenceForm.abdomen) || 0,
        Number(circumferenceForm.biceps) || 0,
        Number(circumferenceForm.quads) || 0,
        Number(neckInput) || 0,
        Number(hipInput) || 0,
        Number(chestInput) || 0,
        Number(calfInput) || 0,
        circumferenceForm.notes,
        circumferenceForm.date,
      );
      setCircumferenceForm(f => ({ ...f, abdomen: '', biceps: '', quads: '', notes: '' }));
      setNeckInput(''); setHipInput(''); setChestInput(''); setCalfInput('');
    } finally {
      setCircumferenceSubmitting(false);
    }
  };

  const weightChartData = [...filteredWeightReadings].reverse();

  const avgWeight = filteredWeightReadings.length > 0
    ? Math.round(filteredWeightReadings.reduce((sum, r) => sum + r.weight, 0) / filteredWeightReadings.length * 10) / 10
    : null;

  const weightDomain = useMemo(() => {
    const vals = filteredWeightReadings.map(r => r.weight);
    return calculateDynamicDomain(vals, [], 0.05, 1);
  }, [filteredWeightReadings]);

  const computeAvg = (readings: CircumferenceReading[], key: keyof CircumferenceReading): number | null => {
    const nonZero = readings.filter(r => (r[key] as number) > 0);
    if (!nonZero.length) return null;
    return Math.round(nonZero.reduce((s, r) => s + (r[key] as number), 0) / nonZero.length * 10) / 10;
  };
  const avgAbdomen = computeAvg(filteredCircumferenceReadings, 'abdomen');
  const avgBiceps = computeAvg(filteredCircumferenceReadings, 'biceps');
  const avgQuads = computeAvg(filteredCircumferenceReadings, 'quads');

  // Step 5: KPI data derivation
  const latestCirc = circumferenceReadings[0];
  const latestWeight = weightReadings[0];
  const latestBF = bodyFatReadings[0];

  const avgWeight30d = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const recent = weightReadings.filter(r => new Date(r.recorded_at) >= cutoff);
    if (!recent.length) return null;
    return recent.reduce((s, r) => s + r.weight, 0) / recent.length;
  }, [weightReadings]);

  const navyBF = useMemo(() => {
    if (!userProfile || !latestCirc || !latestCirc.neck || !latestCirc.abdomen) return null;
    const val = navyMethodBF(latestCirc.neck, latestCirc.abdomen, userProfile.height_cm);
    return isFinite(val) ? val : null;
  }, [userProfile, latestCirc]);

  const whRatio = useMemo(() => {
    if (!latestCirc || !latestCirc.abdomen || !latestCirc.hip) return null;
    return latestCirc.abdomen / latestCirc.hip;
  }, [latestCirc]);

  const weightDelta30d = latestWeight && avgWeight30d
    ? Math.round((latestWeight.weight - avgWeight30d) * 10) / 10
    : null;

  const alertConfig: Record<Exclude<AlertState, null>, { color: string; message: string }> = {
    catabolism_warning: {
      color: '#ef4444',
      message: 'Catabolism risk: 7-day weight loss exceeds 1.5%. Increase protein intake and resistance training.',
    },
    protein_deficit_warning: {
      color: '#f59e0b',
      message: 'High risk: limb circumference decreasing with weekly weight loss above 1.0%. Review protein targets.',
    },
    optimal: {
      color: '#39D353',
      message: 'Optimal metabolic response: waist reduction with muscle mass preserved.',
    },
  };

  return (
    <section aria-label="Body Composition" className="w-full bg-surface p-6 rounded-sm border border-white/5">
      {confirmDeleteWeightId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-surface border border-white/10 p-8 rounded-sm shadow-2xl max-w-sm w-full">
            <h3 className="text-xl font-bold uppercase tracking-tight text-red-500 mb-2">Delete Reading</h3>
            <p className="text-text-secondary mb-6 text-sm">
              Are you sure you want to permanently delete this weight reading?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteWeightId(null)}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  void onDeleteWeight(confirmDeleteWeightId);
                  setConfirmDeleteWeightId(null);
                }}
                className="bg-red-900/30 hover:bg-red-600 text-red-500 hover:text-white px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteCircumferenceId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-surface border border-white/10 p-8 rounded-sm shadow-2xl max-w-sm w-full">
            <h3 className="text-xl font-bold uppercase tracking-tight text-red-500 mb-2">Delete Reading</h3>
            <p className="text-text-secondary mb-6 text-sm">
              Are you sure you want to permanently delete this circumference reading?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteCircumferenceId(null)}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  void onDeleteCircumference(confirmDeleteCircumferenceId);
                  setConfirmDeleteCircumferenceId(null);
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
          <span className="text-accent-3 mr-2 select-none" aria-hidden="true">&gt;</span>Body Composition
        </h2>
        <button
          type="button"
          disabled={weightReadings.length === 0 && circumferenceReadings.length === 0}
          onClick={() => {
            const md = generateBodyCompositionMarkdown(weightReadings, circumferenceReadings, bodyFatReadings, userProfile);
            downloadMarkdownFile(md);
          }}
          className="text-xs font-mono font-bold uppercase tracking-wider px-3 py-1.5 rounded-sm border border-white/10 text-text-secondary hover:text-text-primary hover:border-white/25 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Export body composition data as Markdown"
        >
          ↓ Export MD
        </button>
      </div>

      {alertState !== null && (
        <div
          role="alert"
          className="mb-4 px-4 py-3 rounded-sm border text-sm font-mono"
          style={{ borderColor: alertConfig[alertState].color, color: alertConfig[alertState].color }}
        >
          {alertConfig[alertState].message}
        </div>
      )}

      {/* ── Weight subsection ── */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-bold uppercase tracking-widest text-text-secondary">Weight Log</h3>
          <TimeRangeFilter
            activePreset={weightPreset}
            onPresetChange={setWeightPreset}
            customDate={sinceDateWeight}
            onCustomDateChange={setSinceDateWeight}
            customDateAriaLabel="Filter weight readings from date"
          />
        </div>

        {avgWeight !== null && (
          <div className="flex flex-wrap items-baseline gap-3 mb-3" aria-label="Average weight">
            <span className="text-text-secondary text-xs font-mono uppercase tracking-widest">
              {weightPreset === '30d' ? '30D Avg' : weightPreset === '90d' ? '90D Avg' : weightPreset === '1y' ? '1Y Avg' : sinceDateWeight ? `Avg since ${sinceDateWeight}` : 'Avg'}
            </span>
            <span className="text-3xl font-bold font-mono text-accent-4">{avgWeight}</span>
            <span className="text-text-secondary text-xs font-mono">lbs</span>
            <span className="text-text-secondary text-xs font-mono font-bold">({filteredWeightReadings.length} readings)</span>

            {weightPreset === '30d' && prevWeightReadings.length > 0 && weightTrend.delta !== 0 && (
              <span
                className={`text-xs font-mono font-bold px-2 py-0.5 rounded-sm border ${
                  weightTrend.delta < 0
                    ? 'text-accent-4 bg-accent-4/10 border-accent-4/30'
                    : 'text-amber-400 bg-amber-400/10 border-amber-400/30'
                }`}
                aria-label="Period-over-period weight trend"
              >
                {weightTrend.delta > 0 ? '▲' : '▼'} {Math.abs(weightTrend.delta)} lbs ({weightTrend.percent > 0 ? '+' : ''}{weightTrend.percent}%) vs prev 30d
              </span>
            )}
          </div>
        )}

        <form onSubmit={handleWeightSubmit} className="flex flex-wrap gap-2 mb-2" aria-label="Log weight">
          <input
            type="number"
            value={weightForm.weight}
            onChange={(e) => { setWeightForm(f => ({ ...f, weight: e.target.value })); if (e.target.value) setWeightFormError(''); }}
            placeholder="Weight (lbs)"
            aria-label="Weight"
            name="weight-value"
            step="0.1"
            className="w-36 bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none placeholder:text-text-secondary/50 font-mono"
          />
          <input
            type="date"
            value={weightForm.date}
            onChange={(e) => setWeightForm(f => ({ ...f, date: e.target.value }))}
            aria-label="Date"
            name="weight-date"
            className="bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none font-mono"
          />
          <input
            type="text"
            value={weightForm.notes}
            onChange={(e) => setWeightForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Notes (optional)"
            aria-label="Notes"
            name="weight-notes"
            autoComplete="off"
            className="flex-1 min-w-[140px] bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none placeholder:text-text-secondary/50 font-mono"
          />
          <button
            type="submit"
            disabled={weightSubmitting}
            className="bg-accent-4 cursor-pointer text-background px-5 py-2 rounded-sm font-bold uppercase tracking-wider text-xs hover:bg-white transition-colors disabled:opacity-50"
          >
            Log Weight
          </button>
        </form>
        {weightFormError && (
          <p role="alert" className="text-red-400 text-xs font-mono mb-4 pl-1">{weightFormError}</p>
        )}

        {filteredWeightReadings.length > 0 && (
          <div className="mt-6 mb-6" aria-label="Weight trend chart">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weightChartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={TOKEN_CHART_GRID} />
                <XAxis
                  dataKey="recorded_at"
                  tickFormatter={formatCentralShort}
                  tick={{ fill: TOKEN_TEXT_SECONDARY, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={weightDomain}
                  tick={{ fill: TOKEN_TEXT_SECONDARY, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<WeightTooltip />} />
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke={WEIGHT_COLOR}
                  strokeWidth={2}
                  dot={{ fill: WEIGHT_COLOR, r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {weightReadings.length === 0 ? (
          <p className="text-text-secondary text-xs uppercase tracking-widest py-4">No Readings Logged</p>
        ) : (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowWeightHistory(v => !v)}
              aria-expanded={showWeightHistory}
              aria-controls="weight-history-list"
              className="text-xs font-mono text-text-secondary hover:text-text-primary uppercase tracking-widest cursor-pointer transition-colors mb-2"
            >
              {showWeightHistory ? '[hide history]' : `[show history (${weightReadings.length})]`}
            </button>
            {showWeightHistory && (
              <div id="weight-history-list" className="overflow-y-auto max-h-[280px] flex flex-col gap-1 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2" role="list" aria-label="Weight readings">
                {weightReadings.map((r) => (
                  <div
                    key={r.id}
                    role="listitem"
                    className="flex items-center justify-between gap-4 px-3 py-2 rounded-sm bg-background hover:bg-white/5 transition-colors group"
                  >
                    <span className="text-text-secondary text-xs font-mono shrink-0">{formatCentral(r.recorded_at)}</span>
                    <span className="text-accent-4 text-sm font-bold font-mono shrink-0">{r.weight} lbs</span>
                    {r.notes && <span className="text-text-secondary text-xs font-mono truncate flex-1">{r.notes}</span>}
                    {!r.notes && <span className="flex-1" />}
                    <button
                      onClick={() => setConfirmDeleteWeightId(r.id)}
                      aria-label={`Delete weight reading from ${formatCentral(r.recorded_at)}`}
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
      </div>

      {/* ── Body Fat % section (Step 7) ── */}
      {bodyFatReadings.length > 0 && (
        <section className="border-t border-white/5 pt-6 mt-2 mb-8">
          <h3 className="text-xs font-mono uppercase tracking-widest text-text-secondary mb-4">Body Fat %</h3>
          {/* Single chart */}
          <div style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={[...bodyFatReadings].reverse()} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid stroke={TOKEN_CHART_GRID} strokeDasharray="2 2" />
                <XAxis dataKey="recorded_at" tick={false} axisLine={false} tickLine={false} />
                <YAxis domain={['auto', 'auto']} tick={{ fill: TOKEN_TEXT_SECONDARY, fontSize: 10, fontFamily: 'inherit' }} axisLine={false} tickLine={false} width={32} />
                <Tooltip
                  contentStyle={{ background: '#161B22', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2, fontSize: 11, fontFamily: 'inherit' }}
                  labelFormatter={(_, p) => p[0] ? formatCentral((p[0].payload as BodyFatReading).recorded_at) : ''}
                  formatter={(v: number) => [`${v}%`, 'BF%']}
                />
                <Line type="monotone" dataKey="body_fat_pct" stroke={WEIGHT_COLOR} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {/* Log form */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const pct = Number(bfForm.pct);
              if (!pct || pct <= 0) return;
              await onAddBodyFat(pct, bfForm.notes, bfForm.date);
              setBfForm({ pct: '', notes: '', date: new Intl.DateTimeFormat('en-CA').format(new Date()) });
            }}
            className="flex flex-wrap gap-2 mt-4"
          >
            <input type="number" min="0" step="0.1" value={bfForm.pct} onChange={e => setBfForm(f => ({ ...f, pct: e.target.value }))} placeholder="BF%" className="w-20 bg-surface border border-white/10 text-text-primary text-xs px-2 py-1 rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-accent-4 font-mono" />
            <input type="date" value={bfForm.date} onChange={e => setBfForm(f => ({ ...f, date: e.target.value }))} className="bg-surface border border-white/10 text-text-primary text-xs px-2 py-1 rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-accent-4 font-mono" />
            <input type="text" value={bfForm.notes} onChange={e => setBfForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes" className="flex-1 min-w-[120px] bg-surface border border-white/10 text-text-primary text-xs px-2 py-1 rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-accent-4 font-mono" />
            <button type="submit" className="cursor-pointer bg-accent-4 text-background px-4 py-1 rounded-sm text-xs font-bold uppercase tracking-wider hover:bg-white transition-colors">Log</button>
          </form>
          {/* History list */}
          <ul className="mt-3 space-y-1 max-h-40 overflow-y-auto">
            {bodyFatReadings.map(r => (
              <li key={r.id} className="flex items-center justify-between text-xs font-mono text-text-secondary">
                <span>{formatCentral(r.recorded_at)}</span>
                <span className="text-text-primary font-bold">{r.body_fat_pct}%</span>
                <span className="truncate max-w-[100px] text-text-secondary">{r.notes}</span>
                <button onClick={() => onDeleteBodyFat(r.id)} className="cursor-pointer text-red-400 hover:text-red-300 uppercase text-[10px] tracking-widest transition-colors">Delete</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Circumference subsection ── */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-bold uppercase tracking-widest text-text-secondary">Circumference Log</h3>
          <TimeRangeFilter
            activePreset={circPreset}
            onPresetChange={setCircPreset}
            customDate={sinceDateCircumference}
            onCustomDateChange={setSinceDateCircumference}
            customDateAriaLabel="Filter circumference readings from date"
          />
        </div>

        {filteredCircumferenceReadings.length > 0 && (
          <div className="flex flex-wrap items-baseline gap-3 mb-3" aria-label="Average circumference">
            <span className="text-text-secondary text-xs font-mono uppercase tracking-widest">
              {circPreset === '30d' ? '30D Avg' : circPreset === '90d' ? '90D Avg' : circPreset === '1y' ? '1Y Avg' : sinceDateCircumference ? `Avg since ${sinceDateCircumference}` : 'Avg'}
            </span>
            <span className="text-xl font-bold font-mono text-text-secondary">{avgAbdomen ?? '—'}</span>
            <span className="text-text-secondary text-xs">/</span>
            <span className="text-xl font-bold font-mono text-accent-4">{avgBiceps ?? '—'}</span>
            <span className="text-text-secondary text-xs">/</span>
            <span className="text-xl font-bold font-mono text-accent-3">{avgQuads ?? '—'}</span>
            <span className="text-text-secondary text-xs font-mono">cm</span>
            <span className="text-text-secondary text-xs font-mono font-bold">({filteredCircumferenceReadings.length} readings)</span>
          </div>
        )}

        <form onSubmit={handleCircumferenceSubmit} className="flex flex-wrap gap-2 mb-2" aria-label="Log circumference">
          <input
            type="number"
            value={circumferenceForm.abdomen}
            onChange={(e) => { setCircumferenceForm(f => ({ ...f, abdomen: e.target.value })); if (e.target.value) setCircumferenceFormError(''); }}
            placeholder="Abdomen (cm)"
            aria-label="Abdomen"
            name="circ-abdomen"
            step="0.1"
            className="w-32 bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none placeholder:text-text-secondary/50 font-mono"
          />
          <input
            type="number"
            value={circumferenceForm.biceps}
            onChange={(e) => { setCircumferenceForm(f => ({ ...f, biceps: e.target.value })); if (e.target.value) setCircumferenceFormError(''); }}
            placeholder="Biceps (cm)"
            aria-label="Biceps"
            name="circ-biceps"
            step="0.1"
            className="w-28 bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none placeholder:text-text-secondary/50 font-mono"
          />
          <input
            type="number"
            value={circumferenceForm.quads}
            onChange={(e) => { setCircumferenceForm(f => ({ ...f, quads: e.target.value })); if (e.target.value) setCircumferenceFormError(''); }}
            placeholder="Quads (cm)"
            aria-label="Quads"
            name="circ-quads"
            step="0.1"
            className="w-28 bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none placeholder:text-text-secondary/50 font-mono"
          />
          <input type="number" min="0" step="0.1" value={neckInput} onChange={e => setNeckInput(e.target.value)} placeholder="Neck" aria-label="Neck" name="circ-neck" className="w-20 bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none placeholder:text-text-secondary/50 font-mono" />
          <input type="number" min="0" step="0.1" value={hipInput} onChange={e => setHipInput(e.target.value)} placeholder="Hip" aria-label="Hip" name="circ-hip" className="w-20 bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none placeholder:text-text-secondary/50 font-mono" />
          <input type="number" min="0" step="0.1" value={chestInput} onChange={e => setChestInput(e.target.value)} placeholder="Chest" aria-label="Chest" name="circ-chest" className="w-20 bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none placeholder:text-text-secondary/50 font-mono" />
          <input type="number" min="0" step="0.1" value={calfInput} onChange={e => setCalfInput(e.target.value)} placeholder="Calf" aria-label="Calf" name="circ-calf" className="w-20 bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none placeholder:text-text-secondary/50 font-mono" />
          <input
            type="date"
            value={circumferenceForm.date}
            onChange={(e) => setCircumferenceForm(f => ({ ...f, date: e.target.value }))}
            aria-label="Date"
            name="circ-date"
            className="bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none font-mono"
          />
          <input
            type="text"
            value={circumferenceForm.notes}
            onChange={(e) => setCircumferenceForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Notes (optional)"
            aria-label="Notes"
            name="circ-notes"
            autoComplete="off"
            className="flex-1 min-w-[140px] bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none placeholder:text-text-secondary/50 font-mono"
          />
          <button
            type="submit"
            disabled={circumferenceSubmitting}
            className="bg-accent-4 cursor-pointer text-background px-5 py-2 rounded-sm font-bold uppercase tracking-wider text-xs hover:bg-white transition-colors disabled:opacity-50"
          >
            Log Measurements
          </button>
        </form>
        {circumferenceFormError && (
          <p role="alert" className="text-red-400 text-xs font-mono mb-4 pl-1">{circumferenceFormError}</p>
        )}

        {/* Step 6: Profile row */}
        <div className="flex items-center gap-3 mb-4 mt-4">
          {userProfile && !editingProfile ? (
            <>
              <span className="text-xs font-mono text-text-secondary uppercase tracking-widest">
                Height: <span className="text-text-primary font-bold">{userProfile.height_cm} cm</span>
              </span>
              <button
                onClick={() => { setEditingProfile(true); setHeightInput(String(userProfile.height_cm)); }}
                className="text-xs font-mono text-text-secondary hover:text-text-primary uppercase tracking-widest cursor-pointer transition-colors"
              >
                [Edit]
              </button>
            </>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const h = Number(heightInput);
                if (!h || h <= 0) return;
                await onSaveProfile(h);
                setEditingProfile(false);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="number"
                min="1"
                step="0.1"
                value={heightInput}
                onChange={e => setHeightInput(e.target.value)}
                placeholder="Height (cm)"
                className="w-32 bg-surface border border-white/10 text-text-primary text-xs px-2 py-1 rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-accent-4 font-mono"
                autoFocus
              />
              <button type="submit" className="cursor-pointer bg-accent-4 text-background px-3 py-1 rounded-sm text-xs font-bold uppercase tracking-wider hover:bg-white transition-colors">
                Save
              </button>
              {editingProfile && (
                <button type="button" onClick={() => setEditingProfile(false)} className="cursor-pointer text-xs font-mono text-text-secondary hover:text-text-primary uppercase transition-colors">
                  Cancel
                </button>
              )}
            </form>
          )}
        </div>

        {/* Step 6: KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <KpiCard
            label="BF% Navy"
            value={navyBF !== null ? `${Math.round(navyBF * 10) / 10}%` : null}
            delta={null}
            deltaPositive={null}
            improvementDirection="down"
          />
          <KpiCard
            label="BF% Samsung"
            value={latestBF ? `${latestBF.body_fat_pct}%` : null}
            delta={null}
            deltaPositive={null}
            improvementDirection="down"
          />
          <KpiCard
            label="W/H Ratio"
            value={whRatio !== null ? String(Math.round(whRatio * 100) / 100) : null}
            delta={null}
            deltaPositive={null}
            improvementDirection="down"
          />
          <KpiCard
            label="Weight"
            value={latestWeight ? `${latestWeight.weight} lbs` : null}
            delta={weightDelta30d !== null ? `${weightDelta30d > 0 ? '+' : ''}${weightDelta30d} vs 30d avg` : null}
            deltaPositive={weightDelta30d !== null ? weightDelta30d > 0 : null}
            improvementDirection="down"
          />
        </div>

        {/* Step 8: Sparkline grid (replaces old circumference LineChart) */}
        {filteredCircumferenceReadings.length > 0 && (
          <div className="mt-4 mb-6" aria-label="Circumference trend chart">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Abdomen', key: 'abdomen', color: '#7D8590' },
                { label: 'Hip',     key: 'hip',     color: '#7D8590' },
                { label: 'Neck',    key: 'neck',    color: '#0E4429' },
                { label: 'Chest',   key: 'chest',   color: '#39D353' },
                { label: 'Biceps',  key: 'biceps',  color: '#39D353' },
                { label: 'Quads',   key: 'quads',   color: '#26A641' },
                { label: 'Calf',    key: 'calf',    color: '#006D32' },
              ].map(({ label, key, color }) => (
                <SparklineCard
                  key={key}
                  label={label}
                  unit="cm"
                  color={color}
                  improvementDirection="down"
                  data={filteredCircumferenceReadings
                    .filter(r => (r[key as keyof CircumferenceReading] as number) > 0)
                    .map(r => ({ date: r.recorded_at, value: r[key as keyof CircumferenceReading] as number }))}
                />
              ))}
            </div>
          </div>
        )}

        {circumferenceReadings.length === 0 ? (
          <p className="text-text-secondary text-xs uppercase tracking-widest py-4">No Readings Logged</p>
        ) : (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowCircumferenceHistory(v => !v)}
              aria-expanded={showCircumferenceHistory}
              aria-controls="circumference-history-list"
              className="text-xs font-mono text-text-secondary hover:text-text-primary uppercase tracking-widest cursor-pointer transition-colors mb-2"
            >
              {showCircumferenceHistory ? '[hide history]' : `[show history (${circumferenceReadings.length})]`}
            </button>
            {showCircumferenceHistory && (
              <div id="circumference-history-list" className="overflow-y-auto max-h-[280px] flex flex-col gap-1 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2" role="list" aria-label="Circumference readings">
                {circumferenceReadings.map((r) => (
                  <div
                    key={r.id}
                    role="listitem"
                    className="flex items-center justify-between gap-4 px-3 py-2 rounded-sm bg-background hover:bg-white/5 transition-colors group"
                  >
                    <span className="text-text-secondary text-xs font-mono shrink-0">{formatCentral(r.recorded_at)}</span>
                    <span className="text-sm font-bold font-mono shrink-0 flex gap-1 items-baseline flex-wrap">
                      <span className="text-text-secondary">{r.abdomen}</span>
                      {r.biceps > 0 && <><span className="text-text-secondary mx-0.5">/</span><span className="text-accent-4">{r.biceps}</span></>}
                      {r.quads > 0 && <><span className="text-text-secondary mx-0.5">/</span><span className="text-accent-3">{r.quads}</span></>}
                      {r.neck ? <><span className="text-text-secondary mx-0.5">/</span><span className="text-text-secondary">{r.neck}</span></> : null}
                      {r.hip ? <><span className="text-text-secondary mx-0.5">/</span><span className="text-text-secondary">{r.hip}</span></> : null}
                      {r.chest ? <><span className="text-text-secondary mx-0.5">/</span><span className="text-text-secondary">{r.chest}</span></> : null}
                      {r.calf ? <><span className="text-text-secondary mx-0.5">/</span><span className="text-text-secondary">{r.calf}</span></> : null}
                      <span className="text-text-secondary text-xs ml-1">cm</span>
                    </span>
                    {r.notes && <span className="text-text-secondary text-xs font-mono truncate flex-1">{r.notes}</span>}
                    {!r.notes && <span className="flex-1" />}
                    <button
                      onClick={() => setConfirmDeleteCircumferenceId(r.id)}
                      aria-label={`Delete circumference reading from ${formatCentral(r.recorded_at)}`}
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
      </div>
    </section>
  );
}
