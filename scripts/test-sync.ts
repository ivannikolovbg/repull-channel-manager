/**
 * E2E sync smoke test.
 *
 *   REPULL_API_KEY=... pnpm tsx scripts/test-sync.ts
 *
 * Inserts a fake user + workspace, stores the supplied API key on it, then
 * runs runFullSync against the real api.repull.dev. Prints the resulting
 * stats and queries DB row counts for sanity.
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
import { runFullSync } from '../core/services/sync';

async function main() {
  const apiKey = process.env.REPULL_API_KEY;
  if (!apiKey) {
    console.error('REPULL_API_KEY env required');
    process.exit(2);
  }

  const email = 'sync-test@repull.local';
  let user = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (!user) user = (await db.insert(users).values({ email, name: 'Sync Test' }).returning())[0];

  let ws = (await db.select().from(workspaces).where(eq(workspaces.ownerUserId, user.id)).limit(1))[0];
  if (!ws) {
    ws = (
      await db
        .insert(workspaces)
        .values({
          name: 'Sync Test Workspace',
          slug: `sync-test-${Date.now()}`,
          ownerUserId: user.id,
          repullApiKey: apiKey,
          repullApiKeyEncrypted: false,
        })
        .returning()
    )[0];
    await db
      .insert(workspaceMembers)
      .values({ workspaceId: ws.id, userId: user.id, role: 'owner' })
      .onConflictDoNothing();
  } else {
    await db
      .update(workspaces)
      .set({ repullApiKey: apiKey, repullApiKeyEncrypted: false })
      .where(eq(workspaces.id, ws.id));
  }

  console.log(`Workspace: ${ws.id} (${ws.slug})`);
  console.log('Running full sync against api.repull.dev …');
  const t0 = Date.now();
  const stats = await runFullSync(ws.id);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nSync finished in ${elapsed}s`);
  console.log('Stats:', JSON.stringify(stats, null, 2));

  // Row counts
  const [listingCount, resCount, guestCount, calCount, runCount] = await Promise.all([
    db.select().from(listings).where(eq(listings.workspaceId, ws.id)),
    db.select().from(reservations).where(eq(reservations.workspaceId, ws.id)),
    db.select().from(guests).where(eq(guests.workspaceId, ws.id)),
    db.select().from(calendarDays).where(eq(calendarDays.workspaceId, ws.id)),
    db.select().from(syncRuns).where(eq(syncRuns.workspaceId, ws.id)),
  ]);
  console.log('\nDB counts:');
  console.log('  listings:      ', listingCount.length);
  console.log('  reservations:  ', resCount.length);
  console.log('  guests:        ', guestCount.length);
  console.log('  calendar_days: ', calCount.length);
  console.log('  sync_runs:     ', runCount.length);

  // Connection rows
  const conns = await db.select().from(connections).where(eq(connections.workspaceId, ws.id));
  console.log('  connections:   ', conns.length);
  for (const c of conns) {
    console.log(`    - ${c.provider} (status: ${c.status}, ext: ${c.externalAccountId})`);
  }

  // Sample listings
  const sample = listingCount.slice(0, 5);
  console.log('\nFirst 5 listings:');
  for (const l of sample) {
    console.log(
      `  - ${l.name ?? l.externalListingId} (${l.city ?? '?'}, ${l.country ?? '?'}) — ext ${l.externalListingId}`,
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
