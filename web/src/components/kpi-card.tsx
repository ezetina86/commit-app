interface Props {
  label: string;
  value: string | null;
  delta: string | null;
  deltaPositive: boolean | null;
  improvementDirection: 'up' | 'down';
}

export function KpiCard({ label, value, delta, deltaPositive, improvementDirection }: Props) {
  const deltaGreen =
    delta !== null &&
    deltaPositive !== null &&
    (improvementDirection === 'up' ? deltaPositive : !deltaPositive);

  return (
    <div className="bg-surface border border-white/5 rounded-sm p-4 flex flex-col gap-1 min-w-0">
      <span className="text-xs text-text-secondary uppercase tracking-widest font-mono truncate">{label}</span>
      <span className="text-2xl font-bold text-text-primary font-mono">{value ?? '—'}</span>
      {delta !== null && (
        <span
          data-testid="delta-badge"
          className={`text-xs font-mono font-bold ${deltaGreen ? 'text-accent-4' : 'text-red-400'}`}
        >
          {delta}
        </span>
      )}
    </div>
  );
}
