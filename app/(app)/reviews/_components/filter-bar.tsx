'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const PLATFORMS = ['airbnb', 'booking', 'vrbo', 'direct', 'website'];
const RATING_BUCKETS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All ratings' },
  { value: 'low', label: '1–2' },
  { value: 'mid', label: '3' },
  { value: 'high', label: '4–5' },
];
const STATUSES: Array<{ value: string; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'needs_response', label: 'Needs response' },
  { value: 'draft', label: 'Draft saved' },
  { value: 'responded', label: 'Responded' },
  { value: 'flagged', label: 'Flagged' },
];
const SORTS: Array<{ value: string; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'rating-asc', label: 'Lowest rating' },
  { value: 'rating-desc', label: 'Highest rating' },
];

export function ReviewsFilterBar({
  listings,
}: {
  listings: Array<{ id: string; name: string | null }>;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const [search, setSearch] = useState(sp.get('search') ?? '');

  // Push search → URL after a debounce.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(sp.toString());
      if (search) next.set('search', search);
      else next.delete('search');
      next.delete('offset');
      router.replace(`/reviews?${next.toString()}`, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
    // We deliberately depend only on `search` — sp updates would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('offset');
    router.replace(`/reviews?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="card p-3 flex flex-wrap items-end gap-2">
      <Field label="Search">
        <input
          id="reviews-search"
          className="input min-w-[180px]"
          placeholder="Guest or text…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Field>
      <Field label="Platform">
        <select
          className="input"
          value={sp.get('platform') ?? ''}
          onChange={(e) => setParam('platform', e.target.value)}
        >
          <option value="">All</option>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Rating">
        <select
          className="input"
          value={sp.get('ratingBucket') ?? ''}
          onChange={(e) => setParam('ratingBucket', e.target.value)}
        >
          {RATING_BUCKETS.map((b) => (
            <option key={b.value || 'all'} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Status">
        <select
          className="input"
          value={sp.get('status') ?? ''}
          onChange={(e) => setParam('status', e.target.value)}
        >
          {STATUSES.map((s) => (
            <option key={s.value || 'all'} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Listing">
        <select
          className="input min-w-[180px]"
          value={sp.get('listingId') ?? ''}
          onChange={(e) => setParam('listingId', e.target.value)}
        >
          <option value="">All listings</option>
          {listings.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name ?? l.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Sort">
        <select
          className="input"
          value={sp.get('sort') ?? 'newest'}
          onChange={(e) => setParam('sort', e.target.value)}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] muted uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}
