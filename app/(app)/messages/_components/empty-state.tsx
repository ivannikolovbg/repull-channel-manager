'use client';

import Link from 'next/link';
import { MessageSquare, Plug, Sparkles } from 'lucide-react';

/**
 * Rendered in the inbox center column when no conversations exist yet.
 * Doubles as a feature-tour for new workspaces.
 */
export function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-4">
      <div className="w-12 h-12 rounded-full bg-white/[0.06] flex items-center justify-center">
        <MessageSquare className="w-6 h-6 text-white/60" />
      </div>
      <div>
        <h2 className="text-base font-semibold">Your inbox is empty</h2>
        <p className="muted text-sm mt-1 max-w-md">
          Connect a channel — Airbnb, Booking.com, or VRBO — and guest messages will start
          flowing in. Vanio AI can draft replies in one click.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link href="/connections" className="btn btn-primary text-xs h-8 px-3">
          <Plug className="w-3 h-3" />
          Connect a channel
        </Link>
      </div>
      <div className="mt-6 w-full max-w-md text-left rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
        <div className="text-xs uppercase tracking-wide muted flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" />
          Sample message
        </div>
        <div className="text-sm">
          <span className="font-medium">Emma S.</span>{' '}
          <span className="muted text-xs">· Slopeside Chalet 12 · Airbnb</span>
        </div>
        <div className="text-sm leading-relaxed">
          “Hey there! We just landed in Calgary and we're driving up to Fernie. Is the
          early check-in still possible? Also — can you recommend somewhere for dinner near
          the place?”
        </div>
      </div>
    </div>
  );
}
