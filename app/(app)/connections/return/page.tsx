import { redirect } from 'next/navigation';
import { runFullSync } from '@/core/services/sync';
import { getRepullForWorkspace } from '@/core/services/repull-client';
import { requireSessionWorkspace } from '@/core/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Repull bounces the user back here after the Airbnb consent flow finishes.
 * We re-check the connection status and, if connected, kick off the initial
 * full sync, then redirect to /connections.
 */
export default async function ConnectionReturnPage() {
  const ctx = await requireSessionWorkspace();
  let connected = false;
  let error: string | null = null;
  let stats: { listings: number; reservations: number; calendarDays: number; errors: string[] } | null =
    null;

  try {
    const client = await getRepullForWorkspace(ctx.workspace.id);
    const status = await client.connect.airbnb.status();
    connected = !!status?.connected;
    if (connected) {
      try {
        stats = await runFullSync(ctx.workspace.id);
      } catch (err) {
        error = (err as Error).message;
      }
    }
  } catch (err) {
    error = (err as Error).message;
  }

  if (!connected) {
    return (
      <main className="max-w-xl mx-auto card p-6">
        <h1 className="text-xl font-semibold">Connection not finalised yet</h1>
        <p className="muted text-sm mt-2">
          We didn&apos;t see an active Airbnb connection on your Repull workspace yet. This is
          usually because the consent flow was cancelled or the partner-side sync hasn&apos;t
          completed. Try again from the connections page.
        </p>
        {error ? (
          <pre className="mt-4 text-xs font-mono text-red-300 bg-red-500/[0.06] border border-red-500/20 rounded p-3 whitespace-pre-wrap">
            {error}
          </pre>
        ) : null}
        <a href="/connections" className="btn btn-primary mt-5">
          Back to connections
        </a>
      </main>
    );
  }

  // Connected & synced — redirect to listings.
  void stats;
  redirect('/listings');
}
