'use client';

import { Loader2, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConversationList } from './conversation-list';
import { EmptyState } from './empty-state';
import { FilterRail, type FilterState } from './filter-rail';
import { ThreadView } from './thread-view';
import type {
  ConversationDetail,
  InboxCounts,
  InboxRow,
  Message,
} from './types';

const POLL_MS = 15_000;

interface Props {
  initialRows: InboxRow[];
  initialCounts: InboxCounts;
  initialSelectedId: string | null;
  initialDetail: ConversationDetail | null;
  initialMessages: Message[];
  initialFilter: FilterState;
}

export function InboxClient(props: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterState>(props.initialFilter);
  const [rows, setRows] = useState<InboxRow[]>(props.initialRows);
  const [counts, setCounts] = useState<InboxCounts>(props.initialCounts);
  const [selectedId, setSelectedId] = useState<string | null>(props.initialSelectedId);
  const [detail, setDetail] = useState<ConversationDetail | null>(props.initialDetail);
  const [messages, setMessages] = useState<Message[]>(props.initialMessages);
  const [search, setSearch] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const composeRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ---------- Inbox fetch ----------

  const fetchInbox = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setListLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('status', filter.status);
        if (filter.unreadOnly) params.set('unreadOnly', '1');
        if (filter.platform) params.set('platform', filter.platform);
        if (search.trim()) params.set('search', search.trim());
        const res = await fetch(`/api/messages?${params.toString()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`${res.status}`);
        const json = (await res.json()) as { data: InboxRow[]; counts: InboxCounts };
        setRows(json.data);
        setCounts(json.counts);
      } catch (err) {
        if (!opts.silent) setError((err as Error).message);
      } finally {
        if (!opts.silent) setListLoading(false);
      }
    },
    [filter, search],
  );

  // Refetch on filter change.
  useEffect(() => {
    void fetchInbox();
  }, [fetchInbox]);

  // Search debounce.
  useEffect(() => {
    const t = setTimeout(() => {
      void fetchInbox();
    }, 300);
    return () => clearTimeout(t);
  }, [search, fetchInbox]);

  // Soft poll while focused.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let visible = typeof document === 'undefined' ? true : !document.hidden;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (!visible) return;
        void fetchInbox({ silent: true });
        if (selectedId) void fetchThread(selectedId, true);
      }, POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVis = () => {
      visible = !document.hidden;
      if (visible) {
        void fetchInbox({ silent: true });
        if (selectedId) void fetchThread(selectedId, true);
        start();
      } else {
        stop();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    start();
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, fetchInbox]);

  // ---------- Thread fetch ----------

  const fetchThread = useCallback(
    async (id: string, silent = false) => {
      if (!silent) setThreadLoading(true);
      try {
        const res = await fetch(`/api/messages/${id}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`${res.status}`);
        const json = (await res.json()) as {
          conversation: ConversationDetail;
          messages: Message[];
        };
        setDetail(json.conversation);
        setMessages(
          json.messages.map((m) => ({
            ...m,
            sentAt: new Date(m.sentAt),
            createdAt: new Date(m.createdAt),
            deliveredAt: m.deliveredAt ? new Date(m.deliveredAt) : null,
            readAt: m.readAt ? new Date(m.readAt) : null,
          })),
        );
      } catch (err) {
        if (!silent) setError((err as Error).message);
      } finally {
        if (!silent) setThreadLoading(false);
      }
    },
    [],
  );

  // When the user picks a conversation, fetch the thread + mark read.
  const selectConversation = useCallback(
    async (id: string) => {
      setSelectedId(id);
      // Reflect in the URL for shareability.
      const url = new URL(window.location.href);
      url.pathname = `/messages/${id}`;
      window.history.replaceState({}, '', url);
      await fetchThread(id);
      // Soft mark-read in the background.
      void fetch(`/api/messages/${id}/mark-read`, { method: 'POST' }).then(() => {
        // Reflect locally without a re-fetch.
        setRows((prev) =>
          prev.map((r) => (r.id === id ? { ...r, unreadCount: 0 } : r)),
        );
        setCounts((prev) => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
        router.refresh(); // refresh the layout sidebar badge
      });
    },
    [fetchThread, router],
  );

  // ---------- Actions ----------

  const triggerSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch('/api/messages/sync', { method: 'POST' });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `${res.status}`);
      }
      await fetchInbox({ silent: true });
      if (selectedId) await fetchThread(selectedId, true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }, [fetchInbox, fetchThread, selectedId]);

  const archive = useCallback(async () => {
    if (!selectedId) return;
    const res = await fetch(`/api/messages/${selectedId}/archive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'archive' }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    setSelectedId(null);
    setDetail(null);
    setMessages([]);
    await fetchInbox({ silent: true });
  }, [selectedId, fetchInbox]);

  const unarchive = useCallback(async () => {
    if (!selectedId) return;
    const res = await fetch(`/api/messages/${selectedId}/archive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'unarchive' }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    await fetchInbox({ silent: true });
    if (selectedId) await fetchThread(selectedId, true);
  }, [selectedId, fetchInbox, fetchThread]);

  const markSpam = useCallback(async () => {
    if (!selectedId) return;
    const res = await fetch(`/api/messages/${selectedId}/archive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'spam' }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    setSelectedId(null);
    setDetail(null);
    setMessages([]);
    await fetchInbox({ silent: true });
  }, [selectedId, fetchInbox]);

  const resyncThread = useCallback(async () => {
    if (!selectedId) return;
    await fetch('/api/messages/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversationId: selectedId }),
    });
    await fetchThread(selectedId, true);
  }, [selectedId, fetchThread]);

  // ---------- Keyboard shortcuts ----------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shouldSkipShortcut(e)) {
        // Allow `/` to focus search even when not in compose, but never inside textareas.
        if (e.key === '/' && !inEditableField()) {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === 'r') {
        e.preventDefault();
        composeRef.current?.focus();
        return;
      }
      if (e.key === 'e' && selectedId) {
        e.preventDefault();
        void archive();
        return;
      }
      if ((e.key === 'j' || e.key === 'k') && rows.length > 0) {
        e.preventDefault();
        const idx = selectedId ? rows.findIndex((r) => r.id === selectedId) : -1;
        const next =
          e.key === 'j'
            ? Math.min(rows.length - 1, idx + 1)
            : Math.max(0, idx - 1 < 0 ? 0 : idx - 1);
        const target = rows[next];
        if (target) void selectConversation(target.id);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [rows, selectedId, archive, selectConversation]);

  // ---------- Optimistic outbound ----------

  const handleOptimistic = useCallback((m: Message) => {
    setMessages((prev) => [...prev, m]);
  }, []);

  const handleAfterSend = useCallback(() => {
    if (selectedId) void fetchThread(selectedId, true);
    void fetchInbox({ silent: true });
  }, [selectedId, fetchThread, fetchInbox]);

  // ---------- Header ----------

  const headerLabel = useMemo(() => {
    if (filter.unreadOnly) return `Unread · ${counts.unread}`;
    if (filter.status === 'archived') return `Archived · ${counts.archived}`;
    if (filter.status === 'spam') return `Spam · ${counts.spam}`;
    if (filter.status === 'all') return `All conversations · ${counts.all}`;
    return `Inbox · ${counts.open}`;
  }, [filter, counts]);

  return (
    <div className="h-[calc(100vh-7rem)] -m-6 border-t border-white/[0.06] flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06]">
        <div className="text-sm font-medium">{headerLabel}</div>
        <div className="flex items-center gap-2">
          {error ? (
            <span className="text-xs text-red-300 bg-red-500/[0.06] border border-red-500/20 px-2 py-1 rounded">
              {error}
            </span>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost text-xs h-8 px-2.5"
            onClick={triggerSync}
            disabled={syncing}
          >
            {syncing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            {syncing ? 'Syncing…' : 'Sync inbox'}
          </button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        <FilterRail counts={counts} filter={filter} onChange={setFilter} />
        {counts.all === 0 && !listLoading ? (
          <EmptyState />
        ) : (
          <>
            <ConversationList
              rows={rows}
              selectedId={selectedId}
              loading={listLoading}
              search={search}
              onSearchChange={setSearch}
              onSelect={selectConversation}
              searchInputRef={searchInputRef}
            />
            <ThreadView
              detail={detail}
              messages={messages}
              loading={threadLoading}
              composeRef={composeRef}
              onSendOptimistic={handleOptimistic}
              onAfterSend={handleAfterSend}
              onArchive={archive}
              onUnarchive={unarchive}
              onMarkSpam={markSpam}
              onResync={resyncThread}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Helpers ----------

function shouldSkipShortcut(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  return inEditableField();
}

function inEditableField(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement;
  if (!el) return false;
  if ((el as HTMLElement).isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
