import { eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { connections } from '@/core/db/schema';
import { requireSessionWorkspace } from '@/core/lib/session';
import { ConnectionsClient } from './connections-client';

export const dynamic = 'force-dynamic';

export default async function ConnectionsPage() {
  const ctx = await requireSessionWorkspace();
  const rows = await db
    .select()
    .from(connections)
    .where(eq(connections.workspaceId, ctx.workspace.id));
  return <ConnectionsClient initial={rows} hasApiKey={ctx.workspace.hasApiKey} />;
}
