import Link from 'next/link';
import { MessageSquareText } from 'lucide-react';

export function ReviewsEmptyState({
  hasListings,
}: {
  hasListings: boolean;
}) {
  return (
    <div className="card p-12 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-white/[0.04] flex items-center justify-center mb-4">
        <MessageSquareText className="w-5 h-5 text-white/50" />
      </div>
      <div className="text-sm font-medium">No reviews yet</div>
      <p className="muted text-sm mt-2 max-w-md mx-auto">
        {hasListings
          ? 'Reviews from your connected channels will appear here as guests submit them. ' +
            'Run a sync to pull in any historical reviews from the channel.'
          : 'Connect a listing to start receiving guest reviews — Airbnb, Booking, VRBO, and direct.'}
      </p>
      <div className="mt-5 flex items-center justify-center gap-2">
        <Link className="btn btn-primary" href="/connections">
          {hasListings ? 'Manage connections' : 'Connect a channel'}
        </Link>
      </div>
    </div>
  );
}
