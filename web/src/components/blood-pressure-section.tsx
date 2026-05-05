import { useState } from 'react';
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

export interface BloodPressureReading {
  id: string;
  systolic: number;
  diastolic: number;
  notes: string;
  recorded_at: string;
}

interface BloodPressureSectionProps {
  readings: BloodPressureReading[];
  onAdd: (systolic: number, diastolic: number, notes: string) => Promise<void>;
  onDelete: (id: string) => void;
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

interface BPTooltipPayload {
  systolic: number;
  diastolic: number;
  notes: string;
  recorded_at: string;
}

function BPTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload as BPTooltipPayload;
  return (
    <div className="bg-surface border border-white/10 p-3 rounded-sm text-xs font-mono">
      <p className="text-text-secondary mb-1">{formatCentral(data.recorded_at)}</p>
      <p className="text-accent-4">Systolic: <span className="font-bold">{data.systolic}</span></p>
      <p className="text-accent-3">Diastolic: <span className="font-bold">{data.diastolic}</span></p>
      {data.notes && <p className="text-text-secondary mt-1 max-w-[160px] whitespace-normal">{data.notes}</p>}
    </div>
  );
}

export function BloodPressureSection({ readings, onAdd, onDelete }: BloodPressureSectionProps) {
  const [systolic, setSystolic] = useState<number | ''>('');
  const [diastolic, setDiastolic] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!systolic || !diastolic || Number(systolic) <= 0 || Number(diastolic) <= 0) {
      setFormError('Systolic and diastolic must be greater than 0');
      return;
    }
    setFormError('');
    setSubmitting(true);
    try {
      await onAdd(Number(systolic), Number(diastolic), notes);
      setSystolic('');
      setDiastolic('');
      setNotes('');
    } finally {
      setSubmitting(false);
    }
  };

  // Chart data is chronological (oldest first for left-to-right rendering)
  const chartData = [...readings].reverse();

  return (
    <section aria-label="Blood Pressure" className="w-full bg-surface p-6 rounded-sm border border-white/5">
      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-surface border border-white/10 p-8 rounded-sm shadow-2xl max-w-sm w-full">
            <h3 className="text-xl font-bold uppercase tracking-tight text-red-500 mb-2">Delete Reading</h3>
            <p className="text-text-secondary mb-6 text-sm">
              Are you sure you want to permanently delete this blood pressure reading?
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

      <h2 className="text-xl font-bold uppercase tracking-tight mb-4">Blood Pressure</h2>

      {/* Add form */}
      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 mb-2" aria-label="Log blood pressure reading">
        <input
          type="number"
          value={systolic}
          onChange={(e) => { setSystolic(e.target.value === '' ? '' : Number(e.target.value)); if (e.target.value) setFormError(''); }}
          placeholder="Systolic"
          aria-label="Systolic"
          name="bp-systolic"
          className="w-28 bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none placeholder:text-text-secondary/50"
        />
        <input
          type="number"
          value={diastolic}
          onChange={(e) => { setDiastolic(e.target.value === '' ? '' : Number(e.target.value)); if (e.target.value) setFormError(''); }}
          placeholder="Diastolic"
          aria-label="Diastolic"
          name="bp-diastolic"
          className="w-28 bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none placeholder:text-text-secondary/50"
        />
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          aria-label="Notes"
          name="bp-notes"
          autoComplete="off"
          className="flex-1 min-w-[140px] bg-background border-none text-text-primary px-3 py-2 rounded-sm text-sm focus-visible:ring-1 focus-visible:ring-accent-4 outline-none placeholder:text-text-secondary/50"
        />
        <button
          type="submit"
          disabled={submitting}
          className="bg-accent-4 cursor-pointer text-background px-5 py-2 rounded-sm font-bold uppercase tracking-wider text-xs hover:bg-white transition-colors disabled:opacity-50"
        >
          Log Reading
        </button>
      </form>
      {formError && (
        <p role="alert" className="text-red-400 text-xs font-mono mb-4 pl-1">{formError}</p>
      )}

      {/* Chart */}
      {readings.length > 0 && (
        <div className="mt-6 mb-6" aria-label="Blood pressure trend chart">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0d" />
              <XAxis
                dataKey="recorded_at"
                tickFormatter={formatCentralShort}
                tick={{ fill: '#7D8590', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fill: '#7D8590', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<BPTooltip />} />
              <Line
                type="monotone"
                dataKey="systolic"
                stroke="#39D353"
                strokeWidth={2}
                dot={{ fill: '#39D353', r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="diastolic"
                stroke="#26A641"
                strokeWidth={2}
                dot={{ fill: '#26A641', r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Readings log */}
      {readings.length === 0 ? (
        <p className="text-text-secondary text-xs uppercase tracking-widest py-4">No readings logged yet</p>
      ) : (
        <div className="overflow-y-auto max-h-[280px] flex flex-col gap-1 mt-2" role="list" aria-label="Blood pressure readings">
          {readings.map((r) => (
            <div
              key={r.id}
              role="listitem"
              className="flex items-center justify-between gap-4 px-3 py-2 rounded-sm bg-background hover:bg-white/5 transition-colors group"
            >
              <span className="text-text-secondary text-xs font-mono shrink-0">{formatCentral(r.recorded_at)}</span>
              <span className="text-accent-4 text-sm font-bold font-mono shrink-0">
                {r.systolic}/{r.diastolic}
              </span>
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
    </section>
  );
}
