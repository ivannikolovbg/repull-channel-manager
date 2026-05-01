import Link from 'next/link';
import { and, desc, eq, SQL } from 'drizzle-orm';
import { db } from '@/core/db';
import { listings, reservations } from '@/core/db/schema';
import { requireSessionWorkspace } from '@/core/lib/session';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; platform?: string; listingId?: string; offset?: string }>;
}) {
  const ctx = await requireSessionWorkspace();
  const sp = await searchParams;
  const offset = Math.max(Number(sp.offset ?? 0), 0);

  const filters: SQL[] = [eq(reservations.workspaceId, ctx.workspace.id)];
  if (sp.status) filters.push(eq(reservations.status, sp.status));
  if (sp.platform) filters.push(eq(reservations.platform, sp.platform));
  if (sp.listingId) filters.push(eq(reservations.listingId, sp.listingId));

  const rows = await db
    .select({
      r: reservations,
      listingName: listings.name,
    })
    .from(reservations)
    .leftJoin(listings, eq(listings.id, reservations.listingId))
    .where(and(...filters))
    .orderBy(desc(reservations.checkIn))
    .limit(PAGE_SIZE)
    .offset(offset);

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Reservations</h1>
          <p className="muted text-sm mt-1">
            {rows.length === 0 && offset === 0 ? 'No reservations yet.' : `Showing ${rows.length}`}
          </p>
        </div>
      </div>

      <Filters
        status={sp.status}
        platform={sp.platform}
      />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs muted uppercase tracking-wide text-left bg-white/[0.02]">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th>Listing</th>
              <th>Guest</th>
              <th>Check-in</th>
              <th>Check-out</th>
              <th>Status</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, listingName }) => {
              const guest = r.guestDetails as { firstName?: string; lastName?: string } | null;
              return (
                <tr key={r.id} className="border-t border-white/[0.04] hover:bg-white/[0.03]">
                  <td className="px-4 py-2">
                    <Link className="underline decoration-dotted" href={`/reservations/${r.id}`}>
                      {r.confirmationCode ?? r.externalReservationId}
                    </Link>
                  </td>
                  <td className="text-xs truncate max-w-[200px]">{listingName ?? '—'}</td>
                  <td>{[guest?.firstName, guest?.lastName].filter(Boolean).join(' ') || '—'}</td>
                  <td>{r.checkIn ?? '—'}</td>
                  <td>{r.checkOut ?? '—'}</td>
                  <td>
                    <Pill status={r.status} />
                  </td>
                  <td>
                    {r.totalPrice ? `${r.currency ?? ''} ${Number(r.totalPrice).toLocaleString()}` : '—'}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center muted text-sm">
                  No reservations match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2">
        {offset > 0 ? (
          <Link
            href={`/reservations?${new URLSearchParams({ ...stripUndef(sp), offset: String(Math.max(offset - PAGE_SIZE, 0)) }).toString()}`}
            className="btn btn-ghost text-xs"
          >
            ← Prev
          </Link>
        ) : null}
        {rows.length === PAGE_SIZE ? (
          <Link
            href={`/reservations?${new URLSearchParams({ ...stripUndef(sp), offset: String(offset + PAGE_SIZE) }).toString()}`}
            className="btn btn-ghost text-xs"
          >
            Next →
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function Filters({ status, platform }: { status?: string; platform?: string }) {
  return (
    <form className="card p-3 flex flex-wrap gap-2 items-end text-sm" action="/reservations">
      <Field label="Status">
        <select name="status" defaultValue={status ?? ''} className="input">
          <option value="">All</option>
          {['confirmed', 'pending', 'cancelled', 'completed'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Platform">
        <select name="platform" defaultValue={platform ?? ''} className="input">
          <option value="">All</option>
          {['airbnb', 'booking.com', 'vrbo', 'direct', 'website', 'owner', 'other'].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>
      <button type="submit" className="btn btn-ghost">
        Apply
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs muted uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

function Pill({ status }: { status: string | null }) {
  if (!status) return <span className="muted">—</span>;
  const cls =
    status === 'confirmed' || status === 'completed'
      ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
      : status === 'pending'
        ? 'text-amber-300 bg-amber-500/10 border-amber-500/20'
        : status === 'cancelled'
          ? 'text-red-300 bg-red-500/10 border-red-500/20'
          : 'text-white/70 bg-white/[0.04] border-white/[0.08]';
  return (
    <span className={`px-2 py-0.5 rounded-full border text-xs ${cls}`}>{status}</span>
  );
}

function stripUndef<T extends Record<string, string | undefined>>(o: T): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) if (typeof v === 'string' && v) out[k] = v;
  return out;
}
