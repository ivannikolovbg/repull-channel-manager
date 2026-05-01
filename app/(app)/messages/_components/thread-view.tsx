'use client';

import {
  Archive,
  ChevronDown,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Undo2,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/core/lib/cn';
import { ComposeBox } from './compose-box';
import { ConfirmDialog } from './confirm-dialog';
import { dayLabel, initials } from './format';
import { MessageBubble } from './message-bubble';
import {
  PLATFORM_LABELS,
  PLATFORM_TONE,
  type ConversationDetail,
  type Message,
} from './types';

export interface ThreadViewProps {
  detail: ConversationDetail | null;
  messages: Message[];
  loading: boolean;
  composeRef?: React.RefObject<HTMLTextAreaElement | null>;
  onSendOptimistic: (m: Message) => void;
  onAfterSend: () => void;
  onArchive: () => Promise<void>;
  onUnarchive: () => Promise<void>;
  onMarkSpam: () => Promise<void>;
  onResync: () => Promise<void>;
}

export function ThreadView(props: ThreadViewProps) {
  const {
    detail,
    messages,
    loading,
    composeRef,
    onSendOptimistic,
    onAfterSend,
    onArchive,
    onUnarchive,
    onMarkSpam,
    onResync,
  } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [actionBusy, setActionBusy] = useState<null | 'archive' | 'unarchive' | 'spam' | 'resync'>(
    null,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | {
    title: string;
    description: string;
    confirmLabel: string;
    tone: 'default' | 'danger';
    run: () => Promise<void>;
    busyKey: 'archive' | 'spam';
  }>(null);

  // Auto-scroll to the newest message when the thread changes / grows.
  useEffect(() => {
    if (!scrollRef.current) return;
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, [detail?.conversation.id, messages.length]);

  // Close the menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const tgt = e.target as HTMLElement;
      if (!tgt.closest('[data-menu="thread"]')) setMenuOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [menuOpen]);

  const grouped = useMemo(() => groupByDay(messages), [messages]);

  if (!detail && !loading) {
    return (
      <div className="flex-1 flex items-center justify-center muted text-sm">
        Pick a conversation to read
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="border-b border-white/[0.06] px-4 py-2.5 flex items-center gap-3">
        {loading && !detail ? (
          <div className="h-7 w-48 rounded bg-white/[0.06] animate-pulse" />
        ) : detail ? (
          <>
            <div
              className={cn(
                'shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold',
                'bg-gradient-to-br from-white/10 to-white/[0.02] text-white/80',
              )}
            >
              {initials(detail.guestName ?? 'Guest')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {detail.guestName ?? detail.guestEmail ?? 'Unknown guest'}
              </div>
              <div className="text-xs muted truncate flex items-center gap-2">
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded border',
                    PLATFORM_TONE[detail.conversation.platform] ?? PLATFORM_TONE.other,
                  )}
                >
                  {PLATFORM_LABELS[detail.conversation.platform] ?? detail.conversation.platform}
                </span>
                <span className="truncate">
                  {detail.listingName ?? 'No listing'}
                  {detail.listingCity ? ` · ${detail.listingCity}` : ''}
                </span>
                {detail.reservationCode ? (
                  <Link
                    href={`/reservations/${detail.conversation.reservationId}`}
                    className="underline decoration-dotted truncate"
                  >
                    {detail.reservationCode}
                  </Link>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost text-xs h-8 px-2.5"
              disabled={actionBusy === 'resync'}
              onClick={async () => {
                setActionBusy('resync');
                try {
                  await onResync();
                } finally {
                  setActionBusy(null);
                }
              }}
              title="Refetch this thread from Repull"
            >
              {actionBusy === 'resync' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              Sync
            </button>
            <div data-menu="thread" className="relative">
              <button
                type="button"
                className="btn btn-ghost text-xs h-8 px-2.5"
                onClick={() => setMenuOpen((v) => !v)}
              >
                Actions
                <ChevronDown className="w-3 h-3" />
              </button>
              {menuOpen ? (
                <div className="absolute right-0 top-9 z-10 min-w-[180px] rounded-md border border-white/[0.1] bg-[#141414] shadow-xl p-1">
                  {detail.conversation.status === 'archived' ? (
                    <MenuItem
                      onClick={async () => {
                        setMenuOpen(false);
                        setActionBusy('unarchive');
                        try {
                          await onUnarchive();
                        } finally {
                          setActionBusy(null);
                        }
                      }}
                      Icon={Undo2}
                      label="Unarchive"
                      busy={actionBusy === 'unarchive'}
                    />
                  ) : (
                    <MenuItem
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirm({
                          title: 'Archive this conversation?',
                          description:
                            'It will move to the Archived folder. You can restore it any time.',
                          confirmLabel: 'Archive',
                          tone: 'default',
                          busyKey: 'archive',
                          run: onArchive,
                        });
                      }}
                      Icon={Archive}
                      label="Archive"
                      busy={actionBusy === 'archive'}
                    />
                  )}
                  {detail.conversation.status !== 'spam' ? (
                    <MenuItem
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirm({
                          title: 'Mark this conversation as spam?',
                          description:
                            'It will move to the Spam folder and stop counting toward unread. You can restore it later.',
                          confirmLabel: 'Mark as spam',
                          tone: 'danger',
                          busyKey: 'spam',
                          run: onMarkSpam,
                        });
                      }}
                      Icon={ShieldAlert}
                      label="Mark as spam"
                      tone="danger"
                      busy={actionBusy === 'spam'}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {loading && messages.length === 0 ? (
          <ThreadSkeleton />
        ) : grouped.length === 0 ? (
          <div className="flex-1 flex items-center justify-center muted text-sm py-12">
            No messages in this thread yet.
          </div>
        ) : (
          grouped.map((group, gi) => (
            <div key={gi} className="space-y-2 flex flex-col">
              <div className="text-[11px] muted self-center sticky top-0 bg-[#0a0a0a]/60 backdrop-blur px-2 py-0.5 rounded-full">
                {group.label}
              </div>
              {group.messages.map((m, i) => {
                const prev = group.messages[i - 1];
                const showAvatar = !prev || prev.direction !== m.direction;
                return (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    showAvatar={showAvatar}
                    guestName={detail?.guestName ?? null}
                  />
                );
              })}
            </div>
          ))
        )}
      </div>

      {detail ? (
        <ComposeBox
          conversationId={detail.conversation.id}
          textareaRef={composeRef}
          onSend={async (body) => {
            // Optimistic insert — the parent will refetch right after.
            const optimistic: Message = {
              id: `optimistic-${Date.now()}`,
              conversationId: detail.conversation.id,
              repullMessageId: null,
              direction: 'outbound',
              senderName: 'You',
              senderAvatarUrl: null,
              body,
              attachments: [],
              sentAt: new Date(),
              deliveredAt: null,
              readAt: null,
              createdAt: new Date(),
            };
            onSendOptimistic(optimistic);
            const res = await fetch(`/api/messages/${detail.conversation.id}/send`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ body }),
            });
            if (!res.ok) {
              const j = (await res.json().catch(() => ({}))) as { error?: string };
              throw new Error(j.error ?? `${res.status}`);
            }
            onAfterSend();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ''}
        description={confirm?.description}
        confirmLabel={confirm?.confirmLabel ?? 'Confirm'}
        tone={confirm?.tone ?? 'default'}
        busy={
          confirm?.busyKey === 'archive'
            ? actionBusy === 'archive'
            : actionBusy === 'spam'
        }
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return;
          setActionBusy(confirm.busyKey);
          try {
            await confirm.run();
            setConfirm(null);
          } finally {
            setActionBusy(null);
          }
        }}
      />
    </div>
  );
}

function MenuItem({
  Icon,
  label,
  onClick,
  tone,
  busy,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  tone?: 'danger';
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        'w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs',
        tone === 'danger'
          ? 'text-red-300 hover:bg-red-500/[0.08]'
          : 'text-white/80 hover:bg-white/[0.06]',
      )}
    >
      {busy ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <Icon className="w-3 h-3" />
      )}
      {label}
    </button>
  );
}

function confirmDelete(prompt: string): boolean {
  if (typeof window === 'undefined') return true;
  return window.confirm(prompt);
}

function ThreadSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'animate-pulse flex gap-2',
            i % 2 === 0 ? 'self-start' : 'self-end flex-row-reverse',
          )}
        >
          <div className="w-7 h-7 rounded-full bg-white/[0.06]" />
          <div className="rounded-2xl bg-white/[0.04] h-12 w-72" />
        </div>
      ))}
    </div>
  );
}

function groupByDay(messages: Message[]): Array<{ label: string; messages: Message[] }> {
  const groups: Array<{ label: string; messages: Message[] }> = [];
  for (const m of messages) {
    const label = dayLabel(m.sentAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.messages.push(m);
    else groups.push({ label, messages: [m] });
  }
  return groups;
}
