import { eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { workspaces } from '@/core/db/schema';
import { encryptApiKey } from '@/core/lib/crypto';
import { requireSessionWorkspace } from '@/core/lib/session';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const ctx = await requireSessionWorkspace();

  async function saveName(formData: FormData) {
    'use server';
    const inner = await requireSessionWorkspace();
    const name = String(formData.get('name') ?? '').trim();
    if (!name) return;
    await db
      .update(workspaces)
      .set({ name, updatedAt: new Date() })
      .where(eq(workspaces.id, inner.workspace.id));
    revalidatePath('/settings');
    revalidatePath('/dashboard');
  }

  async function saveKey(formData: FormData) {
    'use server';
    const inner = await requireSessionWorkspace();
    const key = String(formData.get('apiKey') ?? '').trim();
    if (!key) return;
    const { value, encrypted } = encryptApiKey(key);
    await db
      .update(workspaces)
      .set({ repullApiKey: value, repullApiKeyEncrypted: encrypted, updatedAt: new Date() })
      .where(eq(workspaces.id, inner.workspace.id));
    revalidatePath('/settings');
    revalidatePath('/connections');
  }

  async function clearKey() {
    'use server';
    const inner = await requireSessionWorkspace();
    await db
      .update(workspaces)
      .set({ repullApiKey: null, repullApiKeyEncrypted: false, updatedAt: new Date() })
      .where(eq(workspaces.id, inner.workspace.id));
    revalidatePath('/settings');
    revalidatePath('/connections');
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="muted text-sm mt-1">Workspace name + Repull API key.</p>
      </div>

      <form className="card p-5 space-y-3" action={saveName}>
        <div className="text-sm font-medium">Workspace</div>
        <div className="text-xs muted">slug: {ctx.workspace.slug}</div>
        <input
          type="text"
          name="name"
          defaultValue={ctx.workspace.name}
          className="input"
          required
        />
        <button type="submit" className="btn btn-ghost">
          Save name
        </button>
      </form>

      <form className="card p-5 space-y-3" action={saveKey}>
        <div className="text-sm font-medium">Repull API key</div>
        <p className="text-xs muted">
          {ctx.workspace.hasApiKey
            ? 'A key is currently set. Re-enter to replace; never displayed back.'
            : 'No key set. Get one from your Repull dashboard.'}
        </p>
        <input
          type="password"
          name="apiKey"
          placeholder={ctx.workspace.hasApiKey ? '•••••••• (set)' : 'sk_test_...'}
          className="input"
          autoComplete="off"
        />
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary">
            Save key
          </button>
          {ctx.workspace.hasApiKey ? (
            <button formAction={clearKey} className="btn btn-ghost text-xs">
              Remove
            </button>
          ) : null}
        </div>
      </form>

      <div className="card p-5 text-xs muted space-y-2">
        <div className="text-sm font-medium text-white">About this template</div>
        <p>
          Open-source Repull starter. v0.1.0-alpha. Source on{' '}
          <a
            className="underline decoration-dotted hover:text-white"
            href="https://github.com/ivannikolovbg/repull-channel-manager"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          .
        </p>
        <p>
          Powered by{' '}
          <a
            className="underline decoration-dotted hover:text-white"
            href="https://repull.dev"
            target="_blank"
            rel="noopener noreferrer"
          >
            Repull
          </a>
          . AI features powered by{' '}
          <a
            className="underline decoration-dotted hover:text-white"
            href="https://vanio.ai"
            target="_blank"
            rel="noopener noreferrer"
          >
            Vanio AI
          </a>
          . License: Repull Community License (Llama-style threshold).
        </p>
      </div>
    </div>
  );
}
