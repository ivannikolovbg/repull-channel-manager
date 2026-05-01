'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Calendar,
  Cog,
  Home,
  LayoutGrid,
  ListChecks,
  MessageSquare,
  Plug,
  Star,
} from 'lucide-react';
import { cn } from '@/core/lib/cn';

interface NavItem {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** Optional badge number (rendered when > 0). */
  badge?: number;
}

export function Sidebar({
  workspaceName,
  unreadMessages = 0,
}: {
  workspaceName: string;
  unreadMessages?: number;
}) {
  const pathname = usePathname();
  const NAV: NavItem[] = [
    { href: '/dashboard', label: 'Dashboard', Icon: Home },
    { href: '/connections', label: 'Connections', Icon: Plug },
    { href: '/listings', label: 'Listings', Icon: LayoutGrid },
    { href: '/reservations', label: 'Reservations', Icon: ListChecks },
    { href: '/messages', label: 'Messages', Icon: MessageSquare, badge: unreadMessages },
    { href: '/reviews', label: 'Reviews', Icon: Star },
    { href: '/settings', label: 'Settings', Icon: Cog },
  ];
  return (
    <aside className="w-60 shrink-0 border-r border-white/[0.06] flex flex-col">
      <div className="px-4 py-4 border-b border-white/[0.06]">
        <div className="text-xs uppercase tracking-[0.2em]" style={{ color: '#ff7a2b' }}>
          repull · channel mgr
        </div>
        <div className="text-sm font-medium mt-1 truncate">{workspaceName}</div>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {NAV.map(({ href, label, Icon, badge }) => {
          const active = pathname === href || pathname?.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm',
                active
                  ? 'bg-repull/10 text-white'
                  : 'text-white/70 hover:text-white hover:bg-white/[0.04]',
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="flex-1">{label}</span>
              {badge && badge > 0 ? (
                <span
                  className={cn(
                    'min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-semibold flex items-center justify-center',
                    active
                      ? 'bg-white/20 text-white'
                      : 'bg-[#ff7a2b]/20 text-[#ff9c5a]',
                  )}
                >
                  {badge > 99 ? '99+' : badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-white/[0.06] text-xs muted leading-relaxed">
        <div className="flex items-center gap-2">
          <Calendar className="w-3 h-3" />
          Powered by{' '}
          <a
            className="underline decoration-dotted hover:text-white"
            href="https://repull.dev"
            target="_blank"
            rel="noopener noreferrer"
          >
            Repull
          </a>
        </div>
        <div className="mt-1 pl-5">
          AI features powered by{' '}
          <a
            className="underline decoration-dotted hover:text-white"
            href="https://vanio.ai"
            target="_blank"
            rel="noopener noreferrer"
          >
            Vanio AI
          </a>
        </div>
        <div className="mt-1 pl-5">
          <a
            className="underline decoration-dotted hover:text-white"
            href="https://github.com/ivannikolovbg/repull-channel-manager/blob/main/LICENSE.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            Repull Community License
          </a>
        </div>
      </div>
    </aside>
  );
}
