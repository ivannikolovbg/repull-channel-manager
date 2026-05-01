'use client';

import { cn } from '@/core/lib/cn';
import { initials, timeLabel } from './format';
import type { Message } from './types';
import { AttachmentPill } from './attachment-pill';

export function MessageBubble({
  message,
  showAvatar,
  guestName,
}: {
  message: Message;
  showAvatar: boolean;
  guestName: string | null;
}) {
  const isOutbound = message.direction === 'outbound';
  const senderLabel = isOutbound
    ? (message.senderName ?? 'You')
    : (message.senderName ?? guestName ?? 'Guest');
  return (
    <div
      className={cn(
        'flex gap-2 max-w-[80%]',
        isOutbound ? 'self-end flex-row-reverse' : 'self-start flex-row',
      )}
    >
      {showAvatar ? (
        <div
          className={cn(
            'shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold',
            isOutbound
              ? 'bg-[#ff7a2b]/20 text-[#ff9c5a]'
              : 'bg-white/10 text-white/80',
          )}
          title={senderLabel}
        >
          {initials(senderLabel)}
        </div>
      ) : (
        <div className="w-7 h-7 shrink-0" />
      )}
      <div className={cn('flex flex-col', isOutbound ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words',
            isOutbound
              ? 'bg-[#ff7a2b] text-[#0a0a0a] rounded-tr-sm'
              : 'bg-white/[0.06] text-white rounded-tl-sm',
          )}
        >
          {message.body}
        </div>
        {message.attachments && message.attachments.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.attachments.map((a, i) => (
              <AttachmentPill key={i} attachment={a} />
            ))}
          </div>
        ) : null}
        <div className="text-[10px] muted mt-0.5 px-1">
          {timeLabel(message.sentAt)}
          {message.readAt && isOutbound ? ' · Read' : ''}
        </div>
      </div>
    </div>
  );
}
