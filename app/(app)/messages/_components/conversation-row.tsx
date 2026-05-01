'use client';

import { cn } from '@/core/lib/cn';
import { initials, relativeTime } from './format';
import { PLATFORM_LABELS, PLATFORM_TONE, type InboxRow } from './types';

export function ConversationRow({
  row,
  active,
  onClick,
}: {
  row: InboxRow;
  active: boolean;
  onClick: () => void;
}) {
  const guestDisplayName = row.guestName?.trim() || row.guestEmail || 'Unknown guest';
  const platformLabel = PLATFORM_LABELS[row.platform] ?? row.platform;
  const isUnread = row.unreadCount > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 border-b border-white/[0.04] flex gap-3 items-start',
        active
          ? 'bg-white/[0.05]'
          : 'hover:bg-white/[0.025]',
      )}
    >
      <div
        className={cn(
          'shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold',
          'bg-gradient-to-br from-white/10 to-white/[0.02] text-white/80',
        )}
      >
        {initials(guestDisplayName)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'text-sm truncate flex-1 min-w-0',
              isUnread ? 'font-semibold text-white' : 'text-white/90',
            )}
          >
            {guestDisplayName}
          </div>
          <div className="text-[11px] muted shrink-0">{relativeTime(row.lastMessageAt)}</div>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <div className="text-[11px] muted truncate flex-1 min-w-0">
            {row.listingName ?? 'No listing linked'}
          </div>
          <span
            className={cn(
              'shrink-0 text-[10px] px-1.5 py-0.5 rounded border',
              PLATFORM_TONE[row.platform] ?? PLATFORM_TONE.other,
            )}
          >
            {platformLabel}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div
            className={cn(
              'text-xs truncate flex-1 min-w-0',
              isUnread ? 'text-white/80' : 'muted',
            )}
          >
            {row.lastMessagePreview ?? 'No messages yet'}
          </div>
          {isUnread ? (
            <span
              className="shrink-0 w-2 h-2 rounded-full"
              style={{ background: '#ff7a2b' }}
              aria-label={`${row.unreadCount} unread`}
            />
          ) : null}
        </div>
      </div>
    </button>
  );
}
