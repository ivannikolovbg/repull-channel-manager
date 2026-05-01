import { and, between, desc, eq, gte, lte, SQL } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/core/db';
import { reservations } from '@/core/db/schema';
import { getSessionWorkspace } from '@/core/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ctx = await getSessionWorkspace();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Number(sp.get('limit') ?? 50), 200);
  const offset = Math.max(Number(sp.get('offset') ?? 0), 0);
  const status = sp.get('status');
  const platform = sp.get('platform');
  const listingId = sp.get('listingId');
  const from = sp.get('from');
  const to = sp.get('to');

  const filters: SQL[] = [eq(reservations.workspaceId, ctx.workspace.id)];
  if (status) filters.push(eq(reservations.status, status));
  if (platform) filters.push(eq(reservations.platform, platform));
  if (listingId) filters.push(eq(reservations.listingId, listingId));
  if (from && to) filters.push(between(reservations.checkIn, from, to));
  else if (from) filters.push(gte(reservations.checkIn, from));
  else if (to) filters.push(lte(reservations.checkIn, to));

  const rows = await db
    .select()
    .from(reservations)
    .where(and(...filters))
    .orderBy(desc(reservations.checkIn))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    data: rows,
    pagination: { limit, offset, returned: rows.length },
  });
}
