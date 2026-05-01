'use client';

import { Loader2, Send, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/core/lib/cn';
import type { SuggestionsResponse } from './types';

const DRAFT_AUTOSAVE_MS = 700;

export function ComposeBox({
  conversationId,
  onSend,
  textareaRef,
}: {
  conversationId: string;
  onSend: (body: string) => Promise<void>;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? localRef;
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionsResponse | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset on conversation change + load draft.
  useEffect(() => {
    let cancelled = false;
    setBody('');
    setSuggestions(null);
    setError(null);
    setDraftLoaded(false);
    void (async () => {
      try {
        const res = await fetch(`/api/messages/${conversationId}/draft`);
        if (!res.ok) return;
        const json = (await res.json()) as { body?: string };
        if (cancelled) return;
        setBody(json.body ?? '');
      } finally {
        if (!cancelled) setDraftLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Autosave draft as the user types (debounced).
  useEffect(() => {
    if (!draftLoaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void fetch(`/api/messages/${conversationId}/draft`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body }),
      }).catch(() => undefined);
    }, DRAFT_AUTOSAVE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [body, conversationId, draftLoaded]);

  const handleSend = async () => {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(trimmed);
      setBody('');
      setSuggestions(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const handleSuggest = async () => {
    if (suggesting) return;
    setSuggesting(true);
    setError(null);
    try {
      const res = await fetch(`/api/messages/${conversationId}/suggest-reply`, {
        method: 'POST',
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `${res.status}`);
      }
      const json = (await res.json()) as SuggestionsResponse;
      setSuggestions(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className="border-t border-white/[0.06] p-3 space-y-2">
      {suggestions && suggestions.suggestions.length > 0 ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] muted">
            <Sparkles className="w-3 h-3" />
            <span>Powered by Vanio AI</span>
            {suggestions.provider !== 'vanio' ? (
              <span className="text-white/30">· via {suggestions.provider}</span>
            ) : null}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
            {suggestions.suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setBody(s);
                  setSuggestions(null);
                  ref.current?.focus();
                }}
                className="text-left text-xs leading-relaxed rounded-md border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.16] px-2.5 py-2 line-clamp-3"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="text-xs text-red-300 bg-red-500/[0.06] border border-red-500/20 rounded-md px-2 py-1.5">
          {error}
        </div>
      ) : null}
      <div className="rounded-lg border border-white/[0.1] bg-black/40 focus-within:border-[#ff7a2b]/60 transition-colors">
        <textarea
          ref={ref}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a reply… (Cmd/Ctrl + Enter to send)"
          rows={3}
          data-shortcut-target="compose"
          className="w-full bg-transparent border-0 outline-none px-3 py-2.5 text-sm resize-none placeholder:text-white/30"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        <div className="flex items-center gap-2 border-t border-white/[0.06] px-2 py-1.5">
          <button
            type="button"
            onClick={handleSuggest}
            disabled={suggesting}
            className={cn(
              'btn btn-ghost text-xs h-8 px-2.5',
              suggesting ? 'opacity-60' : '',
            )}
            title="Ask Vanio AI for 3 reply variants"
          >
            {suggesting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            Suggest reply
          </button>
          <div className="flex-1" />
          <span className="text-[10px] muted hidden md:inline">
            <kbd className="border border-white/10 rounded px-1 py-0.5">⌘</kbd>
            +
            <kbd className="border border-white/10 rounded px-1 py-0.5">Enter</kbd>
          </span>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || body.trim().length === 0}
            className="btn btn-primary text-xs h-8 px-3"
          >
            {sending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Send className="w-3 h-3" />
            )}
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
