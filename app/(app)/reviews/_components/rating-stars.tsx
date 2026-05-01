import { Star } from 'lucide-react';
import { cn } from '@/core/lib/cn';

/**
 * Inline 1–5 star rating using lucide `Star`. We never render emoji stars
 * (per the polish bar). Half-stars are approximated by clipping the fill;
 * for the MVP we round to nearest whole star.
 */
export function RatingStars({
  rating,
  size = 14,
  className,
}: {
  rating: number | null | undefined;
  size?: number;
  className?: string;
}) {
  if (rating == null || Number.isNaN(rating)) {
    return <span className={cn('muted text-xs', className)}>no rating</span>;
  }
  const rounded = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={`${rating.toFixed(1)} out of 5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star
          key={i}
          width={size}
          height={size}
          className={cn(
            'shrink-0',
            i < rounded ? 'text-amber-400 fill-amber-400' : 'text-white/15 fill-transparent',
          )}
        />
      ))}
    </span>
  );
}
