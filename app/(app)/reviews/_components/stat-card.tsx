import { cn } from '@/core/lib/cn';

export function StatCard({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'positive' | 'warning' | 'danger';
  className?: string;
}) {
  const valueCls =
    tone === 'positive'
      ? 'text-emerald-300'
      : tone === 'warning'
        ? 'text-amber-300'
        : tone === 'danger'
          ? 'text-red-300'
          : 'text-white';
  return (
    <div className={cn('card p-4', className)}>
      <div className="text-xs uppercase tracking-wide muted">{label}</div>
      <div className={cn('text-2xl font-semibold mt-1 tabular-nums', valueCls)}>{String(value)}</div>
      {hint ? <div className="text-xs muted mt-1">{hint}</div> : null}
    </div>
  );
}
