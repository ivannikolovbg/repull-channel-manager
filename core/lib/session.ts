/**
 * Server-side helpers to bridge NextAuth → workspace-scoped requests.
 *
 *   const ctx = await requireSessionWorkspace();
 *   // ctx = { userId, workspace }
 */

import { redirect } from 'next/navigation';
import { auth } from './auth';
import { getOrCreateWorkspaceForUser, type CurrentWorkspace } from './workspace';

export interface SessionContext {
  userId: string;
  email: string;
  workspace: CurrentWorkspace;
}

export async function getSessionWorkspace(): Promise<SessionContext | null> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return null;
  const workspace = await getOrCreateWorkspaceForUser({
    userId: session.user.id,
    email: session.user.email,
  });
  return { userId: session.user.id, email: session.user.email, workspace };
}

export async function requireSessionWorkspace(): Promise<SessionContext> {
  const ctx = await getSessionWorkspace();
  if (!ctx) redirect('/sign-in');
  return ctx;
}
