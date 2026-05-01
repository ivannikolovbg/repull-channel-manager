import Link from 'next/link';
import { headers } from 'next/headers';
import { runFullSync } from '@/core/services/sync';
import { getRepullForWorkspace } from '@/core/services/repull-client';
import { ensureWebhookSubscription } from '@/core/services/webhook-subscribe';
import { requireSessionWorkspace } from '@/core/lib/session';

export const dynamic = 'force-dynamic';

interface AnyConnection {
  id?: string | number;
  provider?: string;
  status?: string;
  connected?: boolean;
}

/**
 * Repull bounces the user back here after the picker (or the per-provider
 * Airbnb consent flow) finishes. We re-check what the workspace now has
 * connected, auto-subscribe webhooks if this is the first connection, and
 * kick off a full sync.
 */
export default async function ConnectionReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const ctx = await requireSessionWorkspace();
  const sp = await searchParams;

  let connectedCount = 0;
  let connectedSummary: string[] = [];
  let error: string | null = sp.error ?? null;
  let webhookNote: string | null = null;
  let stats: { listings: number; reservations: number; calendarDays: number; errors: string[] } | null =
    null;

  try {
    const client = await getRepullForWorkspace(ctx.workspace.id);

    // /v1/connect (GET) — list every connection on this workspace, regardless
    // of which channel the picker landed on.
    let allConns: AnyConnection[] = [];
    try {
      allConns = ((await client.connect.list()) ?? []) as unknown as AnyConnection[];
    } catch {
      // Fall back to the legacy single-provider Airbnb status check.
      const status = await client.connect.airbnb.status();
      if (status?.connected) {
        allConns = [{ provider: 'airbnb', status: 'active', connected: true }];
      }
    }

    connectedCount = allConns.filter((c) => c.connected !== false && c.status !== 'disconnected')
      .length;
    connectedSummary = allConns
      .map((c) => c.provider)
      .filter((p): p is string => typeof p === 'string');

    if (connectedCount > 0) {
      // Auto-subscribe webhooks on first connect (idempotent).
      try {
        const hdrs = await headers();
        const host = hdrs.get('host') ?? 'localhost:3030';
        const proto = hdrs.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
        const callbackUrl = `${proto}://${host}/api/webhooks/repull`;
        const sub = await ensureWebhookSubscription({
          workspaceId: ctx.workspace.id,
          callbackUrl,
        });
        webhookNote = sub.alreadyExisted
          ? `Webhook subscription on file (${sub.webhookId.slice(0, 8)}…).`
          : `Subscribed ${sub.events.length} webhook event${sub.events.length === 1 ? '' : 's'} for live updates.`;
      } catch (err) {
        // Non-fatal — sync still proceeds.
        webhookNote = `Webhook auto-subscribe failed (${(err as Error).message}). Live updates will not arrive until you re-trigger from /connections.`;
      }

      try {
        stats = await runFullSync(ctx.workspace.id);
      } catch (err) {
        error = (err as Error).message;
      }
    }
  } catch (err) {
    error = (err as Error).message;
  }

  if (connectedCount === 0) {
    return (
      <main className="max-w-xl mx-auto card p-6">
        <h1 className="text-xl font-semibold">Connection not finalised yet</h1>
        <p className="muted text-sm mt-2">
          We didn&apos;t see an active channel connection on your Repull workspace yet. This is
          usually because the consent flow was cancelled or the partner-side sync hasn&apos;t
          completed. Try again from the connections page.
        </p>
        {error ? (
          <pre className="mt-4 text-xs font-mono text-red-300 bg-red-500/[0.06] border border-red-500/20 rounded p-3 whitespace-pre-wrap">
            {error}
          </pre>
        ) : null}
        <Link href="/connections" className="btn btn-primary mt-5">
          Back to connections
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-xl mx-auto card p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Connected</h1>
        <p className="muted text-sm mt-1">
          {connectedCount} channel{connectedCount === 1 ? '' : 's'} active
          {connectedSummary.length > 0
            ? ` — ${Array.from(new Set(connectedSummary)).join(', ')}`
            : ''}
          .
        </p>
      </div>
      {webhookNote ? (
        <div className="text-xs muted bg-white/[0.03] border border-white/[0.06] rounded p-3">
          {webhookNote}
        </div>
      ) : null}
      {stats ? (
        <div className="text-xs font-mono text-emerald-300 bg-emerald-500/[0.06] border border-emerald-500/20 rounded p-3">
          Synced {stats.listings} listings · {stats.reservations} reservations · {stats.calendarDays}{' '}
          calendar days
          {stats.errors.length > 0 ? ` · ${stats.errors.length} non-fatal errors` : ''}
        </div>
      ) : null}
      {error ? (
        <pre className="text-xs font-mono text-red-300 bg-red-500/[0.06] border border-red-500/20 rounded p-3 whitespace-pre-wrap">
          {error}
        </pre>
      ) : null}
      <div className="flex gap-2">
        <Link href="/listings" className="btn btn-primary">
          Open listings
        </Link>
        <Link href="/connections" className="btn btn-ghost">
          Back to connections
        </Link>
      </div>
    </main>
  );
}
