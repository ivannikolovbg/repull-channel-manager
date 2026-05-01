import { count, eq } from 'drizzle-orm';
import { db } from '@/core/db';
import {
  calendarDays,
  connections,
  listings,
  reservations,
  syncRuns,
} from '@/core/db/schema';
import { requireSessionWorkspace } from '@/core/lib/session';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const ctx = await requireSessionWorkspace();
  const wsId = ctx.workspace.id;

  const [conns, list, res, cal, latestRun] = await Promise.all([
    db.select({ c: count() }).from(connections).where(eq(connections.workspaceId, wsId)),
    db.select({ c: count() }).from(listings).where(eq(listings.workspaceId, wsId)),
    db.select({ c: count() }).from(reservations).where(eq(reservations.workspaceId, wsId)),
    db.select({ c: count() }).from(calendarDays).where(eq(calendarDays.workspaceId, wsId)),
    db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.workspaceId, wsId))
      .orderBy(syncRuns.startedAt)
      .limit(5),
  ]);

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold">Workspace overview</h1>
        <p className="muted text-sm mt-1">{ctx.workspace.name}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Connections" value={conns[0]?.c ?? 0} />
        <Stat label="Listings" value={list[0]?.c ?? 0} />
        <Stat label="Reservations" value={res[0]?.c ?? 0} />
        <Stat label="Calendar days" value={cal[0]?.c ?? 0} />
      </div>

      <section className="card p-5">
        <div className="text-sm font-medium">Recent sync runs</div>
        {latestRun.length === 0 ? (
          <p className="muted text-sm mt-3">
            No syncs yet — connect a channel to kick off the first one.
          </p>
        ) : (
          <table className="w-full text-sm mt-4">
            <thead className="text-xs muted uppercase tracking-wide text-left">
              <tr>
                <th className="py-2">Started</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Stats</th>
              </tr>
            </thead>
            <tbody>
              {latestRun.map((run) => (
                <tr key={run.id} className="border-t border-white/[0.04]">
                  <td className="py-2">{new Date(run.startedAt).toLocaleString()}</td>
                  <td>{run.kind}</td>
                  <td>
                    <span
                      className={
                        run.status === 'success'
                          ? 'text-emerald-400'
                          : run.status === 'partial'
                            ? 'text-amber-400'
                            : run.status === 'error'
                              ? 'text-red-400'
                              : 'muted'
                      }
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className="font-mono text-xs">{summariseStats(run.stats)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide muted">{label}</div>
      <div className="text-2xl font-semibold mt-1">{String(value)}</div>
    </div>
  );
}

function summariseStats(stats: unknown): string {
  if (!stats || typeof stats !== 'object') return '—';
  const s = stats as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof s.listings === 'number') parts.push(`${s.listings} listings`);
  if (typeof s.reservations === 'number') parts.push(`${s.reservations} resv`);
  if (typeof s.calendarDays === 'number') parts.push(`${s.calendarDays} days`);
  return parts.join(' · ') || '—';
}
