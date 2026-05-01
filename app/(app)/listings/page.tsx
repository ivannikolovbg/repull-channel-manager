import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { listings } from '@/core/db/schema';
import { requireSessionWorkspace } from '@/core/lib/session';

export const dynamic = 'force-dynamic';

export default async function ListingsPage() {
  const ctx = await requireSessionWorkspace();
  const rows = await db
    .select()
    .from(listings)
    .where(eq(listings.workspaceId, ctx.workspace.id))
    .orderBy(desc(listings.syncedAt))
    .limit(200);

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold">Listings</h1>
        <p className="muted text-sm mt-1">
          {rows.length === 0
            ? 'Nothing yet — connect a channel and we&apos;ll pull listings here.'
            : `${rows.length} synced from your Repull workspace`}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="muted text-sm">
            Head to{' '}
            <Link href="/connections" className="underline decoration-dotted">
              Connections
            </Link>{' '}
            and link Airbnb to populate this page.
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((l) => {
            const photo = (l.photos as string[] | null)?.[0];
            return (
              <Link
                key={l.id}
                href={`/listings/${l.id}`}
                className="card overflow-hidden hover:border-white/[0.18] transition"
              >
                <div className="aspect-[16/10] bg-white/[0.04]">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt={l.name ?? ''} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-xs muted">
                      no photo
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="text-sm font-medium truncate">
                    {l.name ?? `Listing ${l.externalListingId}`}
                  </div>
                  <div className="text-xs muted mt-1 truncate">
                    {[l.city, l.country].filter(Boolean).join(', ') || l.address || '—'}
                  </div>
                  <div className="text-xs muted mt-2 font-mono">
                    {l.bedrooms ?? '?'} bd · {l.maxGuests ?? '?'} guests · ext {l.externalListingId}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
