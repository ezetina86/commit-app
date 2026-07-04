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

// Design token mirrors — Recharts SVG props require literal values, not CSS vars
const ABDOMEN_COLOR = '#7D8590';
const BICEPS_COLOR = '#39D353';
const QUADS_COLOR = '#26A641';
const WEIGHT_COLOR = '#39D353';
const TOKEN_TEXT_SECONDARY = '#7D8590';
const TOKEN_CHART_GRID = '#ffffff0d';

export interface WeightReading {
  id: string;
  weight: number;
  notes: string;
  recorded_at: string;
}

export interface CircumferenceReading {
  id: string;
  abdomen: number;
  biceps: number;
  quads: number;
  notes: string;
  recorded_at: string;
}

interface Props {
  weightReadings: WeightReading[];
  circumferenceReadings: CircumferenceReading[];
  onAddWeight: (weight: number, notes: string, recordedAt: string) => Promise<void>;
  onDeleteWeight: (id: string) => Promise<void>;
  onAddCircumference: (abdomen: number, biceps: number, quads: number, notes: string, recordedAt: string) => Promise<void>;
  onDeleteCircumference: (id: string) => Promise<void>;
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

interface CircumferenceTooltipPayload {
  abdomen: number;
  biceps: number;
  quads: number;
  notes: string;
  recorded_at: string;
}

function CircumferenceTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload as CircumferenceTooltipPayload;
  return (
    <div className="bg-surface border border-white/10 p-3 rounded-sm text-xs font-mono">
      <p className="text-text-secondary mb-1">{formatCentral(data.recorded_at)}</p>
      <p style={{ color: ABDOMEN_COLOR }}>Abdomen: <span className="font-bold">{data.abdomen} cm</span></p>
      <p style={{ color: BICEPS_COLOR }}>Biceps: <span className="font-bold">{data.biceps} cm</span></p>
      <p style={{ color: QUADS_COLOR }}>Quads: <span className="font-bold">{data.quads} cm</span></p>
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

  // ponytail: oldest-vs-latest trend; upgrade to linear regression if clinical accuracy needed
  const alertState = useMemo((): AlertState => {
    const now = Date.now();
    const ms7 = 7 * 24 * 60 * 60 * 1000;
    const ms14 = 14 * 24 * 60 * 60 * 1000;

    // Sort ASC by recorded_at for all windows
    const weightLast7 = weightReadings
      .filter(r => now - new Date(r.recorded_at).getTime() <= ms7)
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

    const circumLast14 = circumferenceReadings
      .filter(r => now - new Date(r.recorded_at).getTime() <= ms14)
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

    // 1. catabolism_warning
    if (weightLast7.length >= 2) {
      const oldest = weightLast7[0];
      const latest = weightLast7[weightLast7.length - 1];
      const delta = (latest.weight - oldest.weight) / oldest.weight * 100;
      if (delta < -1.5) return 'catabolism_warning';
    }

    // 2. protein_deficit_warning
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

      // 3. optimal
      if (
        latestC.abdomen < oldestC.abdomen &&
        latestC.biceps >= oldestC.biceps &&
        latestC.quads >= oldestC.quads
      ) return 'optimal';
    }

    return null;
  }, [weightReadings, circumferenceReadings]);

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

  const handleCircumferenceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const a = Number(circumferenceForm.abdomen);
    const b = Number(circumferenceForm.biceps);
    const q = Number(circumferenceForm.quads);
    if (!circumferenceForm.abdomen || a <= 0 || !circumferenceForm.biceps || b <= 0 || !circumferenceForm.quads || q <= 0) {
      setCircumferenceFormError('Abdomen, biceps, and quads must be greater than 0');
      return;
    }
    setCircumferenceFormError('');
    setCircumferenceSubmitting(true);
    try {
      await onAddCircumference(a, b, q, circumferenceForm.notes, circumferenceForm.date);
      setCircumferenceForm(f => ({ ...f, abdomen: '', biceps: '', quads: '', notes: '' }));
    } finally {
      setCircumferenceSubmitting(false);
    }
  };

  const weightChartData = [...weightReadings].reverse();
  const circumferenceChartData = [...circumferenceReadings].reverse();

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
      {/* Weight delete confirm modal */}
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

      {/* Circumference delete confirm modal */}
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

      {/* Section header */}
      <h2 className="text-xl font-bold uppercase tracking-tight mb-4">
        <span className="text-accent-3 mr-2 select-none" aria-hidden="true">&gt;</span>Body Composition
      </h2>

      {/* Alert banner */}
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
        <h3 className="text-sm font-bold uppercase tracking-widest text-text-secondary mb-3">Weight Log</h3>

        <form onSubmit={handleWeightSubmit} className="flex flex-wrap gap-2 mb-2" aria-label="Log weight">
          <input
            type="number"
            value={weightForm.weight}
            onChange={(e) => { setWeightForm(f => ({ ...f, weight: e.target.value })); if (e.target.value) setWeightFormError(''); }}
            placeholder="Weight (lbs)"
            aria-label="Weight"
            name="weight-value"
            step="0.1"
            className="w-36 bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none placeholder:text-text-secondary/50"
          />
          <input
            type="date"
            value={weightForm.date}
            onChange={(e) => setWeightForm(f => ({ ...f, date: e.target.value }))}
            aria-label="Date"
            name="weight-date"
            className="bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none"
          />
          <input
            type="text"
            value={weightForm.notes}
            onChange={(e) => setWeightForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Notes (optional)"
            aria-label="Notes"
            name="weight-notes"
            autoComplete="off"
            className="flex-1 min-w-[140px] bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none placeholder:text-text-secondary/50"
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

        {weightReadings.length > 0 && (
          <div className="mt-6 mb-6" aria-label="Weight trend chart">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={weightChartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={TOKEN_CHART_GRID} />
                <XAxis
                  dataKey="recorded_at"
                  tickFormatter={formatCentralShort}
                  tick={{ fill: TOKEN_TEXT_SECONDARY, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
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

      {/* ── Circumference subsection ── */}
      <div>
        <h3 className="text-sm font-bold uppercase tracking-widest text-text-secondary mb-3">Circumference Log</h3>

        <form onSubmit={handleCircumferenceSubmit} className="flex flex-wrap gap-2 mb-2" aria-label="Log circumference">
          <input
            type="number"
            value={circumferenceForm.abdomen}
            onChange={(e) => { setCircumferenceForm(f => ({ ...f, abdomen: e.target.value })); if (e.target.value) setCircumferenceFormError(''); }}
            placeholder="Abdomen (cm)"
            aria-label="Abdomen"
            name="circ-abdomen"
            step="0.1"
            className="w-32 bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none placeholder:text-text-secondary/50"
          />
          <input
            type="number"
            value={circumferenceForm.biceps}
            onChange={(e) => { setCircumferenceForm(f => ({ ...f, biceps: e.target.value })); if (e.target.value) setCircumferenceFormError(''); }}
            placeholder="Biceps (cm)"
            aria-label="Biceps"
            name="circ-biceps"
            step="0.1"
            className="w-28 bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none placeholder:text-text-secondary/50"
          />
          <input
            type="number"
            value={circumferenceForm.quads}
            onChange={(e) => { setCircumferenceForm(f => ({ ...f, quads: e.target.value })); if (e.target.value) setCircumferenceFormError(''); }}
            placeholder="Quads (cm)"
            aria-label="Quads"
            name="circ-quads"
            step="0.1"
            className="w-28 bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none placeholder:text-text-secondary/50"
          />
          <input
            type="date"
            value={circumferenceForm.date}
            onChange={(e) => setCircumferenceForm(f => ({ ...f, date: e.target.value }))}
            aria-label="Date"
            name="circ-date"
            className="bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none"
          />
          <input
            type="text"
            value={circumferenceForm.notes}
            onChange={(e) => setCircumferenceForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Notes (optional)"
            aria-label="Notes"
            name="circ-notes"
            autoComplete="off"
            className="flex-1 min-w-[140px] bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none placeholder:text-text-secondary/50"
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

        {circumferenceReadings.length > 0 && (
          <div className="mt-6 mb-6" aria-label="Circumference trend chart">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={circumferenceChartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={TOKEN_CHART_GRID} />
                <XAxis
                  dataKey="recorded_at"
                  tickFormatter={formatCentralShort}
                  tick={{ fill: TOKEN_TEXT_SECONDARY, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: TOKEN_TEXT_SECONDARY, fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CircumferenceTooltip />} />
                <Line
                  type="monotone"
                  dataKey="abdomen"
                  stroke={ABDOMEN_COLOR}
                  strokeWidth={2}
                  dot={{ fill: ABDOMEN_COLOR, r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="biceps"
                  stroke={BICEPS_COLOR}
                  strokeWidth={2}
                  dot={{ fill: BICEPS_COLOR, r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="quads"
                  stroke={QUADS_COLOR}
                  strokeWidth={2}
                  dot={{ fill: QUADS_COLOR, r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
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
                    <span className="text-sm font-bold font-mono shrink-0">
                      <span style={{ color: ABDOMEN_COLOR }}>{r.abdomen}</span>
                      <span className="text-text-secondary mx-1">/</span>
                      <span style={{ color: BICEPS_COLOR }}>{r.biceps}</span>
                      <span className="text-text-secondary mx-1">/</span>
                      <span style={{ color: QUADS_COLOR }}>{r.quads}</span>
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
