'use client';

import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '@/core/lib/cn';

/**
 * Lightweight confirm dialog. Used in place of `window.confirm()` so
 * destructive actions (archive, mark spam) get a polished review step.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  busy = false,
  tone = 'default',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border border-white/[0.1] bg-[#141414] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <div className="text-sm font-semibold">{title}</div>
          {description ? (
            <div className="text-xs muted mt-1.5 leading-relaxed">{description}</div>
          ) : null}
        </div>
        <div className="px-5 py-3 flex items-center justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost text-xs h-8 px-3"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md text-xs font-medium h-8 px-3 border',
              tone === 'danger'
                ? 'bg-red-500/10 text-red-300 border-red-500/20 hover:bg-red-500/20'
                : 'bg-[#ff7a2b] text-[#0a0a0a] border-transparent hover:bg-[#ff8a45]',
              busy ? 'opacity-60 cursor-not-allowed' : '',
            )}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
