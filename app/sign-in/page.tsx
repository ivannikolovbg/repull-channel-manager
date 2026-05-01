import { signIn } from '@/core/lib/auth';

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

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="card p-6 max-w-sm w-full">
        <div className="text-xs uppercase tracking-[0.2em]" style={{ color: '#ff7a2b' }}>
          repull
        </div>
        <h1 className="text-2xl font-semibold mt-2">Sign in</h1>
        <p className="muted text-sm mt-1">
          We&apos;ll email you a magic link. No password. New here? An account is created automatically.
        </p>

        <form action={submit} className="mt-5 space-y-3">
          <input
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            className="input"
            autoComplete="email"
          />
          <button type="submit" className="btn btn-primary w-full justify-center">
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
