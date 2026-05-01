'use client';

import { Archive, Inbox, Mail, ShieldAlert } from 'lucide-react';
import { cn } from '@/core/lib/cn';
import {
  PLATFORM_LABELS,
  PLATFORM_TONE,
  type InboxCounts,
} from './types';

export interface FilterState {
  status: 'all' | 'open' | 'archived' | 'spam';
  unreadOnly: boolean;
  platform: string | null;
}

const STATUS_ITEMS: Array<{
  key: FilterState['status'];
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: 'open', label: 'Inbox', Icon: Inbox },
  { key: 'all', label: 'All', Icon: Mail },
  { key: 'archived', label: 'Archived', Icon: Archive },
  { key: 'spam', label: 'Spam', Icon: ShieldAlert },
];

export function FilterRail({
  counts,
  filter,
  onChange,
}: {
  counts: InboxCounts;
  filter: FilterState;
  onChange: (next: FilterState) => void;
}) {
  return (
    <aside className="w-56 shrink-0 border-r border-white/[0.06] flex flex-col">
      <div className="px-3 py-3 border-b border-white/[0.06]">
        <div className="text-xs uppercase tracking-wide muted">Folders</div>
      </div>
      <div className="px-2 py-2 space-y-0.5">
        <button
          type="button"
          className={cn(
            'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm',
            filter.unreadOnly
              ? 'bg-white/[0.06] text-white'
              : 'text-white/70 hover:text-white hover:bg-white/[0.04]',
          )}
          onClick={() => onChange({ ...filter, unreadOnly: !filter.unreadOnly })}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: filter.unreadOnly ? '#ff7a2b' : 'rgba(255,255,255,0.3)' }}
          />
          <span className="flex-1 text-left">Unread</span>
          <span className="text-xs muted">{counts.unread}</span>
        </button>
        {STATUS_ITEMS.map(({ key, label, Icon }) => {
          const active = filter.status === key && !filter.unreadOnly;
          const n =
            key === 'all'
              ? counts.all
              : key === 'open'
                ? counts.open
                : key === 'archived'
                  ? counts.archived
                  : counts.spam;
          return (
            <button
              key={key}
              type="button"
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm',
                active
                  ? 'bg-white/[0.06] text-white'
                  : 'text-white/70 hover:text-white hover:bg-white/[0.04]',
              )}
              onClick={() => onChange({ ...filter, status: key, unreadOnly: false })}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="flex-1 text-left">{label}</span>
              <span className="text-xs muted">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="px-3 py-2 border-t border-white/[0.06] mt-2">
        <div className="text-xs uppercase tracking-wide muted">Channels</div>
      </div>
      <div className="px-2 py-1 space-y-0.5">
        <button
          type="button"
          className={cn(
            'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm',
            !filter.platform
              ? 'bg-white/[0.06] text-white'
              : 'text-white/70 hover:text-white hover:bg-white/[0.04]',
          )}
          onClick={() => onChange({ ...filter, platform: null })}
        >
          <span className="flex-1 text-left">All channels</span>
          <span className="text-xs muted">{counts.all}</span>
        </button>
        {counts.byPlatform.map(({ platform, count }) => {
          const active = filter.platform === platform;
          const label = PLATFORM_LABELS[platform] ?? platform;
          return (
            <button
              key={platform}
              type="button"
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm',
                active
                  ? 'bg-white/[0.06] text-white'
                  : 'text-white/70 hover:text-white hover:bg-white/[0.04]',
              )}
              onClick={() => onChange({ ...filter, platform })}
            >
              <span
                className={cn(
                  'inline-block w-2 h-2 rounded-full',
                  PLATFORM_TONE[platform]?.split(' ')[1] ?? 'bg-white/20',
                )}
              />
              <span className="flex-1 text-left">{label}</span>
              <span className="text-xs muted">{count}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
