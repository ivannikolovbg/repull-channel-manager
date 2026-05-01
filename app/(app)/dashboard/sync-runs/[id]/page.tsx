import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { syncRuns } from '@/core/db/schema';
import { requireSessionWorkspace } from '@/core/lib/session';
import { RetrySyncButton } from './retry-button';

export const dynamic = 'force-dynamic';

interface SyncStatsShape {
  listings?: number;
  reservations?: number;
  guests?: number;
  calendarDays?: number;
  errors?: string[];
}

export default async function SyncRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireSessionWorkspace();
  const { id } = await params;

  const rows = await db
    .select()
    .from(syncRuns)
    .where(and(eq(syncRuns.workspaceId, ctx.workspace.id), eq(syncRuns.id, id)))
    .limit(1);
  const run = rows[0];
  if (!run) notFound();

  const stats = (run.stats ?? {}) as SyncStatsShape;
  const errors = stats.errors ?? [];
  const elapsed =
    run.finishedAt && run.startedAt
      ? `${((run.finishedAt.getTime() - run.startedAt.getTime()) / 1000).toFixed(1)}s`
      : run.status === 'running'
        ? 'in progress'
        : '—';

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <div className="text-xs muted">
          <Link href="/dashboard" className="underline decoration-dotted">
            Dashboard
          </Link>{' '}
          / sync run
        </div>
        <h1 className="text-2xl font-semibold mt-1">
          {run.kind} sync &middot;{' '}
          <span
            className={
              run.status === 'success'
                ? 'text-emerald-300'
                : run.status === 'partial'
                  ? 'text-amber-300'
                  : run.status === 'error'
                    ? 'text-red-300'
                    : 'text-white/70'
            }
          >
            {run.status}
          </span>
        </h1>
        <div className="muted text-xs mt-1 font-mono">id {run.id}</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Started" value={new Date(run.startedAt).toLocaleString()} />
        <Stat label="Duration" value={elapsed} />
        <Stat label="Listings" value={stats.listings ?? 0} />
        <Stat label="Reservations" value={stats.reservations ?? 0} />
        <Stat label="Guests" value={stats.guests ?? 0} />
        <Stat label="Calendar days" value={stats.calendarDays ?? 0} />
        <Stat label="Errors" value={errors.length} />
      </div>

      {errors.length > 0 ? (
        <section className="card p-5">
          <div className="text-sm font-medium">Per-record errors</div>
          <ul className="mt-3 space-y-1.5 text-xs font-mono">
            {errors.map((e, i) => (
              <li
                key={i}
                className="text-red-300 bg-red-500/[0.06] border border-red-500/20 rounded p-2 whitespace-pre-wrap"
              >
                {e}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {run.error ? (
        <section className="card p-5">
          <div className="text-sm font-medium">Top-level error</div>
          <pre className="mt-3 text-xs font-mono text-red-300 bg-red-500/[0.06] border border-red-500/20 rounded p-3 whitespace-pre-wrap">
            {run.error}
          </pre>
        </section>
      ) : null}

      <div className="flex gap-2">
        <RetrySyncButton kind={run.kind === 'incremental' ? 'incremental' : 'full'} />
        <Link href="/dashboard" className="btn btn-ghost">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide muted">{label}</div>
      <div className="text-base font-medium mt-1">{String(value)}</div>
    </div>
  );
}
