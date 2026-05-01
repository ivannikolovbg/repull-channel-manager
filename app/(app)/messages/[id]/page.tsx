/**
 * Messages — single-thread deep link.
 *
 * Same shell as `/messages` but with a pre-selected conversation. Lets the
 * user share a URL straight to a thread (or open in a new tab from a webhook
 * notification, the recent-activity sidebar, etc.).
 */

import { notFound } from 'next/navigation';
import { requireSessionWorkspace } from '@/core/lib/session';
import {
  getConversation,
  getInboxCounts,
  listConversations,
  listMessages,
} from '@/core/services/messaging/messaging.service';
import { InboxClient } from '../_components/inbox-client';

export const dynamic = 'force-dynamic';

export default async function MessagesThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireSessionWorkspace();
  const { id } = await params;
  const sp = await searchParams;

  const statusParam = sp.status ?? 'open';
  const status: 'open' | 'archived' | 'spam' | 'all' =
    statusParam === 'archived' || statusParam === 'spam' || statusParam === 'all'
      ? statusParam
      : 'open';

  const initialFilter = {
    status,
    unreadOnly: sp.unreadOnly === '1',
    platform: sp.platform ?? null,
  };

  const [rows, counts, detail, messages] = await Promise.all([
    listConversations(ctx.workspace.id, initialFilter),
    getInboxCounts(ctx.workspace.id),
    getConversation(ctx.workspace.id, id),
    listMessages(ctx.workspace.id, id),
  ]);

  if (!detail) notFound();

  return (
    <InboxClient
      initialRows={rows}
      initialCounts={counts}
      initialSelectedId={id}
      initialDetail={detail}
      initialMessages={messages}
      initialFilter={initialFilter}
    />
  );
}
