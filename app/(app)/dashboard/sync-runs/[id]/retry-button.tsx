'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function RetrySyncButton({ kind }: { kind: 'full' | 'incremental' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `${res.status}`);
      startTransition(() => router.push('/dashboard'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button className="btn btn-primary" onClick={retry} disabled={busy || pending}>
        {busy ? 'Retrying…' : `Re-run ${kind} sync`}
      </button>
      {error ? (
        <div className="text-xs text-red-300 font-mono whitespace-pre-wrap">{error}</div>
      ) : null}
    </div>
  );
}
