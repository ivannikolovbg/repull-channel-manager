'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Connection } from '@/core/db/schema';

export function ConnectionsClient({
  initial,
  hasApiKey,
}: {
  initial: Connection[];
  hasApiKey: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function openConnectPicker() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}), // empty body → multi-channel picker
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `${res.status}`);
      // The picker URL is hosted at connect.repull.dev/{sessionId}; open in the
      // same tab and the user is bounced back to /connections/return after they
      // finish (or cancel) the per-provider flow.
      window.location.href = json.url;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function disconnect(id: string) {
    if (!confirm('Disconnect this channel?')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/connections?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `${res.status}`);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Connections</h1>
          <p className="muted text-sm mt-1">
            One row per linked channel account (Airbnb host, Booking property, …). Click below
            to open the Repull channel picker and pick from every supported channel.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={openConnectPicker}
          disabled={busy || pending || !hasApiKey}
        >
          {busy ? 'Opening picker…' : 'Connect a channel'}
        </button>
      </div>

      {!hasApiKey ? (
        <div className="card p-4 text-sm text-amber-200 bg-amber-500/[0.06] border-amber-500/20">
          Add your Repull API key in{' '}
          <a href="/settings" className="underline decoration-dotted">
            Settings
          </a>{' '}
          first.
        </div>
      ) : null}

      {error ? (
        <div className="card p-4 text-sm text-red-300 bg-red-500/[0.06] border-red-500/20 font-mono whitespace-pre-wrap">
          {error}
        </div>
      ) : null}

      {initial.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="text-sm font-medium">No connections yet</div>
          <p className="muted text-sm mt-2 max-w-md mx-auto">
            Click <em>Connect a channel</em> above. The Repull picker shows every supported
            provider (Airbnb, Booking, VRBO, Hostaway, Guesty, and more) — pick one, finish the
            consent flow, and we&apos;ll bounce you back here. Listings and reservations sync
            automatically.
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {initial.map((c) => {
            const host = (c.hostMetadata ?? {}) as {
              avatarUrl?: string | null;
              displayName?: string | null;
              displayNameLong?: string | null;
              activationStatus?: string | null;
            };
            return (
              <div key={c.id} className="card p-4 flex items-start gap-3">
                {host.avatarUrl ? (
                  // Avatar from Repull host metadata
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={host.avatarUrl}
                    alt={host.displayName ?? c.provider}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-sm uppercase">
                    {c.provider.slice(0, 2)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {host.displayNameLong ?? host.displayName ?? c.externalAccountId ?? c.provider}
                  </div>
                  <div className="text-xs muted font-mono mt-0.5">
                    {c.provider} · {c.status}
                    {host.activationStatus ? ` · ${host.activationStatus}` : ''}
                  </div>
                  {c.lastSyncedAt ? (
                    <div className="text-xs muted mt-1">
                      last sync {new Date(c.lastSyncedAt).toLocaleString()}
                    </div>
                  ) : null}
                </div>
                <button
                  className="btn btn-ghost text-xs"
                  onClick={() => disconnect(c.id)}
                  disabled={busy}
                >
                  Disconnect
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
