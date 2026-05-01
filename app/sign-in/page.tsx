import { signIn } from '@/core/lib/auth';
import { cn } from '@/core/lib/cn';

export const dynamic = 'force-dynamic';

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  return <SignInBody searchParamsPromise={searchParams} />;
}

async function SignInBody({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const sp = await searchParamsPromise;
  const error = sp.error;
  const callbackUrl = sp.callbackUrl ?? '/dashboard';

  async function submit(formData: FormData) {
    'use server';
    const email = String(formData.get('email') ?? '').trim().toLowerCase();
    if (!email) return;
    await signIn('email', { email, redirectTo: callbackUrl });
  }

  const demoEnabled = process.env.DEMO_SIGNIN !== 'off';

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="card p-6 max-w-sm w-full">
        <div className="text-xs uppercase tracking-[0.2em]" style={{ color: '#ff7a2b' }}>
          repull
        </div>
        <h1 className="text-2xl font-semibold mt-2">Sign in</h1>
        <p className="muted text-sm mt-1">
          We&apos;ll email you a magic link. No password. New here? An account is created
          automatically.
        </p>

        {demoEnabled ? (
          <form method="POST" action="/api/auth/demo-signin" className="mt-5">
            <button type="submit" className="btn btn-primary w-full justify-center">
              Sign in as demo
            </button>
            <p className="text-[11px] muted mt-2 text-center">
              One-click access to a pre-seeded workspace with 50 listings &amp; ~200 reservations.
              No email required.
            </p>
          </form>
        ) : null}

        {demoEnabled ? (
          <div className="my-5 flex items-center gap-3">
            <div className="flex-1 h-px bg-white/[0.08]" />
            <div className="text-[11px] muted uppercase tracking-wider">or use your email</div>
            <div className="flex-1 h-px bg-white/[0.08]" />
          </div>
        ) : null}

        <form action={submit} className={demoEnabled ? 'space-y-3' : 'mt-5 space-y-3'}>
          <input
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            className="input"
            autoComplete="email"
          />
          <button
            type="submit"
            className={cn(
              'w-full justify-center',
              demoEnabled ? 'btn btn-ghost' : 'btn btn-primary',
            )}
          >
            Email me a sign-in link
          </button>
        </form>

        {error ? (
          <div className="mt-4 text-xs text-red-400 font-mono">
            {error}
          </div>
        ) : null}

        <div className="mt-6 text-xs muted">
          In local dev with no <code>EMAIL_SERVER</code> configured, the magic link is printed to the
          server console.
        </div>
      </div>
    </main>
  );
}
