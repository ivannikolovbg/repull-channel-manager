'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react';
import { cn } from '@/core/lib/cn';

interface DayRow {
  date: string;
  available: boolean;
  dailyPrice: string | null;
  minNights: number | null;
  source: string;
  blockedReason: string | null;
  repullSyncedAt: string | null;
  repullSyncError: string | null;
}

interface ResRow {
  id: string;
  checkIn: string | null;
  checkOut: string | null;
  guestFirstName: string | null;
  confirmationCode: string | null;
}

export interface PricingRecommendationLite {
  date: string;
  currentPrice: number | null;
  recommendedPrice: number;
  currency: string | null;
  confidence: number;
  factors: Record<string, unknown> | null;
  status: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarGrid(props: {
  listingId: string;
  listingName: string;
  currency: string | null;
  monthIso: string;
  monthStart: string;
  monthEnd: string;
  days: DayRow[];
  reservations: ResRow[];
  autoPushCalendar: boolean;
  atlasRecommendationsEnabled: boolean;
  recommendations: PricingRecommendationLite[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<DayRow | null>(null);
  const [recommendationsOn, setRecommendationsOn] = useState(props.atlasRecommendationsEnabled);
  const [openRecDate, setOpenRecDate] = useState<string | null>(null);
  const [recBusyDate, setRecBusyDate] = useState<string | null>(null);
  // Local hide-set for recs the user has just applied/declined — keeps the
  // badge from re-appearing on optimistic updates while we wait for refresh.
  const [hiddenRecDates, setHiddenRecDates] = useState<Set<string>>(() => new Set());

  const dayMap = useMemo(() => {
    const m = new Map<string, DayRow>();
    for (const d of props.days) m.set(d.date, d);
    return m;
  }, [props.days]);

  const recMap = useMemo(() => {
    const m = new Map<string, PricingRecommendationLite>();
    for (const r of props.recommendations) m.set(r.date, r);
    return m;
  }, [props.recommendations]);

  const resMap = useMemo(() => {
    // Map check-in date → reservation row, plus a Set of every occupied day.
    const checkin = new Map<string, ResRow>();
    const occupied = new Set<string>();
    for (const r of props.reservations) {
      if (r.checkIn) checkin.set(r.checkIn, r);
      if (r.checkIn && r.checkOut) {
        const start = new Date(r.checkIn);
        const end = new Date(r.checkOut);
        const cur = new Date(start);
        while (cur < end) {
          occupied.add(cur.toISOString().slice(0, 10));
          cur.setUTCDate(cur.getUTCDate() + 1);
        }
      }
    }
    return { checkin, occupied };
  }, [props.reservations]);

  // Build the calendar grid (with leading empty cells from prev month).
  const cells = useMemo(() => {
    const [yyyy, mm] = props.monthIso.split('-').map(Number);
    const first = new Date(Date.UTC(yyyy, mm - 1, 1));
    const lead = first.getUTCDay();
    const lastDay = new Date(Date.UTC(yyyy, mm, 0)).getUTCDate();
    const out: Array<{ date: string | null }> = [];
    for (let i = 0; i < lead; i++) out.push({ date: null });
    for (let d = 1; d <= lastDay; d++) {
      const iso = `${yyyy}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      out.push({ date: iso });
    }
    return out;
  }, [props.monthIso]);

  function navigate(deltaMonths: number) {
    const [yyyy, mm] = props.monthIso.split('-').map(Number);
    const next = new Date(Date.UTC(yyyy, mm - 1 + deltaMonths, 1));
    const target = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
    const sp = new URLSearchParams(searchParams.toString());
    sp.set('month', target);
    router.push(`?${sp.toString()}`);
  }

  async function syncNow() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ listingId: props.listingId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `${res.status}`);
      startTransition(() => router.refresh());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecommendations(next: boolean) {
    // Optimistic flip + persist. We re-fetch the page on success so the
    // server-rendered `recommendations` prop reflects the new state.
    const prev = recommendationsOn;
    setRecommendationsOn(next);
    setError(null);
    try {
      const res = await fetch('/api/settings/atlas-recommendations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `${res.status}`);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setRecommendationsOn(prev);
      setError((err as Error).message);
    }
  }

  async function actionRecommendation(date: string, action: 'apply' | 'decline') {
    setRecBusyDate(date);
    setError(null);
    try {
      const res = await fetch(`/api/listings/${props.listingId}/pricing`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dates: [date], action }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? `${res.status}`);
      // Optimistic UI: hide the badge immediately.
      setHiddenRecDates((s) => {
        const next = new Set(s);
        next.add(date);
        return next;
      });
      setOpenRecDate(null);
      startTransition(() => router.refresh());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRecBusyDate(null);
    }
  }

  async function applyOverride(payload: {
    listingId: string;
    date: string;
    available: boolean;
    blockedReason?: string | null;
    dailyPrice?: number | null;
    push?: boolean;
  }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        repullSynced?: boolean;
        repullSyncedAt?: string | null;
        error?: string | null;
        pushed?: boolean;
      };
      if (!res.ok) throw new Error(j.error ?? `${res.status}`);
      startTransition(() => router.refresh());
      // If we attempted a push and it failed, surface the error inline but keep the panel open
      // so the host can hit retry without reopening.
      if (j.pushed && !j.repullSynced && j.error) {
        setError(`Saved locally but Repull push failed: ${j.error}`);
      } else {
        setSelected(null);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs muted">
            <Link href={`/listings/${props.listingId}`} className="underline decoration-dotted">
              {props.listingName}
            </Link>{' '}
            / calendar
          </div>
          <h1 className="text-2xl font-semibold mt-1">{prettyMonth(props.monthIso)}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggleRecommendations(!recommendationsOn)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition',
              recommendationsOn
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15'
                : 'border-white/[0.08] bg-white/[0.02] text-white/60 hover:bg-white/[0.06]',
            )}
            title="Toggle Atlas pricing recommendations on the calendar"
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                recommendationsOn ? 'bg-emerald-400' : 'bg-white/30',
              )}
            />
            Recommendations: {recommendationsOn ? 'ON' : 'OFF'}
          </button>
          <button className="btn btn-ghost" onClick={() => navigate(-1)}>
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>
          <button className="btn btn-ghost" onClick={() => navigate(1)}>
            Next <ChevronRight className="w-4 h-4" />
          </button>
          <button className="btn btn-primary" onClick={syncNow} disabled={busy || pending}>
            <RefreshCw className={cn('w-4 h-4', busy ? 'animate-spin' : '')} />
            {busy ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="card p-3 text-sm text-red-300 bg-red-500/[0.06] border-red-500/20 font-mono whitespace-pre-wrap">
          {error}
        </div>
      ) : null}

      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-white/[0.06] bg-white/[0.02]">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-3 py-2 text-xs uppercase tracking-wide muted">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell, i) => {
            if (!cell.date) {
              return <div key={i} className="aspect-[7/6] border-r border-b border-white/[0.04] bg-white/[0.01]" />;
            }
            const day = dayMap.get(cell.date);
            const occupied = resMap.occupied.has(cell.date);
            const checkin = resMap.checkin.get(cell.date);
            const blocked = day && !day.available;
            const rec =
              recommendationsOn && !hiddenRecDates.has(cell.date)
                ? recMap.get(cell.date)
                : undefined;
            const baseline = rec
              ? rec.currentPrice ?? (day?.dailyPrice ? Number(day.dailyPrice) : null)
              : null;
            const recDeltaPct =
              rec && baseline != null && baseline > 0
                ? Math.round(((rec.recommendedPrice - baseline) / baseline) * 100)
                : null;
            const recIsUp = recDeltaPct != null && recDeltaPct > 0;
            const recIsFlat = recDeltaPct === 0;
            return (
              <div
                key={cell.date}
                className={cn(
                  'aspect-[7/6] border-r border-b border-white/[0.04] relative',
                  occupied || blocked ? 'bg-white/[0.03]' : '',
                )}
              >
                <button
                  type="button"
                  className="block text-left w-full h-full p-2 hover:bg-white/[0.04]"
                  onClick={() => {
                    const cellDate = cell.date as string;
                    setSelected(
                      day ?? {
                        date: cellDate,
                        available: true,
                        dailyPrice: null,
                        minNights: null,
                        source: 'sync',
                        blockedReason: null,
                        repullSyncedAt: null,
                        repullSyncError: null,
                      },
                    );
                  }}
                >
                  <div className="flex items-start justify-between text-xs">
                    <span className="font-medium">{cell.date.slice(-2)}</span>
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full mt-1',
                        blocked ? 'bg-red-400' : occupied ? 'bg-amber-400' : 'bg-emerald-400',
                      )}
                    />
                  </div>
                  {rec ? (
                    <div
                      className={cn(
                        'mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium border cursor-pointer',
                        recIsUp
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                          : recIsFlat
                            ? 'bg-white/[0.04] text-white/70 border-white/[0.1] hover:bg-white/[0.08]'
                            : 'bg-red-500/10 text-red-300 border-red-500/30 hover:bg-red-500/20',
                      )}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenRecDate(cell.date);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          e.preventDefault();
                          setOpenRecDate(cell.date);
                        }
                      }}
                      title={`Atlas recommends ${rec.currency ?? props.currency ?? ''} ${Math.round(rec.recommendedPrice).toLocaleString()}${recDeltaPct != null ? ` (${recDeltaPct >= 0 ? '+' : ''}${recDeltaPct}%)` : ''}`}
                    >
                      <span aria-hidden="true">{recIsUp ? '↑' : recIsFlat ? '·' : '↓'}</span>
                      <span>
                        {rec.currency ?? props.currency ?? ''}{' '}
                        {Math.round(rec.recommendedPrice).toLocaleString()}
                      </span>
                      {recDeltaPct != null && !recIsFlat ? (
                        <span className="opacity-80">
                          {recDeltaPct >= 0 ? '+' : ''}
                          {recDeltaPct}%
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {day?.dailyPrice ? (
                    <div className="text-xs muted mt-1">
                      {props.currency ?? ''} {Number(day.dailyPrice).toLocaleString()}
                    </div>
                  ) : null}
                  {day?.source === 'manual' ? (
                    <div
                      className={cn(
                        'mt-1 text-[9px] uppercase tracking-wide font-medium',
                        day.repullSyncedAt
                          ? 'text-emerald-300'
                          : day.repullSyncError
                            ? 'text-red-300'
                            : 'text-amber-300',
                      )}
                    >
                      {day.repullSyncedAt ? 'synced' : day.repullSyncError ? 'push failed' : 'manual'}
                    </div>
                  ) : null}
                  {checkin ? (
                    <div className="absolute bottom-1 left-2 right-2 truncate text-[10px] uppercase tracking-wide bg-amber-400/20 text-amber-200 px-1 py-0.5 rounded">
                      {checkin.guestFirstName ?? checkin.confirmationCode ?? 'res'}
                    </div>
                  ) : null}
                </button>
                {rec && openRecDate === cell.date ? (
                  <RecPopover
                    rec={rec}
                    baseline={baseline}
                    deltaPct={recDeltaPct}
                    fallbackCurrency={props.currency}
                    busy={recBusyDate === cell.date}
                    onClose={() => setOpenRecDate(null)}
                    onApply={() => actionRecommendation(cell.date as string, 'apply')}
                    onDecline={() => actionRecommendation(cell.date as string, 'decline')}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs muted">
        <span>
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 mr-1.5" /> available
        </span>
        <span>
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400 mr-1.5" /> reserved
        </span>
        <span>
          <span className="inline-block h-2 w-2 rounded-full bg-red-400 mr-1.5" /> blocked
        </span>
        {recommendationsOn ? (
          <span>
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-300/80 mr-1.5" /> rec uplift
            <span className="inline-block h-2 w-2 rounded-full bg-red-300/80 ml-3 mr-1.5" /> rec drop
          </span>
        ) : null}
        <span className="ml-auto">
          Auto-push to Repull:{' '}
          <span className={props.autoPushCalendar ? 'text-emerald-300' : 'text-amber-300'}>
            {props.autoPushCalendar ? 'on' : 'off'}
          </span>{' '}
          (
          <Link href="/settings" className="underline decoration-dotted">
            change
          </Link>
          )
        </span>
      </div>

      <div className="text-[11px] muted text-center pt-2 border-t border-white/[0.04]">
        Powered by{' '}
        <a
          href="https://repull.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted hover:text-white/80"
        >
          Repull pricing intelligence
        </a>
      </div>

      {selected ? (
        <SidePanel
          day={selected}
          listingId={props.listingId}
          currency={props.currency}
          autoPushCalendar={props.autoPushCalendar}
          onClose={() => setSelected(null)}
          onSubmit={applyOverride}
          busy={busy}
        />
      ) : null}
    </div>
  );
}

function SidePanel(props: {
  day: DayRow;
  listingId: string;
  currency: string | null;
  autoPushCalendar: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    listingId: string;
    date: string;
    available: boolean;
    blockedReason?: string | null;
    dailyPrice?: number | null;
    push?: boolean;
  }) => void;
  busy: boolean;
}) {
  const { day } = props;
  const [available, setAvailable] = useState(day.available);
  const [blockedReason, setBlockedReason] = useState(day.blockedReason ?? '');
  const [price, setPrice] = useState(day.dailyPrice ?? '');

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60"
      onClick={props.onClose}
    >
      <div className="card p-5 max-w-sm w-full m-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-xs muted uppercase tracking-wide">Day</div>
        <div className="text-lg font-semibold mt-1">{day.date}</div>

        {day.source === 'manual' && day.repullSyncedAt ? (
          <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Synced to Repull · {new Date(day.repullSyncedAt).toLocaleString()}
          </div>
        ) : day.source === 'manual' && day.repullSyncError ? (
          <div className="mt-2 text-[11px] text-red-300 bg-red-500/10 border border-red-500/20 rounded p-2 font-mono whitespace-pre-wrap">
            Push failed: {day.repullSyncError}
            <div className="mt-2">
              <button
                className="btn btn-ghost text-xs"
                disabled={props.busy}
                onClick={() =>
                  props.onSubmit({
                    listingId: props.listingId,
                    date: day.date,
                    available: day.available,
                    blockedReason: day.blockedReason ?? undefined,
                    dailyPrice:
                      day.dailyPrice != null && day.dailyPrice !== '' ? Number(day.dailyPrice) : null,
                    push: true,
                  })
                }
              >
                Retry push
              </button>
            </div>
          </div>
        ) : day.source === 'manual' ? (
          <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Manual override &middot; pending push
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={available}
              onChange={(e) => setAvailable(e.target.checked)}
            />
            Available
          </label>

          {!available ? (
            <input
              className="input"
              placeholder="Reason (optional)"
              value={blockedReason}
              onChange={(e) => setBlockedReason(e.target.value)}
            />
          ) : null}

          <div>
            <label className="text-xs muted">Daily price ({props.currency ?? 'currency'})</label>
            <input
              className="input mt-1"
              type="number"
              step="1"
              value={price ?? ''}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>

          <p className="text-[11px] muted">
            {props.autoPushCalendar
              ? 'Saving will push this change back to Repull immediately.'
              : 'Auto-push is off — change will be saved locally only. Toggle in Settings to push back automatically.'}
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={props.onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={props.busy}
            onClick={() =>
              props.onSubmit({
                listingId: props.listingId,
                date: day.date,
                available,
                blockedReason: !available && blockedReason ? blockedReason : null,
                dailyPrice: price === '' ? null : Number(price),
              })
            }
          >
            {props.busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function prettyMonth(iso: string) {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Inline popover anchored under the recommendation badge inside a calendar
 * cell. Renders the rec details, factor chips, and apply/decline actions.
 *
 * Positioned absolutely so it doesn't push the grid layout. Click-outside
 * closes via a transparent backdrop. The cell uses `position: relative` so
 * the absolute placement of the popover stays inside the cell column.
 */
function RecPopover(props: {
  rec: PricingRecommendationLite;
  baseline: number | null;
  deltaPct: number | null;
  fallbackCurrency: string | null;
  busy: boolean;
  onClose: () => void;
  onApply: () => void;
  onDecline: () => void;
}) {
  const { rec } = props;
  const currency = rec.currency ?? props.fallbackCurrency ?? '';
  const factorEntries = Object.entries(rec.factors ?? {}).filter(
    ([, v]) => v != null && v !== false,
  );
  return (
    <>
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 z-40 cursor-default"
        onClick={(e) => {
          e.stopPropagation();
          props.onClose();
        }}
      />
      <div
        className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-1 w-64 card p-3 text-xs space-y-2 shadow-xl"
        style={{ background: '#0d0d0d' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide muted">Atlas recommendation</div>
            <div className="text-sm font-semibold mt-0.5">{rec.date}</div>
          </div>
          <button
            type="button"
            className="text-white/40 hover:text-white"
            onClick={props.onClose}
            aria-label="Close popover"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div>
            <div className="text-[10px] muted uppercase tracking-wide">Current</div>
            <div className="font-mono text-sm">
              {props.baseline != null
                ? `${currency} ${Math.round(props.baseline).toLocaleString()}`
                : '—'}
            </div>
          </div>
          <div>
            <div className="text-[10px] muted uppercase tracking-wide">Recommended</div>
            <div className="font-mono text-sm">
              {currency} {Math.round(rec.recommendedPrice).toLocaleString()}
              {props.deltaPct != null && props.deltaPct !== 0 ? (
                <span
                  className={cn(
                    'ml-1.5 text-[10px]',
                    props.deltaPct > 0 ? 'text-emerald-300' : 'text-red-300',
                  )}
                >
                  {props.deltaPct > 0 ? '+' : ''}
                  {props.deltaPct}%
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {Number.isFinite(rec.confidence) ? (
          <div className="text-[10px] muted">
            Confidence {Math.round(rec.confidence * 100)}%
          </div>
        ) : null}
        {factorEntries.length > 0 ? (
          <div>
            <div className="text-[10px] muted uppercase tracking-wide mb-1">Factors</div>
            <ul className="flex flex-wrap gap-1">
              {factorEntries.slice(0, 6).map(([k, v]) => (
                <li
                  key={k}
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08]"
                  title={`${k}: ${formatFactorValue(v)}`}
                >
                  {humaniseFactor(k, v)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            className="btn btn-ghost text-xs"
            disabled={props.busy}
            onClick={props.onDecline}
          >
            {props.busy ? '…' : 'Decline'}
          </button>
          <button
            type="button"
            className="btn btn-primary text-xs"
            disabled={props.busy}
            onClick={props.onApply}
          >
            {props.busy ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </div>
    </>
  );
}

function humaniseFactor(key: string, value: unknown): string {
  if (key === 'event' && typeof value === 'string') return value;
  if (key === 'demand' && typeof value === 'string') return `${capitaliseFirst(value)} demand`;
  if (key === 'season' && typeof value === 'string') return capitaliseFirst(value);
  if (key === 'weekend' && value === true) return 'Weekend';
  if (key === 'holiday' && (typeof value === 'string' || value === true)) {
    return typeof value === 'string' ? value : 'Holiday';
  }
  if (key === 'compShift' && typeof value === 'number') {
    return `Comp shift ${value > 0 ? '+' : ''}${value}%`;
  }
  if (typeof value === 'string') return capitaliseFirst(value);
  if (typeof value === 'number') return `${capitaliseFirst(key)} ${value}`;
  return capitaliseFirst(key);
}

function formatFactorValue(v: unknown): string {
  if (typeof v === 'object' && v != null) {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function capitaliseFirst(s: string): string {
  if (!s) return s;
  return s[0]!.toUpperCase() + s.slice(1).replace(/_/g, ' ');
}
