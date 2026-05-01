import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireSessionWorkspace } from '@/core/lib/session';
import { getReview } from '@/core/services/reviews/reviews.service';
import { PlatformBadge } from '../_components/platform-badge';
import { RatingStars } from '../_components/rating-stars';
import { ResponseComposer } from '../_components/response-composer';

export const dynamic = 'force-dynamic';

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireSessionWorkspace();
  const { id } = await params;
  const detail = await getReview(ctx.workspace.id, id);
  if (!detail) notFound();
  const r = detail.review;

  const draft = detail.responses.find((x) => x.draft);
  const submitted = detail.responses
    .filter((x) => x.submittedToRepullAt)
    .sort(
      (a, b) =>
        (b.submittedToRepullAt?.getTime() ?? 0) - (a.submittedToRepullAt?.getTime() ?? 0),
    );
  const latestSubmitted = submitted[0] ?? null;

  const ratingNum = r.rating != null ? Number(r.rating) : null;

  return (
    <div className="space-y-5 max-w-[1100px]">
      <div className="text-xs muted">
        <Link href="/reviews" className="inline-flex items-center gap-1 underline decoration-dotted">
          <ChevronLeft className="w-3 h-3" /> All reviews
        </Link>
      </div>

      <header className="card p-5 flex items-start gap-4">
        {r.guestAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={r.guestAvatarUrl}
            alt={r.guestName ?? ''}
            className="w-14 h-14 rounded-full object-cover"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-white/[0.06] flex items-center justify-center text-base">
            {(r.guestName ?? '?').slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-lg font-semibold truncate">
              {r.guestName ?? 'Anonymous guest'}
            </div>
            <PlatformBadge platform={r.platform} />
            {r.status === 'flagged' ? (
              <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border text-red-300 bg-red-500/10 border-red-500/20">
                Flagged · {r.flagReason ?? 'low rating'}
              </span>
            ) : null}
          </div>
          <div className="text-xs muted mt-1">
            {detail.listingName ? (
              <>
                {detail.listingId ? (
                  <Link
                    href={`/listings/${detail.listingId}`}
                    className="underline decoration-dotted"
                  >
                    {detail.listingName}
                  </Link>
                ) : (
                  detail.listingName
                )}
                {detail.listingCity ? ` · ${detail.listingCity}` : ''}
                {' · '}
              </>
            ) : null}
            {r.submittedAt ? new Date(r.submittedAt).toLocaleString() : 'date unknown'}
          </div>
          {detail.reservationConfirmation ? (
            <div className="text-xs muted mt-0.5">
              Reservation:{' '}
              <Link
                href={`/reservations/${detail.reservationId ?? ''}`}
                className="underline decoration-dotted"
              >
                {detail.reservationConfirmation}
              </Link>
            </div>
          ) : null}
        </div>
        <div className="text-right">
          <RatingStars rating={ratingNum} size={18} />
          <div className="text-xs muted mt-1 tabular-nums">
            {ratingNum != null ? `${ratingNum.toFixed(1)} / 5.0` : '—'}
          </div>
        </div>
      </header>

      {r.categories ? (
        <section className="card p-5">
          <div className="text-sm font-medium mb-3">Category breakdown</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(r.categories).map(([k, v]) => (
              <div key={k} className="rounded-lg border border-white/[0.06] p-3">
                <div className="text-[10px] uppercase tracking-wide muted">{k}</div>
                <div className="mt-1 flex items-center gap-2">
                  <RatingStars rating={typeof v === 'number' ? v : null} size={12} />
                  <span className="text-xs muted tabular-nums">
                    {typeof v === 'number' ? v.toFixed(1) : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card p-6">
        <div className="text-xs uppercase tracking-wide muted mb-2">Public review</div>
        {r.publicReview ? (
          <blockquote className="text-base leading-relaxed border-l-2 border-repull/60 pl-4 italic">
            {r.publicReview}
          </blockquote>
        ) : (
          <p className="muted text-sm">No public text — guest left only a star rating.</p>
        )}
      </section>

      {r.privateFeedback ? (
        <details className="card p-5">
          <summary className="text-sm font-medium cursor-pointer select-none">
            Private feedback to host
          </summary>
          <p className="text-sm leading-relaxed muted mt-3 whitespace-pre-wrap">
            {r.privateFeedback}
          </p>
        </details>
      ) : null}

      <ResponseComposer
        reviewId={r.id}
        platform={r.platform}
        initialBody={(latestSubmitted?.body ?? draft?.body) ?? ''}
        initialSubmitted={!!latestSubmitted}
        submittedAt={latestSubmitted?.submittedToRepullAt?.toISOString() ?? null}
      />

      {detail.responses.length > 0 ? (
        <section className="card p-5">
          <div className="text-sm font-medium">Response history</div>
          <ul className="mt-3 space-y-3">
            {detail.responses.map((resp) => (
              <li
                key={resp.id}
                className="border-l-2 pl-3"
                style={{
                  borderColor: resp.submittedToRepullAt
                    ? 'rgb(52,211,153,0.4)'
                    : 'rgb(251,191,36,0.4)',
                }}
              >
                <div className="text-[10px] uppercase tracking-wide muted">
                  {resp.submittedToRepullAt
                    ? `Submitted ${new Date(resp.submittedToRepullAt).toLocaleString()}`
                    : `Draft · saved ${new Date(resp.updatedAt).toLocaleString()}`}
                  {resp.source === 'ai-suggested' ? ' · AI-assisted' : ''}
                  {resp.lastError ? ` · error: ${resp.lastError}` : ''}
                </div>
                <p className="text-sm whitespace-pre-wrap mt-1">{resp.body}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
