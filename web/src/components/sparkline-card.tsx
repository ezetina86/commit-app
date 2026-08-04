import { LineChart, Line, Tooltip, ResponsiveContainer } from 'recharts';

interface DataPoint {
  date: string;
  value: number;
}

interface Props {
  label: string;
  unit: string;
  data: DataPoint[];
  color: string;
  improvementDirection: 'up' | 'down';
}

const fmt = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' }).format(new Date(iso));

export function SparklineCard({ label, unit, data, color, improvementDirection }: Props) {
  const sorted = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const latest = sorted.at(-1);
  const prev = sorted.at(-2);
  const delta = latest && prev ? latest.value - prev.value : null;

  // ponytail: delta color flips based on improvementDirection
  const deltaGood = delta !== null && (improvementDirection === 'down' ? delta <= 0 : delta >= 0);

  return (
    <div className="bg-surface border border-white/5 rounded-sm p-3 flex flex-col gap-1 min-w-0">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-text-secondary uppercase tracking-widest font-mono truncate">{label}</span>
        <span className="text-xs text-text-secondary font-mono">{unit}</span>
      </div>
      <div className="flex items-baseline gap-2">
        {latest && (
          <span className="text-xl font-bold font-mono" style={{ color }}>
            {latest.value}
          </span>
        )}
        {delta !== null && (
          <span className={`text-xs font-mono ${deltaGood ? 'text-accent-4' : 'text-red-400'}`}>
            {delta > 0 ? '+' : ''}{Math.round(delta * 10) / 10}
          </span>
        )}
      </div>
      {sorted.length > 0 ? (
        <div style={{ height: 48 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sorted} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
              <Tooltip
                contentStyle={{ background: '#161B22', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2, fontSize: 11, fontFamily: 'inherit' }}
                labelFormatter={(_, p) => p[0] ? fmt((p[0].payload as DataPoint).date) : ''}
                formatter={(v: number) => [v, unit]}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-12 flex items-center justify-center text-text-secondary text-xs font-mono">—</div>
      )}
    </div>
  );
}
