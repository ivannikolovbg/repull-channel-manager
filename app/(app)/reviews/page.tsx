/**
 * Reviews — list view with stats header, filterable + sortable table.
 *
 * Server-component shell: fetches data + listings via the service layer; the
 * filter bar + table itself are client components for instant interaction.
 */

import { asc, eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { listings } from '@/core/db/schema';
import { requireSessionWorkspace } from '@/core/lib/session';
import { getStats, listReviews, type ReviewFilters } from '@/core/services/reviews/reviews.service';
import { ReviewsEmptyState } from './_components/empty-state';
import { ReviewsFilterBar } from './_components/filter-bar';
import { ReviewsTable } from './_components/reviews-table';
import { StatCard } from './_components/stat-card';
import { SyncReviewsButton } from './sync-button';

export const dynamic = 'force-dynamic';

export default async function ReviewsListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireSessionWorkspace();
  const sp = await searchParams;

  const filters: ReviewFilters = {
    platform: sp.platform || undefined,
    ratingBucket: (sp.ratingBucket as ReviewFilters['ratingBucket']) || undefined,
    status: (sp.status as ReviewFilters['status']) || undefined,
    listingId: sp.listingId || undefined,
    from: sp.from || undefined,
    to: sp.to || undefined,
    search: sp.search || undefined,
    sort: (sp.sort as ReviewFilters['sort']) || 'newest',
    limit: 100,
    offset: Number(sp.offset ?? 0) || 0,
  };

  const [stats, rows, listingRows] = await Promise.all([
    getStats(ctx.workspace.id),
    listReviews(ctx.workspace.id, filters),
    db
      .select({ id: listings.id, name: listings.name })
      .from(listings)
      .where(eq(listings.workspaceId, ctx.workspace.id))
      .orderBy(asc(listings.name))
      .limit(500),
  ]);

  const noReviewsAtAll = stats.totalReviews === 0;
  const respondRate = stats.responseRate;
  const respondTone =
    respondRate >= 0.8 ? 'positive' : respondRate >= 0.5 ? 'warning' : 'danger';

  return (
    <div className="space-y-5 max-w-[1400px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reviews</h1>
          <p className="muted text-sm mt-1">
            Respond to guest reviews across every connected channel — with AI-powered drafts.
          </p>
        </div>
        <SyncReviewsButton />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Avg rating · 30d"
          value={
            stats.averageRating != null ? stats.averageRating.toFixed(2) : '—'
          }
          hint={`${stats.reviewsLast30d} review${stats.reviewsLast30d === 1 ? '' : 's'}`}
        />
        <StatCard
          label="Reviews this year"
          value={stats.reviewsLast365d.toLocaleString()}
          hint={`${stats.totalReviews.toLocaleString()} all time`}
        />
        <StatCard
          label="Response rate"
          value={`${Math.round(respondRate * 100)}%`}
          hint={`${stats.needsResponse} awaiting`}
          tone={respondTone}
        />
        <StatCard
          label="Needs attention"
          value={stats.needsResponse + stats.flaggedCount}
          hint={`${stats.draftCount} draft${stats.draftCount === 1 ? '' : 's'} · ${stats.flaggedCount} flagged`}
          tone={stats.needsResponse + stats.flaggedCount > 0 ? 'warning' : 'default'}
        />
      </div>

      {noReviewsAtAll ? (
        <ReviewsEmptyState hasListings={listingRows.length > 0} />
      ) : (
        <>
          <ReviewsFilterBar listings={listingRows} />
          <ReviewsTable rows={rows} />
        </>
      )}
    </div>
  );
}
