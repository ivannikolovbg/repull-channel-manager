import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { listings, reservations } from '@/core/db/schema';
import { requireSessionWorkspace } from '@/core/lib/session';

export const dynamic = 'force-dynamic';

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireSessionWorkspace();
  const { id } = await params;

  const rows = await db
    .select()
    .from(listings)
    .where(and(eq(listings.workspaceId, ctx.workspace.id), eq(listings.id, id)))
    .limit(1);
  const listing = rows[0];
  if (!listing) notFound();

  const recentRes = await db
    .select()
    .from(reservations)
    .where(and(eq(reservations.workspaceId, ctx.workspace.id), eq(reservations.listingId, id)))
    .orderBy(desc(reservations.checkIn))
    .limit(10);

  const photos = (listing.photos as string[] | null) ?? [];

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs muted">
            <Link href="/listings" className="underline decoration-dotted">
              Listings
            </Link>{' '}
            / {listing.externalListingId}
          </div>
          <h1 className="text-2xl font-semibold mt-1">
            {listing.name ?? `Listing ${listing.externalListingId}`}
          </h1>
          <div className="text-sm muted mt-1">
            {[listing.address, listing.city, listing.country].filter(Boolean).join(', ') || '—'}
          </div>
        </div>
        <Link href={`/listings/${listing.id}/calendar`} className="btn btn-primary">
          Open calendar
        </Link>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <Stat label="Bedrooms" value={listing.bedrooms ?? '—'} />
        <Stat label="Bathrooms" value={listing.bathrooms ?? '—'} />
        <Stat label="Max guests" value={listing.maxGuests ?? '—'} />
      </div>

      {photos.length > 0 ? (
        <section>
          <div className="text-sm font-medium mb-3">Photos</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {photos.slice(0, 6).map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                src={src}
                alt=""
                className="aspect-[16/10] object-cover rounded-md border border-white/[0.06]"
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="card p-5">
        <div className="text-sm font-medium">Recent reservations</div>
        {recentRes.length === 0 ? (
          <p className="muted text-sm mt-3">None yet.</p>
        ) : (
          <table className="w-full text-sm mt-4">
            <thead className="text-xs muted uppercase tracking-wide text-left">
              <tr>
                <th className="py-2">Code</th>
                <th>Guest</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentRes.map((r) => {
                const guest = r.guestDetails as { firstName?: string; lastName?: string } | null;
                return (
                  <tr key={r.id} className="border-t border-white/[0.04]">
                    <td className="py-2">
                      <Link href={`/reservations/${r.id}`} className="underline decoration-dotted">
                        {r.confirmationCode ?? r.externalReservationId}
                      </Link>
                    </td>
                    <td>{[guest?.firstName, guest?.lastName].filter(Boolean).join(' ') || '—'}</td>
                    <td>{r.checkIn ?? '—'}</td>
                    <td>{r.checkOut ?? '—'}</td>
                    <td>{r.status ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide muted">{label}</div>
      <div className="text-xl font-semibold mt-1">{String(value)}</div>
    </div>
  );
}
