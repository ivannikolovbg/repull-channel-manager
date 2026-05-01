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
    return {
      id: existing[0].id,
      name: existing[0].name,
      slug: existing[0].slug,
      ownerUserId: existing[0].ownerUserId,
      hasApiKey: !!existing[0].repullApiKey,
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
      return { id: ws.id, name: ws.name, slug: ws.slug, ownerUserId: ws.ownerUserId, hasApiKey: false };
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
