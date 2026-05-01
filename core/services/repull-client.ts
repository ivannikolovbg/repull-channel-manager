/**
 * Per-workspace Repull SDK factory.
 *
 * Wraps `@repull/sdk` with the workspace's stored API key (decrypted on read).
 * Use this in any server-side route or sync job.
 */

import { Repull } from '@repull/sdk';
import { eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { workspaces } from '@/core/db/schema';
import { decryptApiKey } from '@/core/lib/crypto';

const BASE_URL = process.env.REPULL_API_BASE_URL ?? 'https://api.repull.dev';

export async function getRepullForWorkspace(workspaceId: string): Promise<Repull> {
  const rows = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const ws = rows[0];
  if (!ws?.repullApiKey) {
    throw new Error(
      `Workspace ${workspaceId} has no Repull API key. Add one in /settings before syncing.`,
    );
  }
  const apiKey = decryptApiKey(ws.repullApiKey, ws.repullApiKeyEncrypted);
  return new Repull({ apiKey, baseUrl: BASE_URL });
}

/** For ad-hoc usage (e.g. health check from a dev script) without storing the key. */
export function getRepullWithKey(apiKey: string): Repull {
  return new Repull({ apiKey, baseUrl: BASE_URL });
}
