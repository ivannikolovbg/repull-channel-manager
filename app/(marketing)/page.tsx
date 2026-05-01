import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="min-h-screen px-6 py-12 md:py-20 max-w-5xl mx-auto">
      <div className="text-xs uppercase tracking-[0.2em]" style={{ color: '#ff7a2b' }}>
        repull · channel manager starter
      </div>
      <h1 className="text-4xl md:text-6xl font-semibold mt-3 leading-tight">
        Ship your own channel manager.
        <br />
        <span className="muted font-normal">In a weekend.</span>
      </h1>
      <p className="muted mt-6 max-w-2xl text-lg">
        An opinionated, open-source starter on top of <code>@repull/sdk</code>. Auth, multi-tenant
        workspaces, listings sync, calendar, reservations table — all wired. Fork the repo, deploy
        to Vercel, paste your Repull API key, and you&apos;re live.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link href="/sign-in" className="btn btn-primary">
          Try the live demo
        </Link>
        <a
          href="https://github.com/ivannikolovbg/repull-channel-manager"
          className="btn btn-ghost"
          target="_blank"
          rel="noopener noreferrer"
        >
          View on GitHub
        </a>
        <a
          href="https://vercel.com/new/clone?repository-url=https://github.com/ivannikolovbg/repull-channel-manager"
          className="btn btn-ghost"
          target="_blank"
          rel="noopener noreferrer"
        >
          Deploy to Vercel
        </a>
      </div>
      <p className="muted text-xs mt-3">
        The demo loads a pre-seeded workspace with 50 mountain-rental listings and ~200
        reservations. One click, no email required.
      </p>

      <section className="mt-16 grid md:grid-cols-3 gap-4">
        <Tile title="Sync" body="Connect Airbnb via Repull's hosted OAuth. Listings + reservations + calendars land in your Postgres." />
        <Tile title="Multi-tenant" body="One workspace per signed-in user. Per-workspace API keys, encrypted at rest." />
        <Tile title="Hackable" body="Drizzle schema, plain Tailwind, no magic. Add messaging, dynamic pricing, your own UI." />
      </section>

      <section className="mt-16 card p-6">
        <div className="text-xs uppercase tracking-wide muted">Quick start</div>
        <pre className="mt-3 text-sm overflow-x-auto p-4 rounded-md bg-black/40 font-mono leading-relaxed">{`git clone https://github.com/ivannikolovbg/repull-channel-manager
cd repull-channel-manager
cp .env.example .env.local
docker compose up -d        # local Postgres
pnpm install && pnpm db:push
pnpm dev                    # http://localhost:3030`}</pre>
      </section>

      <footer className="mt-20 pt-6 border-t border-white/[0.06] text-xs muted">
        Powered by{' '}
        <a
          className="underline decoration-dotted hover:text-white"
          href="https://repull.dev"
          target="_blank"
          rel="noopener noreferrer"
        >
          Repull
        </a>{' '}
        &middot; Built by{' '}
        <a
          className="underline decoration-dotted hover:text-white"
          href="https://vanio.ai"
          target="_blank"
          rel="noopener noreferrer"
        >
          Vanio AI
        </a>
        .
      </footer>
    </main>
  );
}

function Tile({ title, body }: { title: string; body: string }) {
  return (
    <div className="card p-5">
      <div className="text-sm font-medium">{title}</div>
      <p className="muted text-sm mt-2">{body}</p>
    </div>
  );
}
