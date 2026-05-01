'use client';

import { Sparkles } from 'lucide-react';
import { cn } from '@/core/lib/cn';

export interface Suggestion {
  tone: 'warm' | 'concise';
  label: string;
  rationale: string;
  body: string;
  source: 'repull-ai' | 'fallback';
}

export function SuggestionCard({
  suggestion,
  onInsert,
  className,
}: {
  suggestion: Suggestion;
  onInsert: (body: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        suggestion.tone === 'warm'
          ? 'border-rose-500/20 bg-rose-500/[0.04]'
          : 'border-sky-500/20 bg-sky-500/[0.04]',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
          <Sparkles className="w-3 h-3 text-repull" />
          {suggestion.label}
        </div>
        <span className="text-[10px] muted uppercase tracking-wide">
          {suggestion.source === 'repull-ai' ? 'AI' : 'Template'}
        </span>
      </div>
      <p className="text-[11px] muted mt-1">{suggestion.rationale}</p>
      <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">{suggestion.body}</p>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          className="btn btn-ghost text-xs"
          onClick={() => onInsert(suggestion.body)}
        >
          Insert into composer
        </button>
      </div>
    </div>
  );
}
