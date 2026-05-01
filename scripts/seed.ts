/**
 * Local-dev seeder. Inserts a fake workspace + a couple of mock listings/
 * reservations so the UI renders without requiring a real Repull API key.
 *
 * Run: pnpm seed
 */

import { eq } from 'drizzle-orm';
import { db } from '../core/db';
import {
  calendarDays,
  guests,
  listings,
  reservations,
  users,
  workspaceMembers,
  workspaces,
} from '../core/db/schema';

async function main() {
  const email = 'demo@repull.local';
  let user = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (!user) {
    user = (await db.insert(users).values({ email, name: 'Demo User' }).returning())[0];
  }

  let ws = (await db.select().from(workspaces).where(eq(workspaces.ownerUserId, user.id)).limit(1))[0];
  if (!ws) {
    ws = (
      await db
        .insert(workspaces)
        .values({ name: 'Demo Workspace', slug: `demo-${Date.now()}`, ownerUserId: user.id })
        .returning()
    )[0];
    await db
      .insert(workspaceMembers)
      .values({ workspaceId: ws.id, userId: user.id, role: 'owner' })
      .onConflictDoNothing();
  }

  const listing = (
    await db
      .insert(listings)
      .values({
        workspaceId: ws.id,
        externalListingId: 'demo-listing-1',
        name: 'Oceanfront Loft (demo)',
        city: 'Miami Beach',
        country: 'US',
        bedrooms: 2,
        bathrooms: '1.5',
        maxGuests: 4,
        currency: 'USD',
        photos: ['https://images.unsplash.com/photo-1505691938895-1758d7feb511'],
      })
      .onConflictDoNothing()
      .returning()
  )[0];

  if (listing) {
    const guest = (
      await db
        .insert(guests)
        .values({ workspaceId: ws.id, name: 'Jane Demo', email: 'jane@example.com' })
        .returning()
    )[0];

    await db
      .insert(reservations)
      .values({
        workspaceId: ws.id,
        listingId: listing.id,
        guestId: guest.id,
        externalReservationId: 'demo-res-1',
        confirmationCode: 'DEMO-12345',
        platform: 'airbnb',
        status: 'confirmed',
        checkIn: '2026-05-15',
        checkOut: '2026-05-19',
        nights: 4,
        guestCount: 2,
        totalPrice: '950.00',
        currency: 'USD',
        guestDetails: { firstName: 'Jane', lastName: 'Demo', email: 'jane@example.com' },
      })
      .onConflictDoNothing();

    // 30 days of calendar
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      await db
        .insert(calendarDays)
        .values({
          workspaceId: ws.id,
          listingId: listing.id,
          date: iso,
          available: i !== 5 && i !== 6,
          dailyPrice: String(180 + (i % 7) * 12),
          minNights: 2,
          source: 'sync',
        })
        .onConflictDoNothing();
    }
  }

  console.log(`✓ Seeded workspace ${ws.id} (slug: ${ws.slug}) for ${email}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
