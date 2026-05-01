import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/core/db';
import { listings } from '@/core/db/schema';
import { getSessionWorkspace } from '@/core/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getSessionWorkspace();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rows = await db
    .select()
    .from(listings)
    .where(eq(listings.workspaceId, ctx.workspace.id))
    .orderBy(desc(listings.syncedAt))
    .limit(200);
  return NextResponse.json({ data: rows });
}
