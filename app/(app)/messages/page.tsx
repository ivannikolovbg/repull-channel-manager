/**
 * Messages — guest inbox.
 *
 * Server-component shell that hydrates the client-side `InboxClient` with the
 * initial inbox rows + folder counts so the first paint shows real data, not a
 * spinner. Selection / thread switching is handled client-side via shallow
 * `history.replaceState` to avoid a server round-trip per click.
 */

import { requireSessionWorkspace } from '@/core/lib/session';
import {
  getInboxCounts,
  listConversations,
} from '@/core/services/messaging/messaging.service';
import { InboxClient } from './_components/inbox-client';

export const dynamic = 'force-dynamic';

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireSessionWorkspace();
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

  const [rows, counts] = await Promise.all([
    listConversations(ctx.workspace.id, initialFilter),
    getInboxCounts(ctx.workspace.id),
  ]);

  return (
    <InboxClient
      initialRows={rows}
      initialCounts={counts}
      initialSelectedId={null}
      initialDetail={null}
      initialMessages={[]}
      initialFilter={initialFilter}
    />
  );
}
