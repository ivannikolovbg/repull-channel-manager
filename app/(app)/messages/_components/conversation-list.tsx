'use client';

import { Search } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '@/core/lib/cn';
import { ConversationRow } from './conversation-row';
import type { InboxRow } from './types';

export function ConversationList({
  rows,
  selectedId,
  loading,
  search,
  onSearchChange,
  onSelect,
  searchInputRef,
}: {
  rows: InboxRow[];
  selectedId: string | null;
  loading: boolean;
  search: string;
  onSearchChange: (next: string) => void;
  onSelect: (id: string) => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll selected row into view when it changes — keeps j/k navigation snappy.
  useEffect(() => {
    if (!selectedId || !listRef.current) return;
    const target = listRef.current.querySelector(
      `[data-id="${selectedId}"]`,
    ) as HTMLElement | null;
    target?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  return (
    <div className="w-[360px] shrink-0 border-r border-white/[0.06] flex flex-col">
      <div className="px-3 py-2 border-b border-white/[0.06]">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Search conversations…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="input pl-8 py-2 text-sm"
            data-shortcut-target="search"
          />
          <kbd className="hidden sm:inline-block absolute right-2 top-1/2 -translate-y-1/2 text-[10px] muted border border-white/10 rounded px-1 py-0.5">
            /
          </kbd>
        </div>
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {loading && rows.length === 0 ? (
          <ListSkeleton />
        ) : rows.length === 0 ? (
          <div className="p-8 text-center muted text-sm">
            No conversations match these filters.
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.id} data-id={row.id}>
              <ConversationRow
                row={row}
                active={row.id === selectedId}
                onClick={() => onSelect(row.id)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'px-3 py-2.5 border-b border-white/[0.04] flex gap-3 items-start animate-pulse',
          )}
        >
          <div className="w-9 h-9 rounded-full bg-white/[0.06]" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-3 bg-white/[0.06] rounded w-1/2" />
            <div className="h-3 bg-white/[0.04] rounded w-1/3" />
            <div className="h-3 bg-white/[0.04] rounded w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
