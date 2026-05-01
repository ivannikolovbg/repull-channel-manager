/**
 * Workspace resolution + bootstrap.
 *
 * For v1 every user owns exactly one workspace, auto-created on first login.
 * Multi-workspace switching is a Phase 2 feature — the data model already
 * supports it via `workspace_members`.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { workspaceMembers, workspaces } from '@/core/db/schema';

export interface CurrentWorkspace {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  hasApiKey: boolean;
  /** True when we have a real Repull-signed webhook subscription on file. */
  hasWebhookSubscription: boolean;
  /** Public webhook URL Repull will call (the channel-manager's own /api/webhooks/repull endpoint). */
  webhookUrl: string | null;
  /** When true, manual calendar overrides are pushed back to Repull on save. */
  autoPushCalendar: boolean;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || `ws-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getOrCreateWorkspaceForUser(opts: {
  userId: string;
  email: string;
}): Promise<CurrentWorkspace> {
  // Already have one?
  const existing = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.ownerUserId, opts.userId))
    .limit(1);
  if (existing[0]) {
    const w = existing[0];
    return {
      id: w.id,
      name: w.name,
      slug: w.slug,
      ownerUserId: w.ownerUserId,
      hasApiKey: !!w.repullApiKey,
      hasWebhookSubscription: !!w.repullWebhookId,
      webhookUrl: w.repullWebhookUrl,
      autoPushCalendar: w.autoPushCalendar,
    };
  }

  // Mint one. Slug must be globally unique — fall back to a random suffix on collision.
  const baseSlug = slugify(opts.email.split('@')[0] ?? 'workspace');
  let slug = baseSlug;
  for (let i = 0; i < 5; i++) {
    try {
      const inserted = await db
        .insert(workspaces)
        .values({
          name: `${opts.email.split('@')[0] ?? 'My'}'s workspace`,
          slug,
          ownerUserId: opts.userId,
        })
        .returning();
      const ws = inserted[0]!;
      await db
        .insert(workspaceMembers)
        .values({ workspaceId: ws.id, userId: opts.userId, role: 'owner' })
        .onConflictDoNothing();
      return {
        id: ws.id,
        name: ws.name,
        slug: ws.slug,
        ownerUserId: ws.ownerUserId,
        hasApiKey: false,
        hasWebhookSubscription: false,
        webhookUrl: null,
        autoPushCalendar: ws.autoPushCalendar,
      };
    } catch {
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    }
  }
  throw new Error('Failed to create workspace after 5 attempts');
}

export async function getWorkspaceById(id: string) {
  const rows = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
  return rows[0];
}
