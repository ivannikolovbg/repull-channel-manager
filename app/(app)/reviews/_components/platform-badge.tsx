import { cn } from '@/core/lib/cn';

const STYLES: Record<string, { label: string; cls: string }> = {
  airbnb: {
    label: 'Airbnb',
    cls: 'text-rose-200 bg-rose-500/10 border-rose-500/20',
  },
  booking: {
    label: 'Booking.com',
    cls: 'text-blue-200 bg-blue-500/10 border-blue-500/20',
  },
  'booking.com': {
    label: 'Booking.com',
    cls: 'text-blue-200 bg-blue-500/10 border-blue-500/20',
  },
  vrbo: {
    label: 'VRBO',
    cls: 'text-sky-200 bg-sky-500/10 border-sky-500/20',
  },
  direct: {
    label: 'Direct',
    cls: 'text-emerald-200 bg-emerald-500/10 border-emerald-500/20',
  },
  website: {
    label: 'Website',
    cls: 'text-emerald-200 bg-emerald-500/10 border-emerald-500/20',
  },
};

export function PlatformBadge({
  platform,
  className,
}: {
  platform: string | null | undefined;
  className?: string;
}) {
  const key = (platform ?? 'other').toLowerCase();
  const style = STYLES[key] ?? {
    label: platform ?? 'Other',
    cls: 'text-white/70 bg-white/[0.04] border-white/[0.08]',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium uppercase tracking-wide',
        style.cls,
        className,
      )}
    >
      {style.label}
    </span>
  );
}
