'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
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
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<DayRow | null>(null);

  const dayMap = useMemo(() => {
    const m = new Map<string, DayRow>();
    for (const d of props.days) m.set(d.date, d);
    return m;
  }, [props.days]);

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
            return (
              <button
                key={cell.date}
                className={cn(
                  'text-left aspect-[7/6] border-r border-b border-white/[0.04] p-2 hover:bg-white/[0.04] relative',
                  occupied || blocked ? 'bg-white/[0.03]' : '',
                )}
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
