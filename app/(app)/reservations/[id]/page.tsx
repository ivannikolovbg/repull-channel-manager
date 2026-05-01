import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { listings, reservations } from '@/core/db/schema';
import { requireSessionWorkspace } from '@/core/lib/session';

export const dynamic = 'force-dynamic';

export default async function ReservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireSessionWorkspace();
  const { id } = await params;

  const rows = await db
    .select({ r: reservations, listing: listings })
    .from(reservations)
    .leftJoin(listings, eq(listings.id, reservations.listingId))
    .where(and(eq(reservations.workspaceId, ctx.workspace.id), eq(reservations.id, id)))
    .limit(1);
  const row = rows[0];
  if (!row) notFound();
  const r = row.r;
  const listing = row.listing;
  const guest = r.guestDetails as
    | { firstName?: string; lastName?: string; email?: string; phone?: string }
    | null;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="text-xs muted">
          <Link href="/reservations" className="underline decoration-dotted">
            Reservations
          </Link>{' '}
          / {r.confirmationCode ?? r.externalReservationId}
        </div>
        <h1 className="text-2xl font-semibold mt-1">
          {r.confirmationCode ?? r.externalReservationId}
        </h1>
        <div className="muted text-sm mt-1">
          {r.platform ?? 'unknown platform'} · {r.status ?? 'unknown status'}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <Stat label="Check-in" value={r.checkIn ?? '—'} />
        <Stat label="Check-out" value={r.checkOut ?? '—'} />
        <Stat label="Nights" value={r.nights ?? '—'} />
        <Stat label="Guests" value={r.guestCount ?? '—'} />
        <Stat
          label="Total"
          value={r.totalPrice ? `${r.currency ?? ''} ${Number(r.totalPrice).toLocaleString()}` : '—'}
        />
        <Stat label="Created" value={r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'} />
      </div>

      <section className="card p-5">
        <div className="text-sm font-medium">Guest</div>
        <div className="grid md:grid-cols-2 gap-3 mt-3 text-sm">
          <Field label="Name" value={[guest?.firstName, guest?.lastName].filter(Boolean).join(' ') || '—'} />
          <Field label="Email" value={guest?.email ?? '—'} />
          <Field label="Phone" value={guest?.phone ?? '—'} />
        </div>
      </section>

      <section className="card p-5">
        <div className="text-sm font-medium">Listing</div>
        {listing ? (
          <div className="mt-2 text-sm">
            <Link href={`/listings/${listing.id}`} className="underline decoration-dotted">
              {listing.name ?? `Listing ${listing.externalListingId}`}
            </Link>
            <div className="muted text-xs mt-1">
              {[listing.city, listing.country].filter(Boolean).join(', ') || '—'}
            </div>
          </div>
        ) : (
          <p className="muted text-sm mt-2">
            Listing isn&apos;t linked. Run a sync from the dashboard and we&apos;ll attach this
            reservation to its listing automatically.
          </p>
        )}
      </section>

      <section className="card p-5">
        <div className="text-sm font-medium">Raw payload</div>
        <pre className="mt-3 text-xs font-mono overflow-x-auto bg-black/40 p-3 rounded border border-white/[0.06]">
          {JSON.stringify(r.raw, null, 2)}
        </pre>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide muted">{label}</div>
      <div className="text-base font-medium mt-1">{value ?? '—'}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs muted">{label}</div>
      <div>{value}</div>
    </div>
  );
}
