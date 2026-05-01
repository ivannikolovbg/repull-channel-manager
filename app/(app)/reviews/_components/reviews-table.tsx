'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/core/lib/cn';
import type { Review } from '@/core/db/schema';
import { PlatformBadge } from './platform-badge';
import { RatingStars } from './rating-stars';
import { shouldSkipShortcut } from './should-skip-shortcut';

export interface ReviewsTableRow {
  review: Review;
  listingName: string | null;
  listingCity: string | null;
  hasDraft: boolean;
  responseSubmittedAt: Date | null;
}

export function ReviewsTable({ rows }: { rows: ReviewsTableRow[] }) {
  const router = useRouter();
  const [focused, setFocused] = useState<number>(rows.length > 0 ? 0 : -1);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  // Reset focus when row set shrinks
  useEffect(() => {
    if (focused >= rows.length) setFocused(rows.length - 1);
  }, [rows.length, focused]);

  // Keep a focused row scrolled into view
  useEffect(() => {
    if (focused < 0) return;
    const el = rowRefs.current[focused];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [focused]);

  const focusedId = focused >= 0 ? rows[focused]?.review.id : undefined;

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (shouldSkipShortcut(e)) return;
      if (e.key === 'j') {
        e.preventDefault();
        setFocused((i) => Math.min(rows.length - 1, i + 1));
      } else if (e.key === 'k') {
        e.preventDefault();
        setFocused((i) => Math.max(0, i - 1));
      } else if (e.key === 'r' && focusedId) {
        e.preventDefault();
        router.push(`/reviews/${focusedId}#respond`);
      } else if (e.key === '/') {
        e.preventDefault();
        const input = document.getElementById('reviews-search') as HTMLInputElement | null;
        input?.focus();
      } else if (e.key === 'Enter' && focusedId) {
        e.preventDefault();
        router.push(`/reviews/${focusedId}`);
      }
    },
    [rows, focusedId, router],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  if (rows.length === 0) {
    return (
      <div className="card overflow-hidden">
        <div className="p-10 text-center text-sm muted">
          No reviews match these filters.
        </div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="text-[10px] muted uppercase tracking-wide text-left bg-white/[0.02]">
          <tr>
            <th className="px-4 py-2 w-[110px]">Date</th>
            <th>Guest</th>
            <th className="hidden md:table-cell">Listing</th>
            <th className="w-[110px]">Platform</th>
            <th className="w-[120px]">Rating</th>
            <th className="hidden lg:table-cell">Preview</th>
            <th className="w-[140px]">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const r = row.review;
            const isFocused = i === focused;
            return (
              <tr
                key={r.id}
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                className={cn(
                  'border-t border-white/[0.04] transition-colors cursor-pointer',
                  isFocused
                    ? 'bg-white/[0.05] ring-1 ring-inset ring-repull/40'
                    : 'hover:bg-white/[0.03]',
                )}
                onMouseEnter={() => setFocused(i)}
              >
                <td className="px-4 py-3 align-top text-xs muted whitespace-nowrap">
                  {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : '—'}
                </td>
                <td className="align-top">
                  <Link
                    href={`/reviews/${r.id}`}
                    className="font-medium underline decoration-dotted decoration-white/30 underline-offset-4 hover:decoration-white"
                  >
                    {r.guestName ?? 'Anonymous'}
                  </Link>
                </td>
                <td className="align-top text-xs muted hidden md:table-cell max-w-[200px]">
                  <div className="truncate">{row.listingName ?? '—'}</div>
                  {row.listingCity ? (
                    <div className="truncate text-[10px]">{row.listingCity}</div>
                  ) : null}
                </td>
                <td className="align-top">
                  <PlatformBadge platform={r.platform} />
                </td>
                <td className="align-top">
                  <RatingStars rating={r.rating != null ? Number(r.rating) : null} />
                </td>
                <td className="align-top text-xs muted hidden lg:table-cell">
                  <div className="line-clamp-2 max-w-[420px]">
                    {r.publicReview ?? <span className="opacity-50">No public text</span>}
                  </div>
                </td>
                <td className="align-top">
                  <StatusPill row={row} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-4 py-2 border-t border-white/[0.04] text-[10px] muted flex items-center justify-between">
        <span>
          {rows.length} review{rows.length === 1 ? '' : 's'} · Use{' '}
          <kbd className="font-mono">j</kbd>/<kbd className="font-mono">k</kbd> to navigate ·{' '}
          <kbd className="font-mono">r</kbd> to respond · <kbd className="font-mono">/</kbd> to
          search
        </span>
        {focusedId ? (
          <Link
            href={`/reviews/${focusedId}`}
            className="underline decoration-dotted hover:text-white"
          >
            Open focused →
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function StatusPill({ row }: { row: ReviewsTableRow }) {
  const status = row.review.status;
  if (status === 'responded') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wide text-emerald-300 bg-emerald-500/10 border-emerald-500/20">
        Responded
      </span>
    );
  }
  if (status === 'flagged') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wide text-red-300 bg-red-500/10 border-red-500/20">
        Flagged
      </span>
    );
  }
  if (row.hasDraft || status === 'draft') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wide text-amber-300 bg-amber-500/10 border-amber-500/20">
        Draft saved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wide text-white/70 bg-white/[0.04] border-white/[0.1]">
      Needs response
    </span>
  );
}
