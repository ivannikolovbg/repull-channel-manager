/**
 * Demo seeder for the public hosted preview at
 * https://repull-channel-manager.vercel.app.
 *
 *   pnpm tsx scripts/seed-demo.ts
 *
 * Idempotent — safe to re-run. Wipes the demo workspace's listings /
 * reservations / calendar / sync_runs first so the demo always shows a
 * fresh, plausible snapshot.
 *
 * What gets seeded
 *   - Demo user            demo@repull.dev
 *   - Demo workspace       slug `demo`, with a fake Airbnb connection
 *   - 50 plausible vacation-rental listings (Fernie BC / Whistler / Banff)
 *   - 200 reservations across the past 60 / next 90 days
 *   - 60-day calendar grid per listing (with bookings + 5% manual blocks)
 *   - 5 sync runs (most recent: success, listings=50, reservations=200)
 */

import { eq } from 'drizzle-orm';
import { db } from '../core/db';
import {
  calendarDays,
  connections,
  guests,
  listings,
  reservations,
  syncRuns,
  users,
  workspaceMembers,
  workspaces,
} from '../core/db/schema';

const DEMO_EMAIL = 'demo@repull.dev';
const DEMO_NAME = 'Demo Host';
const DEMO_SLUG = 'demo';

// ---------- Catalogue of fixtures ----------

const CITIES: Array<{ city: string; country: string; state: string; tz: string }> = [
  { city: 'Fernie', country: 'CA', state: 'BC', tz: 'America/Edmonton' },
  { city: 'Whistler', country: 'CA', state: 'BC', tz: 'America/Vancouver' },
  { city: 'Banff', country: 'CA', state: 'AB', tz: 'America/Edmonton' },
  { city: 'Canmore', country: 'CA', state: 'AB', tz: 'America/Edmonton' },
  { city: 'Revelstoke', country: 'CA', state: 'BC', tz: 'America/Vancouver' },
  { city: 'Golden', country: 'CA', state: 'BC', tz: 'America/Edmonton' },
  { city: 'Radium Hot Springs', country: 'CA', state: 'BC', tz: 'America/Edmonton' },
];

const NAME_PREFIX = [
  'Slopeside',
  'Powder',
  'Cedar',
  'Alpine',
  'Glacier',
  'Mountain',
  'Lakeview',
  'Summit',
  'Ridge',
  'Aurora',
  'Sunrise',
  'Granite',
  'Pinecrest',
  'Riverbend',
  'Snowfall',
  'Spruce',
  'Twin Peaks',
  'Eagle',
];
const NAME_SUFFIX = [
  'Chalet',
  'Lodge',
  'Cabin',
  'Loft',
  'Retreat',
  'Suite',
  'House',
  'Hideaway',
  'Villa',
  'Studio',
  'Townhome',
  'Penthouse',
];

const STREETS = [
  'Powder Pass',
  'Glacier Way',
  'Ski Hill Rd',
  'Cornerstone Loop',
  'Fairway Dr',
  'Bear Ridge',
  'Snow Valley Rd',
  'Hot Springs Cres',
  'Mountainview Dr',
  'Lift Line Pl',
];

const PHOTOS = [
  'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1200',
  'https://images.unsplash.com/photo-1518733057094-95b53143d2a7?w=1200',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200',
  'https://images.unsplash.com/photo-1449844908441-8829872d2607?w=1200',
  'https://images.unsplash.com/photo-1540541338287-41700207dee6?w=1200',
  'https://images.unsplash.com/photo-1542718610-a1d656d1884c?w=1200',
  'https://images.unsplash.com/photo-1551524559-8af4e6624178?w=1200',
  'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=1200',
];

const PLATFORMS: Array<'airbnb' | 'booking' | 'vrbo' | 'direct'> = [
  'airbnb',
  'airbnb',
  'airbnb',
  'booking',
  'booking',
  'vrbo',
  'direct',
];

const FIRST_NAMES = [
  'Emma',
  'Noah',
  'Olivia',
  'Liam',
  'Ava',
  'Mason',
  'Sophia',
  'Lucas',
  'Mia',
  'Ethan',
  'Isabella',
  'James',
  'Amelia',
  'Logan',
  'Harper',
  'Benjamin',
  'Charlotte',
  'Elijah',
  'Maya',
  'Ravi',
  'Yuki',
  'Mateo',
  'Sofia',
  'Kai',
  'Anya',
];
const LAST_NAMES = [
  'Smith',
  'Johnson',
  'Brown',
  'Garcia',
  'Miller',
  'Wilson',
  'Tremblay',
  'Singh',
  'Chen',
  'Patel',
  'Nguyen',
  'Cohen',
  'Müller',
  'Lopez',
  'Tanaka',
  'Olsen',
  'Romero',
  'Hassan',
];

// ---------- Determinism ----------

// Tiny seeded RNG so re-runs produce the same fixture set (ids stay stable
// after the first run because of the unique constraint on externalListingId
// / externalReservationId).
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(424242);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;
const between = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// ---------- Main ----------

async function main() {
  console.log('Seeding demo workspace …');

  // 1) User
  let user = (await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1))[0];
  if (!user) {
    user = (await db.insert(users).values({ email: DEMO_EMAIL, name: DEMO_NAME }).returning())[0]!;
  }
  console.log(`  user      ${user.id}  ${user.email}`);

  // 2) Workspace
  let ws = (await db.select().from(workspaces).where(eq(workspaces.slug, DEMO_SLUG)).limit(1))[0];
  if (!ws) {
    ws = (
      await db
        .insert(workspaces)
        .values({
          name: 'Demo Mountain Rentals',
          slug: DEMO_SLUG,
          ownerUserId: user.id,
          // Stub key just so the "missing API key" warning doesn't show in
          // the demo. Real syncs against api.repull.dev will fail (which is
          // fine — the data is pre-seeded).
          repullApiKey: 'demo-stub-no-real-sync',
          repullApiKeyEncrypted: false,
        })
        .returning()
    )[0]!;
  } else {
    await db
      .update(workspaces)
      .set({
        name: 'Demo Mountain Rentals',
        ownerUserId: user.id,
        repullApiKey: 'demo-stub-no-real-sync',
        repullApiKeyEncrypted: false,
      })
      .where(eq(workspaces.id, ws.id));
  }
  await db
    .insert(workspaceMembers)
    .values({ workspaceId: ws.id, userId: user.id, role: 'owner' })
    .onConflictDoNothing();
  console.log(`  workspace ${ws.id}  ${ws.slug}`);

  // 3) Wipe existing demo data so re-runs are clean
  await db.delete(calendarDays).where(eq(calendarDays.workspaceId, ws.id));
  await db.delete(reservations).where(eq(reservations.workspaceId, ws.id));
  await db.delete(guests).where(eq(guests.workspaceId, ws.id));
  await db.delete(listings).where(eq(listings.workspaceId, ws.id));
  await db.delete(syncRuns).where(eq(syncRuns.workspaceId, ws.id));
  await db.delete(connections).where(eq(connections.workspaceId, ws.id));

  // 4) Connection (a fake Airbnb host)
  const conn = (
    await db
      .insert(connections)
      .values({
        workspaceId: ws.id,
        provider: 'airbnb',
        repullConnectionId: 'demo-conn-1',
        externalAccountId: 'demo-host-airbnb',
        status: 'active',
        hostMetadata: {
          hostName: 'Demo Mountain Rentals',
          avatarUrl: PHOTOS[0],
          listingsCount: 50,
        },
        lastSyncedAt: new Date(),
      })
      .returning()
  )[0]!;
  console.log(`  conn      ${conn.id}  airbnb / demo-host-airbnb`);

  // 5) 50 listings
  const created: Array<{ id: string; externalListingId: string; name: string; currency: string }> =
    [];
  for (let i = 0; i < 50; i++) {
    const loc = pick(CITIES);
    const beds = between(1, 5);
    const baths = between(1, Math.max(2, beds));
    const maxGuests = beds * 2;
    const name = `${pick(NAME_PREFIX)} ${pick(NAME_SUFFIX)} ${i + 1}`;
    const photoCount = between(2, 5);
    const photos = Array.from({ length: photoCount }, () => pick(PHOTOS));
    const externalListingId = `demo-airbnb-${10000 + i}`;

    const row = (
      await db
        .insert(listings)
        .values({
          workspaceId: ws.id,
          connectionId: conn.id,
          externalListingId,
          repullPropertyId: `demo-prop-${20000 + i}`,
          name,
          address: `${between(100, 9999)} ${pick(STREETS)}`,
          city: loc.city,
          country: loc.country,
          photos,
          maxGuests,
          bedrooms: beds,
          bathrooms: String(baths),
          currency: 'CAD',
          timezone: loc.tz,
          raw: { state: loc.state, source: 'demo-seed' },
          syncedAt: new Date(),
        })
        .returning()
    )[0]!;
    created.push({
      id: row.id,
      externalListingId,
      name,
      currency: 'CAD',
    });
  }
  console.log(`  listings  ${created.length}`);

  // 6) 200 reservations + a guest per reservation, then calendar
  const reservationsByListing = new Map<string, Array<{ checkIn: string; checkOut: string }>>();
  let resCount = 0;
  let guestCount = 0;
  for (let i = 0; i < 200; i++) {
    const listing = pick(created);
    const platform = pick(PLATFORMS);
    const checkInOffset = between(-60, 90);
    const nights = between(2, 7);
    const checkIn = isoDate(checkInOffset);
    const checkOut = isoDate(checkInOffset + nights);

    // Avoid double-booking the same nights for a listing
    const existing = reservationsByListing.get(listing.id) ?? [];
    const overlap = existing.some(
      (r) => !(checkOut <= r.checkIn || checkIn >= r.checkOut),
    );
    if (overlap) continue;
    existing.push({ checkIn, checkOut });
    reservationsByListing.set(listing.id, existing);

    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const guestEmail = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`;
    const guestRow = (
      await db
        .insert(guests)
        .values({
          workspaceId: ws.id,
          externalGuestId: `demo-guest-${30000 + i}`,
          name: `${firstName} ${lastName}`,
          email: guestEmail,
          phone: `+1${between(2000000000, 9999999999)}`,
          country: pick(['CA', 'US', 'GB', 'DE', 'AU', 'JP']),
          raw: { source: 'demo-seed' },
        })
        .returning()
    )[0]!;
    guestCount += 1;

    const nightly = between(140, 480);
    const total = nightly * nights;
    const status = pick<'confirmed' | 'confirmed' | 'confirmed' | 'pending' | 'cancelled'>([
      'confirmed',
      'confirmed',
      'confirmed',
      'pending',
      'cancelled',
    ]);

    await db.insert(reservations).values({
      workspaceId: ws.id,
      listingId: listing.id,
      guestId: guestRow.id,
      externalReservationId: `demo-res-${50000 + i}`,
      confirmationCode: `DEMO-${(50000 + i).toString(36).toUpperCase()}`,
      platform,
      status,
      checkIn,
      checkOut,
      nights,
      guestCount: between(1, 4),
      totalPrice: String(total),
      currency: listing.currency,
      guestDetails: {
        firstName,
        lastName,
        email: guestEmail,
      },
      raw: { source: 'demo-seed', nightlyRate: nightly },
    });
    resCount += 1;
  }
  console.log(`  guests    ${guestCount}`);
  console.log(`  reservs   ${resCount}`);

  // 7) Calendar — 60-day grid per listing, blocking out booked nights
  let calCount = 0;
  for (const l of created) {
    const booked = reservationsByListing.get(l.id) ?? [];
    const bookedDays = new Set<string>();
    for (const r of booked) {
      const start = new Date(r.checkIn);
      const end = new Date(r.checkOut);
      for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
        bookedDays.add(d.toISOString().slice(0, 10));
      }
    }

    for (let i = 0; i < 60; i++) {
      const date = isoDate(i);
      const isBooked = bookedDays.has(date);
      // 5% manual blocks
      const isManualBlock = !isBooked && rand() < 0.05;
      const dayOfWeek = new Date(date).getUTCDay();
      const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
      const baseNightly = between(160, 380);
      const price = isWeekend ? Math.round(baseNightly * 1.2) : baseNightly;
      await db.insert(calendarDays).values({
        workspaceId: ws.id,
        listingId: l.id,
        date,
        available: !isBooked && !isManualBlock,
        blockedReason: isBooked ? 'booked' : isManualBlock ? 'maintenance' : null,
        dailyPrice: String(price),
        minNights: 2,
        source: isManualBlock ? 'manual' : 'sync',
      });
      calCount += 1;
    }
  }
  console.log(`  calendar  ${calCount}`);

  // 8) Sync runs (audit log) — show 5 successful runs over the last 24h
  for (let i = 4; i >= 0; i--) {
    const startedAt = new Date(Date.now() - i * 6 * 60 * 60 * 1000);
    const finishedAt = new Date(startedAt.getTime() + 12 * 1000);
    await db.insert(syncRuns).values({
      workspaceId: ws.id,
      kind: i === 0 ? 'full' : 'incremental',
      startedAt,
      finishedAt,
      status: 'success',
      stats: {
        listings: 50,
        reservations: i === 0 ? resCount : between(0, 4),
        guests: i === 0 ? guestCount : between(0, 4),
        calendarDays: i === 0 ? calCount : 0,
        errors: [],
      },
    });
  }
  console.log(`  sync_runs 5`);

  console.log(`\nDone. Sign in to https://repull-channel-manager.vercel.app via the`);
  console.log(`"Sign in as demo" button to view this workspace.`);

  process.exit(0);
}

main().catch((err) => {
  console.error('seed-demo failed:', err);
  process.exit(1);
});
