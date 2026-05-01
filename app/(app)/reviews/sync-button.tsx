'use client';

import { Loader2, RefreshCw } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function SyncReviewsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function sync() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/reviews/sync', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `${res.status}`);
      startTransition(() => router.refresh());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn btn-ghost"
        onClick={sync}
        disabled={busy || pending}
      >
        {busy || pending ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <RefreshCw className="w-3 h-3" />
        )}
        {busy ? 'Syncing reviews…' : 'Sync reviews'}
      </button>
      {error ? (
        <span className="text-[10px] text-red-300 font-mono max-w-[260px] truncate">
          {error}
        </span>
      ) : null}
    </div>
  );
}
