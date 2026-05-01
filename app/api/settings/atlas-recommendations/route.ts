/**
 * POST /api/settings/atlas-recommendations
 *   Body: { enabled: boolean }
 *   Toggles `workspaces.atlas_recommendations_enabled` for the caller's
 *   workspace. Used by the inline toggle in the calendar page header so
 *   hosts don't have to leave the calendar to flip the overlay on/off.
 */

import { eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/core/db';
import { workspaces } from '@/core/db/schema';
import { getSessionWorkspace } from '@/core/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const ctx = await getSessionWorkspace();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { enabled?: unknown };
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled (boolean) is required' }, { status: 400 });
  }

  await db
    .update(workspaces)
    .set({ atlasRecommendationsEnabled: body.enabled, updatedAt: new Date() })
    .where(eq(workspaces.id, ctx.workspace.id));

  return NextResponse.json({ ok: true, enabled: body.enabled });
}
