/**
 * Shared footer rendered on every authenticated page (in `app/(app)/layout.tsx`)
 * and the marketing landing page. Surfaces the two upstream brands and the
 * Repull Community License hyperlink.
 */

const LICENSE_URL =
  'https://github.com/ivannikolovbg/repull-channel-manager/blob/main/LICENSE.md';

export function AppFooter() {
  return (
    <div className="px-6 py-3 border-t border-white/[0.06] text-[11px] muted flex items-center justify-between">
      <div>
        Powered by{' '}
        <a
          className="underline decoration-dotted hover:text-white"
          href="https://repull.dev"
          target="_blank"
          rel="noopener noreferrer"
        >
          Repull
        </a>{' '}
        &middot; AI features powered by{' '}
        <a
          className="underline decoration-dotted hover:text-white"
          href="https://vanio.ai"
          target="_blank"
          rel="noopener noreferrer"
        >
          Vanio AI
        </a>{' '}
        &middot; Pricing intelligence by{' '}
        <a
          className="underline decoration-dotted hover:text-white"
          href="https://github.com/ivannikolovbg/repull-revenue"
          target="_blank"
          rel="noopener noreferrer"
        >
          repull-revenue
        </a>{' '}
        &middot;{' '}
        <a
          className="underline decoration-dotted hover:text-white"
          href={LICENSE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Repull Community License
        </a>
      </div>
      <div className="opacity-60">v0.1.0-alpha</div>
    </div>
  );
}
