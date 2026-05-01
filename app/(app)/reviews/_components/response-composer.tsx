'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/core/lib/cn';
import { ConfirmDialog } from './confirm-dialog';
import { SuggestionCard, type Suggestion } from './suggestion-card';

interface Props {
  reviewId: string;
  platform: string;
  initialBody: string;
  initialSubmitted: boolean;
  /** Already-submitted response timestamp — disables the editor when present. */
  submittedAt: string | null;
}

const PLATFORM_LIMITS: Record<string, number> = {
  airbnb: 1000,
  booking: 1500,
  'booking.com': 1500,
  vrbo: 1000,
  direct: 2000,
  website: 2000,
};

export function ResponseComposer({
  reviewId,
  platform,
  initialBody,
  initialSubmitted,
  submittedAt,
}: Props) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submittedNow, setSubmittedNow] = useState(initialSubmitted);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const limit = PLATFORM_LIMITS[platform.toLowerCase()] ?? 1000;
  const overLimit = body.length > limit;
  const disabled = submittedNow || !!submittedAt;

  // Keyboard shortcut: `r` from list page lands on `#respond` and we focus
  // the textarea on mount when the hash matches.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#respond' && !disabled) {
      textareaRef.current?.focus();
    }
  }, [disabled]);

  const saveDraft = useCallback(async () => {
    if (saving || disabled) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/draft`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `${res.status}`);
      setSavedAt(new Date());
    } catch (err) {
      setError(`Save failed: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [reviewId, body, saving, disabled]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/respond`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `${res.status}`);
      if (json.channelError) {
        setError(`Saved locally — channel returned: ${json.channelError}`);
      } else if (json.submitted) {
        setSubmittedNow(true);
      }
      setConfirmOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function fetchSuggestions() {
    setSuggestionsLoading(true);
    setSuggestions(null);
    setError(null);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/suggest-reply`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `${res.status}`);
      setSuggestions((json.suggestions ?? []) as Suggestion[]);
    } catch (err) {
      setError(`Suggestions failed: ${(err as Error).message}`);
    } finally {
      setSuggestionsLoading(false);
    }
  }

  function insertSuggestion(text: string) {
    setBody(text);
    // Persist immediately as an AI-sourced draft so the user doesn't lose it.
    void (async () => {
      try {
        await fetch(`/api/reviews/${reviewId}/draft`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ body: text, source: 'ai-suggested' }),
        });
        setSavedAt(new Date());
      } catch {
        /* swallow — user can save manually */
      }
    })();
    textareaRef.current?.focus();
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4" id="respond">
      <section className="card p-5 lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Your response</div>
          <div className="text-[10px] muted">
            {disabled
              ? `Submitted ${submittedAt ? new Date(submittedAt).toLocaleString() : 'just now'}`
              : savedAt
                ? `Draft saved ${savedAt.toLocaleTimeString()}`
                : 'Autosaves on blur'}
          </div>
        </div>

        <textarea
          ref={textareaRef}
          className="input min-h-[180px] font-sans leading-relaxed resize-y"
          value={body}
          disabled={disabled}
          placeholder="Write a thoughtful response — your guests can read this on the listing."
          onChange={(e) => setBody(e.target.value)}
          onBlur={saveDraft}
        />

        <div className="flex items-center justify-between text-[10px]">
          <span className={cn('muted', overLimit && 'text-red-300')}>
            {body.length} / {limit} chars
            {overLimit ? ` · ${platform} cap exceeded` : ''}
          </span>
          {error ? <span className="text-red-300 font-mono">{error}</span> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/[0.06]">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={saveDraft}
            disabled={disabled || saving || !body}
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            Save draft
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setConfirmOpen(true)}
            disabled={disabled || !body || overLimit || submitting}
          >
            {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            Submit to {platformLabel(platform)}
          </button>
          <div className="ml-auto text-[10px] muted">
            Responses post publicly — they cannot be edited after submission on most platforms.
          </div>
        </div>
      </section>

      <aside className="card p-5 space-y-3 lg:col-span-1">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-repull" />
            AI suggestions
          </div>
          <span className="text-[10px] muted uppercase tracking-wide">Powered by Vanio AI</span>
        </div>
        <p className="text-xs muted leading-relaxed">
          We&apos;ll draft two variants — pick one, edit, and send. We never auto-submit.
        </p>
        <button
          type="button"
          className="btn btn-ghost w-full"
          onClick={fetchSuggestions}
          disabled={suggestionsLoading || disabled}
        >
          {suggestionsLoading ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" /> Generating…
            </>
          ) : suggestions ? (
            'Regenerate'
          ) : (
            'Suggest reply'
          )}
        </button>
        {suggestionsLoading ? (
          <div className="space-y-3">
            <SuggestionSkeleton />
            <SuggestionSkeleton />
          </div>
        ) : suggestions ? (
          <div className="space-y-3">
            {suggestions.map((s) => (
              <SuggestionCard key={s.tone} suggestion={s} onInsert={insertSuggestion} />
            ))}
          </div>
        ) : null}
      </aside>

      <ConfirmDialog
        open={confirmOpen}
        title={`Submit response to ${platformLabel(platform)}?`}
        description={
          <>
            Your reply will be visible to anyone who reads this review. On most platforms
            responses cannot be edited or deleted once submitted. Make sure you&apos;re
            ready before continuing.
          </>
        }
        confirmLabel="Submit response"
        cancelLabel="Keep editing"
        busy={submitting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleSubmit}
      />
    </div>
  );
}

function SuggestionSkeleton() {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 animate-pulse">
      <div className="h-3 w-24 bg-white/10 rounded" />
      <div className="h-2 w-32 bg-white/10 rounded mt-2" />
      <div className="h-3 w-full bg-white/10 rounded mt-4" />
      <div className="h-3 w-11/12 bg-white/10 rounded mt-2" />
      <div className="h-3 w-3/4 bg-white/10 rounded mt-2" />
    </div>
  );
}

function platformLabel(platform: string): string {
  const key = platform.toLowerCase();
  if (key === 'airbnb') return 'Airbnb';
  if (key === 'booking' || key === 'booking.com') return 'Booking.com';
  if (key === 'vrbo') return 'VRBO';
  if (key === 'direct') return 'Direct';
  if (key === 'website') return 'Website';
  return platform;
}
