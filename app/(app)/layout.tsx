import { Sidebar } from '@/core/components/sidebar';
import { SignOutButton } from '@/core/components/sign-out-button';
import { requireSessionWorkspace } from '@/core/lib/session';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireSessionWorkspace();
  return (
    <div className="min-h-screen flex">
      <Sidebar workspaceName={ctx.workspace.name} />
      <div className="flex-1 flex flex-col">
        <header className="px-6 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <div className="text-xs muted">
            Signed in as <span className="text-white/80">{ctx.email}</span>
          </div>
          <SignOutButton />
        </header>
        <main className="flex-1 p-6">{children}</main>
        {!ctx.workspace.hasApiKey ? (
          <div className="px-6 py-2 text-xs border-t border-amber-500/20 bg-amber-500/[0.06] text-amber-200">
            Heads up — no Repull API key set.{' '}
            <a className="underline decoration-dotted" href="/settings">
              Add one in settings
            </a>{' '}
            before connecting Airbnb.
          </div>
        ) : null}
      </div>
    </div>
  );
}
