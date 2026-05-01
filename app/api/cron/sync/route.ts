/**
 * Cron entry point for periodic full-sync.
 *
 * Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. We accept either
 * that header or no header at all when running locally without `CRON_SECRET`
 * set.
 *
 * Walks every workspace that has a `repull_api_key` set and runs a full sync.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/core/db';
import { workspaces } from '@/core/db/schema';
import { runFullSync } from '@/core/services/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorize(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true; // local-friendly default
  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const allWorkspaces = await db.select().from(workspaces);
  const results: Array<{ workspaceId: string; ok: boolean; stats?: unknown; error?: string }> = [];

  for (const ws of allWorkspaces) {
    if (!ws.repullApiKey) continue;
    try {
      const stats = await runFullSync(ws.id);
      results.push({ workspaceId: ws.id, ok: true, stats });
    } catch (err) {
      results.push({ workspaceId: ws.id, ok: false, error: (err as Error).message });
    }
  }

  return NextResponse.json({ ran: results.length, results });
}

export const POST = GET;
